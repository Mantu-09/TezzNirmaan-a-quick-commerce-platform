// ────────────────────────────────────────────────────────────
// Shop Dashboard Routes
// All routes: authenticate + requireRole + requireShopAccess
// requireShopAccess resolves and attaches req.shopId
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireRole, requireShopAccess } from '../middleware/authorize.js';
import * as c from '../controllers/shop.controller.js';
import * as r from '../controllers/rating.controller.js';
import * as a from '../controllers/analytics.controller.js'; // B5
import * as sl from '../controllers/slot.controller.js';    // B6
import * as bulk from '../controllers/bulk-inventory.controller.js'; // P1-D
import * as st from '../controllers/settlement.controller.js';        // P4-4B
import * as ai from '../controllers/ai.controller.js';                  // P5-2
import * as payout from '../controllers/payout.controller.js';         // P8-2
import {
  shopOrdersQuerySchema,
  rejectSubOrderSchema,
  assignRiderSchema,
  addToInventorySchema,
  updateInventoryItemSchema,
  bulkUpdateInventorySchema,
  inventoryQuerySchema,
  updateShopSettingsSchema,
} from '../validators/shop.validators.js';

const router = Router();

// Shared middleware for all shop routes
const shopAccess = [authenticate, requireRole('shop_owner', 'shop_staff'), requireShopAccess];
const ownerOnly  = [authenticate, requireRole('shop_owner'), requireShopAccess];

// ── Order Management ──────────────────────────────────────
router.get ('/shop/orders',                               ...shopAccess, validate(shopOrdersQuerySchema, 'query'), c.getShopOrders);
// P5-5C: CSV export — static path MUST come before /:subOrderId
router.get ('/shop/orders/export',                        ...shopAccess, c.exportShopOrders);
router.get ('/shop/orders/:subOrderId',                   ...shopAccess, c.getSubOrderDetail);
router.post('/shop/orders/:subOrderId/confirm',           ...shopAccess, c.confirmSubOrder);
router.post('/shop/orders/:subOrderId/reject',            ...shopAccess, validate(rejectSubOrderSchema), c.rejectSubOrder);
router.post('/shop/orders/:subOrderId/preparing',         ...shopAccess, c.markPreparing);
router.post('/shop/orders/:subOrderId/ready',             ...shopAccess, c.markReady);
router.post('/shop/orders/:subOrderId/assign-rider',      ...shopAccess, validate(assignRiderSchema), c.assignRider);

// ── Riders for this shop (scoped — replaces /admin/riders for shop dashboard) ──
router.get('/shop/riders', ...shopAccess, c.getShopRiders);

// ── Inventory Management ──────────────────────────
// Note: static paths (/bulk-template, /bulk-upload, /bulk-update) must be
// defined BEFORE /:inventoryId to avoid route shadowing.
router.get   ('/shop/inventory',                          ...shopAccess, validate(inventoryQuerySchema, 'query'), c.getInventory);
router.post  ('/shop/inventory',                          ...shopAccess, validate(addToInventorySchema), c.addToInventory);
router.patch ('/shop/inventory/bulk-update',              ...shopAccess, validate(bulkUpdateInventorySchema), c.bulkUpdateInventory);
// P1-D: CSV bulk upload (uses multer middleware — no JSON body validator)
router.get   ('/shop/inventory/bulk-template',            ...shopAccess, bulk.downloadTemplate);
router.post  ('/shop/inventory/bulk-upload',              ...shopAccess, bulk.uploadMiddleware, bulk.bulkUpload);
// Phase 12: Master Catalog Discovery — shop owners browse products not yet in their inventory
router.get   ('/shop/catalog',                            ...shopAccess, c.getMasterCatalog);
router.patch ('/shop/inventory/:inventoryId',             ...shopAccess, validate(updateInventoryItemSchema), c.updateInventoryItem);
router.delete('/shop/inventory/:inventoryId',             ...ownerOnly,  c.removeFromInventory);

// ── Shop Settings (owner only for write operations) ───────
router.get ('/shop/settings',                ...ownerOnly,  c.getShopSettings);
router.patch('/shop/settings',               ...ownerOnly,  validate(updateShopSettingsSchema), c.updateShopSettings);
router.post ('/shop/settings/toggle-orders', ...ownerOnly,  c.toggleOrders);

