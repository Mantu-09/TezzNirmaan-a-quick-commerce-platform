// ────────────────────────────────────────────────────────────
// Customer Routes
// Public: browse, categories
// Authenticated (customer): cart, orders, addresses, profile
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/customer.controller.js';
import * as ai from '../controllers/ai.controller.js';          // P5-2
import {
  nearbyShopsQuerySchema,
  browseProductsQuerySchema,
  addToCartSchema,
  updateCartItemSchema,
  previewOrderSchema,
  placeOrderSchema,
  placeBasketOrderSchema,
  cancelOrderSchema,
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
} from '../validators/customer.validators.js';
import * as r from '../controllers/rating.controller.js';
import { rateOrderSchema } from '../validators/customer.validators.js';
import * as slot from '../controllers/slot.controller.js'; // B6
import * as promo from '../controllers/promo.controller.js'; // P1-C

const router = Router();

// ── Browse & Search (public) ──────────────────────────────
router.get('/search',             c.searchProducts);        // B3: full search
router.get('/search/suggestions', c.getSearchSuggestions); // B3: autocomplete
// P5-2: AI-enhanced NL search — POST so the query doesn't hit URL length limits
// Parses Hinglish/natural-language and returns structured intent; client merges with B3 search
router.post('/search/ai',         authenticate, ai.aiSearch);
// P5-2: Personalised recommendations for the logged-in user at a given shop
router.get('/recommendations',    authenticate, ai.getRecommendations);
router.get('/shops/nearby',                           validate(nearbyShopsQuerySchema, 'query'), c.getNearbyShops);
router.get('/shops/:shopId',                          c.getShop);
router.get('/shops/:shopId/products',                 validate(browseProductsQuerySchema, 'query'), c.getProducts);
router.get('/shops/:shopId/products/:productId',      c.getProduct);

// B4: Ratings (public — no auth)
router.get('/shops/:shopId/ratings/summary',          r.getShopRatingSummary);
router.get('/shops/:shopId/ratings',                  r.getShopRatings);
// B6: Delivery slot availability (public — no auth)
router.get('/shops/:shopId/slots',                    slot.getAvailableSlots);
router.get('/categories',                             c.getCategories);


// ── Cart (customer) ───────────────────────────────────────
router.get   ('/cart',              authenticate, c.getCart);
router.post  ('/cart/items',        authenticate, validate(addToCartSchema), c.addToCart);
router.patch ('/cart/items/:itemId',authenticate, validate(updateCartItemSchema), c.updateCartItem);
router.delete('/cart/items/:itemId',authenticate, c.removeCartItem);
router.delete('/cart',              authenticate, c.clearCart);

// ── Checkout & Orders (customer) ─────────────────────────
router.post('/orders/preview',             authenticate, validate(previewOrderSchema), c.previewOrder);
// P4-3B: Basket checkout (multi-shop) — must be BEFORE /:orderId routes
router.post('/orders/basket/preview',      authenticate, validate(previewOrderSchema), c.previewBasket);
router.post('/orders/basket',              authenticate, validate(placeBasketOrderSchema), c.placeBasketOrder);
router.get ('/orders/baskets/:basketId',   authenticate, c.getBasket);
router.post('/orders',                     authenticate, validate(placeOrderSchema), c.placeOrder);
router.get ('/orders',                     authenticate, c.getOrders);
router.get ('/orders/:orderId',            authenticate, c.getOrder);
router.post('/orders/:orderId/cancel',     authenticate, validate(cancelOrderSchema), c.cancelOrder);
router.post('/orders/:orderId/reorder',    authenticate, c.reorder); // P2-D

// B4: Order ratings (authenticated customer)
router.post('/orders/:orderId/rate',          authenticate, validate(rateOrderSchema), r.rateOrder);
router.get ('/orders/:orderId/rating-status', authenticate, r.getRatingStatus);

