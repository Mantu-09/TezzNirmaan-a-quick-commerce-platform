// ────────────────────────────────────────────────────────────
// Admin Routes
// All routes: authenticate + requireRole('platform_admin')
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/admin.controller.js';
import {
  createShopSchema,
  createProductSchema,
  updateProductSchema,
  createRiderSchema,
  adminOrdersQuerySchema,
  adminShopsQuerySchema,
  adminProductsQuerySchema,
} from '../validators/admin.validators.js';

const router = Router();
const adminOnly = [authenticate, requireRole('platform_admin')];

// ── Shops ─────────────────────────────────────────────────
router.get ('/admin/shops',       ...adminOnly, validate(adminShopsQuerySchema, 'query'), c.getShops);
router.post('/admin/shops',       ...adminOnly, validate(createShopSchema), c.createShop);

// ── Orders ────────────────────────────────────────────────
router.get('/admin/orders',       ...adminOnly, validate(adminOrdersQuerySchema, 'query'), c.getAllOrders);

// ── Products (Master Catalog) ─────────────────────────────
router.get  ('/admin/products',     ...adminOnly, validate(adminProductsQuerySchema, 'query'), c.getProducts);
router.post ('/admin/products',     ...adminOnly, validate(createProductSchema), c.createProduct);
router.patch('/admin/products/:id', ...adminOnly, validate(updateProductSchema), c.updateProduct);

// ── Riders ────────────────────────────────────────────────
router.get ('/admin/riders',      ...adminOnly, c.getRiders);
router.post('/admin/riders',      ...adminOnly, validate(createRiderSchema), c.createRider);

// ── Analytics ─────────────────────────────────────────────
router.get('/admin/analytics/overview', ...adminOnly, c.getAnalyticsOverview);

export default router;