// ── B2: Onboarding endpoints (auth-only — no requireShopAccess) ──
// Used by mobile onboarding when shopId cookie not yet set
router.get  ('/shop/me', authenticate, requireRole('shop_owner'), c.getMyShop);
router.patch('/shop/me', authenticate, requireRole('shop_owner'), c.updateMyShop);

// B4: Shop Ratings (shop owner views/flags their ratings)
router.get  ('/shop/ratings',                    ...shopAccess, r.getMyShopRatings);
router.get  ('/shop/ratings/summary',            ...shopAccess, r.getMyShopRatingSummary);
router.patch('/shop/ratings/:ratingId/flag',     ...ownerOnly,  r.flagShopRating);

// B5: Shop Analytics
router.get('/shop/analytics', ...shopAccess, a.getShopAnalytics);

// B6: Delivery Slot Management
// NOTE: seed-defaults must come before /:templateId to avoid route shadowing
router.get   ('/shop/slots/templates',                 ...shopAccess, sl.getSlotTemplates);
router.post  ('/shop/slots/templates/seed-defaults',   ...ownerOnly,  sl.seedDefaultSlots);
router.post  ('/shop/slots/templates',                 ...ownerOnly,  sl.createSlotTemplate);
router.patch ('/shop/slots/templates/:templateId',     ...ownerOnly,  sl.updateSlotTemplate);
router.delete('/shop/slots/templates/:templateId',     ...ownerOnly,  sl.deleteSlotTemplate);
router.get   ('/shop/slots/bookings',                  ...shopAccess, sl.getSlotBookings);

// P4-4B: Settlement history (shop owner only)
router.get('/shop/settlements',            ...ownerOnly, st.getMySettlements);
router.get('/shop/settlements/:batchId',   ...ownerOnly, st.getSettlementDetail);

// P8-2: Bank account + Razorpay Route transfers (shop owner only)
// POST /shop/bank-account  — submit/update bank details (triggers Route setup)
// GET  /shop/bank-account  — view account details + verification status + Route status
// GET  /shop/route/transfers — own Route transfer history (replaces manual settlement wait)
router.post('/shop/bank-account',          ...ownerOnly, payout.saveBankAccount);
router.get ('/shop/bank-account',          ...ownerOnly, payout.getBankAccount);
router.get ('/shop/route/transfers',       ...ownerOnly, payout.getMyRouteTransfers);

// P5-2: AI Demand Forecast — shop owner only
// GET /shop/demand-forecast?days=7 — returns restock alerts + demand trend
// 30-min cache in Redis so Claude is called at most ~48 times/day per shop
router.get('/shop/demand-forecast', ...ownerOnly, ai.getDemandForecast);

// ── P6-3: Returns (shop dashboard) ───────────────────────────
import * as ret from '../controllers/return.controller.js';
import {
  approveReturnSchema,
  rejectReturnSchema,
} from '../validators/customer.validators.js';

// Shop-scoped return queue
router.get  ('/shop/returns',                      ...shopAccess, ret.listShopReturns);
router.get  ('/shop/returns/:returnId',             ...shopAccess, ret.getShopReturn);
// Financial actions: owner only
router.patch('/shop/returns/:returnId/approve',    ...ownerOnly,  validate(approveReturnSchema), ret.approveReturn);
router.patch('/shop/returns/:returnId/reject',     ...ownerOnly,  validate(rejectReturnSchema),  ret.rejectReturn);

// ── P7-5: CDN Image Upload (Presigned URL) ────────────────────
// POST /shop/images/upload-url → { upload_url, public_url, key }
// Client uploads bytes directly to R2 — never passes through Node.js
import * as img from '../controllers/image.controller.js';
router.post('/shop/images/upload-url', ...shopAccess, img.getImageUploadUrl);

