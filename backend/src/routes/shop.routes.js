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

export default router;



