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

export default router;