// ── Addresses (customer) ──────────────────────────────────
router.get   ('/addresses',     authenticate, c.getAddresses);
router.post  ('/addresses',     authenticate, validate(createAddressSchema), c.createAddress);
router.patch ('/addresses/:id', authenticate, validate(updateAddressSchema), c.updateAddress);
router.delete('/addresses/:id', authenticate, c.deleteAddress);

// ── Profile (any authenticated user) ─────────────────────
router.get  ('/profile', authenticate, c.getProfile);
router.patch('/profile', authenticate, validate(updateProfileSchema), c.updateProfile);

// ── Notifications (B1) ───────────────────────────────────
router.get ('/notifications',                 authenticate, c.getNotifications);
router.post('/notifications/mark-read',       authenticate, c.markNotificationsRead);
router.post('/notifications/mark-all-read',   authenticate, c.markAllNotificationsRead);

// ── Promos (P1-C) ─────────────────────────────────────────
// POST /promos/validate — validates code + computes discount, authenticated so
// per-user limit can be checked server-side.
router.post('/promos/validate', authenticate, promo.validatePromo);

// ── Wallet (P3-C) ─────────────────────────────────────────
import * as wallet from '../controllers/wallet.controller.js';
// GET  /customer/wallet           → balance + transaction history
router.get ('/wallet',            authenticate, wallet.getWallet);
// POST /customer/wallet/applicable → max usable wallet amount for a given order total
router.post('/wallet/applicable', authenticate, wallet.getApplicableAmount);

// ── Referral (P4-2A) ────────────────────────────────────────
import { getReferralStats } from '../controllers/referral.controller.js';
// GET /customer/referral → code, share_url, stats, events list (lazy-creates code)
router.get('/referral', authenticate, getReferralStats);

// ── TezzNirmaan Pass / Subscription (P5-3) ──────────────────
import * as sub from '../controllers/subscription.controller.js';
// Plan catalogue (public — no auth — shown on plan-picker before login)
router.get ('/pass/plans',   sub.getPlans);
// Authenticated pass endpoints
router.get ('/pass',         authenticate, sub.getMySubscription);
router.post('/pass/purchase',authenticate, sub.purchasePass);
router.post('/pass/cancel',  authenticate, sub.cancelPass);

// ── Account Erasure (P5-4C) — GDPR / DPDP Act 2023 ─────────
// Required by Google Play Store (May 2024) and India's DPDP Act.
// Body: { confirmation: "DELETE MY ACCOUNT" }
import { deleteAccount } from '../controllers/account-erasure.controller.js';
router.delete('/account', authenticate, deleteAccount);

// ── P6-3: Returns & Refunds (customer) ───────────────────────
import * as ret from '../controllers/return.controller.js';
import {
  requestReturnSchema,
} from '../validators/customer.validators.js';

// Eligibility check — should show "Request Return" button?
router.get('/orders/sub/:subOrderId/return-eligibility',
  authenticate, ret.checkReturnEligibility);

// File a return for a delivered sub-order
router.post('/orders/sub/:subOrderId/return',
  authenticate, validate(requestReturnSchema), ret.requestReturn);

// Customer return history
router.get('/returns',             authenticate, ret.listCustomerReturns);
router.get('/returns/:returnId',   authenticate, ret.getCustomerReturn);

// ── P6-6: B2B / Contractor Accounts (customer) ───────────────
import * as b2bCtrl from '../controllers/b2b.controller.js';

// Apply for a contractor account
router.post('/b2b/apply',               authenticate, b2bCtrl.applyForContractor);
// Get contractor profile + credit status
router.get ('/b2b/profile',             authenticate, b2bCtrl.getContractorProfile);
// Checkout: get discount + credit availability for a given order total
router.get ('/b2b/benefits',            authenticate, b2bCtrl.getCheckoutBenefits);
// GST Invoices
router.get ('/b2b/invoices',            authenticate, b2bCtrl.listInvoices);
router.get ('/b2b/invoices/:invoiceId', authenticate, b2bCtrl.getInvoice);

export default router;

