// ────────────────────────────────────────────────────────────
// Customer Routes
// Public: browse, categories
// Authenticated (customer): cart, orders, addresses, profile
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/customer.controller.js';
import {
  nearbyShopsQuerySchema,
  browseProductsQuerySchema,
  addToCartSchema,
  updateCartItemSchema,
  previewOrderSchema,
  placeOrderSchema,
  cancelOrderSchema,
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
} from '../validators/customer.validators.js';

const router = Router();

// ── Browse & Search (public) ──────────────────────────────
router.get('/shops/nearby',                           validate(nearbyShopsQuerySchema, 'query'), c.getNearbyShops);
router.get('/shops/:shopId',                          c.getShop);
router.get('/shops/:shopId/products',                 validate(browseProductsQuerySchema, 'query'), c.getProducts);
router.get('/shops/:shopId/products/:productId',      c.getProduct);
router.get('/categories',                             c.getCategories);

// ── Cart (customer) ───────────────────────────────────────
router.get   ('/cart',              authenticate, c.getCart);
router.post  ('/cart/items',        authenticate, validate(addToCartSchema), c.addToCart);
router.patch ('/cart/items/:itemId',authenticate, validate(updateCartItemSchema), c.updateCartItem);
router.delete('/cart/items/:itemId',authenticate, c.removeCartItem);
router.delete('/cart',              authenticate, c.clearCart);

// ── Checkout & Orders (customer) ─────────────────────────
router.post('/orders/preview',         authenticate, validate(previewOrderSchema), c.previewOrder);
router.post('/orders',                 authenticate, validate(placeOrderSchema), c.placeOrder);
router.get ('/orders',                 authenticate, c.getOrders);
router.get ('/orders/:orderId',        authenticate, c.getOrder);
router.post('/orders/:orderId/cancel', authenticate, validate(cancelOrderSchema), c.cancelOrder);

// ── Addresses (customer) ──────────────────────────────────
router.get   ('/addresses',     authenticate, c.getAddresses);
router.post  ('/addresses',     authenticate, validate(createAddressSchema), c.createAddress);
router.patch ('/addresses/:id', authenticate, validate(updateAddressSchema), c.updateAddress);
router.delete('/addresses/:id', authenticate, c.deleteAddress);

// ── Profile (any authenticated user) ─────────────────────
router.get  ('/profile', authenticate, c.getProfile);
router.patch('/profile', authenticate, validate(updateProfileSchema), c.updateProfile);

export default router;
