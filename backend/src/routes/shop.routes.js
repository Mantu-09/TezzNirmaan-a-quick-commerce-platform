// ────────────────────────────────────────────────────────────
// Shop Dashboard Routes
// All routes: authenticate + requireRole + requireShopAccess
// requireShopAccess resolves and attaches req.shopId
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requireShopAccess } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/shop.controller.js';
import * as r from '../controllers/rating.controller.js';
import * as a from '../controllers/analytics.controller.js'; // B5
import * as sl from '../controllers/slot.controller.js';    // B6
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
router.get ('/shop/orders/:subOrderId',                   ...shopAccess, c.getSubOrderDetail);
router.post('/shop/orders/:subOrderId/confirm',           ...shopAccess, c.confirmSubOrder);
router.post('/shop/orders/:subOrderId/reject',            ...shopAccess, validate(rejectSubOrderSchema), c.rejectSubOrder);
router.post('/shop/orders/:subOrderId/preparing',         ...shopAccess, c.markPreparing);
router.post('/shop/orders/:subOrderId/ready',             ...shopAccess, c.markReady);
router.post('/shop/orders/:subOrderId/assign-rider',      ...shopAccess, validate(assignRiderSchema), c.assignRider);

// ── Riders for this shop (scoped — replaces /admin/riders for shop dashboard) ──
router.get('/shop/riders', ...shopAccess, c.getShopRiders);

// ── Inventory Management ──────────────────────────────────
// Note: /bulk-update must be defined BEFORE /:inventoryId to avoid route conflict
router.get   ('/shop/inventory',                          ...shopAccess, validate(inventoryQuerySchema, 'query'), c.getInventory);
router.post  ('/shop/inventory',                          ...shopAccess, validate(addToInventorySchema), c.addToInventory);
router.patch ('/shop/inventory/bulk-update',              ...shopAccess, validate(bulkUpdateInventorySchema), c.bulkUpdateInventory);
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

export default router;