// ── P17-2: Demand Forecast ────────────────────────────────────
// GET /shop/demand-forecast?days=7
router.get('/shop/demand-forecast', ...shopAccess, async (req, res, next) => {
  try {
    const days   = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);
    const shopId = req.shopId; // set by shopAccess middleware
    const { forecastDemand } = await import('../services/demand-forecast.service.js');
    const forecast = await forecastDemand(shopId, days);
    res.json({ success: true, data: { forecast, days, generated_at: new Date().toISOString() } });
  } catch (err) { next(err); }
});

// ── P19-2: Shop Revenue Trend ─────────────────────────────
// GET /shop/analytics/revenue-trend?days=7
router.get('/shop/analytics/revenue-trend', ...shopAccess, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const days   = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);
    const shopId = req.shopId;
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const date    = new Date();
      date.setDate(date.getDate() - i);
      const dayStr  = date.toISOString().slice(0, 10);
      const nextDay = new Date(date); nextDay.setDate(date.getDate() + 1);

      const { data: subOrders } = await supabaseAdmin
        .from('sub_orders')
        .select('id, total_paise')
        .eq('shop_id', shopId)
        .eq('status', 'delivered')
        .gte('updated_at', dayStr + 'T00:00:00')
        .lt('updated_at', nextDay.toISOString().slice(0, 10) + 'T00:00:00');

      const revenue = (subOrders || []).reduce((s, o) => s + (o.total_paise || 0), 0);
      result.push({ date: dayStr, revenue_paise: revenue, orders: (subOrders || []).length });
    }

    // Best sellers (top 5 products by units sold in the period)
    const startDate = new Date(); startDate.setDate(startDate.getDate() - days);
    const { data: bestItems } = await supabaseAdmin
      .from('order_items')
      .select('quantity, inventory:shop_inventory!inner(product:products(name, brand), shop_id)')
      .eq('inventory.shop_id', shopId)
      .gte('created_at', startDate.toISOString())
      .limit(200);

    const productMap = {};
    (bestItems || []).forEach(item => {
      const name = [item.inventory?.product?.brand, item.inventory?.product?.name].filter(Boolean).join(' ');
      productMap[name] = (productMap[name] || 0) + (item.quantity || 1);
    });
    const bestSellers = Object.entries(productMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, units]) => ({ name, units }));

    res.json({ success: true, data: { trend: result, best_sellers: bestSellers, days } });
  } catch (err) { next(err); }
});

// ── Phase C: Shop Staff Management ───────────────────────────
// GET  /shop/staff             — list all staff for this shop (owner only)
// PATCH /shop/staff/:staffId/toggle — activate / deactivate a staff member

router.get('/shop/staff', ...ownerOnly, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const shopId = req.shopId; // set by requireShopAccess

    // staff profiles linked to this shop via shop_staff_assignments or shop_id on profiles
    const { data: staff, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone, is_active, created_at')
      .eq('shop_id', shopId)
      .eq('role', 'shop_staff')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: { staff: staff || [], total: (staff || []).length },
    });
  } catch (err) { next(err); }
});

router.patch('/shop/staff/:staffId/toggle', ...ownerOnly, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { AppError }      = await import('../utils/errors.js');
    const shopId   = req.shopId;
    const staffId  = req.params.staffId;

    // Verify staff belongs to this shop
    const { data: staffMember, error: findErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, is_active, role, shop_id')
      .eq('id', staffId)
      .eq('shop_id', shopId)
      .eq('role', 'shop_staff')
      .maybeSingle();

    if (findErr) throw findErr;
    if (!staffMember) throw new AppError('Staff member not found in your shop', 404);

    const newStatus = !staffMember.is_active;

    // Update is_active in profiles
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('id', staffId);

    if (updateErr) throw updateErr;

    // Also disable Supabase Auth user if deactivating
    if (!newStatus) {
      await supabaseAdmin.auth.admin.updateUserById(staffId, { ban_duration: '8760h' })
        .catch(e => { /* non-fatal — profile flag is source of truth */ });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(staffId, { ban_duration: 'none' })
        .catch(e => {});
    }

    res.json({
      success: true,
      data: {
        id:        staffId,
        is_active: newStatus,
        message:   `${staffMember.full_name} has been ${newStatus ? 'activated' : 'deactivated'}`,
      },
    });
  } catch (err) { next(err); }
});

export default router;



