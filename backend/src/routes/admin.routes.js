// ────────────────────────────────────────────────────────────
// Admin Routes — B2
// All routes: authenticate + requireRole('platform_admin')
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate }  from '../middleware/auth.js';
import { requireRole }   from '../middleware/authorize.js';
import { validate }      from '../middleware/validate.js';
import * as c            from '../controllers/admin.controller.js';
import * as cityCtrl    from '../controllers/city.controller.js'; // P4-4A
import * as promoCtrl    from '../controllers/promo.controller.js'; // P1-C
import { getPlatformAnalyticsHandler, getShopInterests, updateShopInterestStatus } from '../controllers/admin.controller.js'; // P4-1A
import {
  createShopSchema,
  createRiderSchema,
  createProductSchema,
  updateProductSchema,
  adminShopsQuerySchema,
  adminOrdersQuerySchema,
  adminProductsQuerySchema,
} from '../validators/admin.validators.js';
import * as cashbackCtrl from '../controllers/cashback.controller.js'; // P4-2B
import * as st           from '../controllers/settlement.controller.js'; // P4-4B

import * as b2bAdmin    from '../controllers/b2b.controller.js';
import * as jobsCtrl   from '../controllers/jobs.controller.js';    // P7-7
import * as payoutCtrl from '../controllers/payout.controller.js';  // P8-2
import * as campaignCtrl from '../controllers/campaign.controller.js'; // P8-3

const router   = Router();
const adminOnly = [authenticate, requireRole('platform_admin')];

// ── Shops ─────────────────────────────────────────────────────
router.get   ('/admin/shops',                ...adminOnly, validate(adminShopsQuerySchema, 'query'), c.getShops);
router.post  ('/admin/shops',                ...adminOnly, validate(createShopSchema), c.createShop);
router.get   ('/admin/shops/:shopId',        ...adminOnly, c.getShop);
router.patch ('/admin/shops/:shopId',        ...adminOnly, c.updateShop);
router.patch ('/admin/shops/:shopId/status', ...adminOnly, c.toggleShopStatus);

// ── Orders ────────────────────────────────────────────────────
router.get('/admin/orders', ...adminOnly, validate(adminOrdersQuerySchema, 'query'), c.getAllOrders);

// ── Products (Master Catalog) ─────────────────────────────────
router.get   ('/admin/products',     ...adminOnly, validate(adminProductsQuerySchema, 'query'), c.getProducts);
router.post  ('/admin/products',     ...adminOnly, validate(createProductSchema), c.createProduct);
router.patch ('/admin/products/:id', ...adminOnly, validate(updateProductSchema),  c.updateProduct);

// ── Riders ────────────────────────────────────────────────────
router.get  ('/admin/riders',                  ...adminOnly, c.getRiders);
router.post ('/admin/riders',                  ...adminOnly, validate(createRiderSchema), c.createRider);
router.patch('/admin/riders/:riderId',         ...adminOnly, c.updateRider);
router.post ('/admin/riders/:riderId/assign',  ...adminOnly, c.assignRiderToShop);

// ── Analytics ───────────────────────────────────────────────
router.get('/admin/analytics/overview',  ...adminOnly, c.getAnalyticsOverview);
router.get('/admin/analytics/platform',  ...adminOnly, getPlatformAnalyticsHandler); // P2-A
router.get('/admin/analytics/live',      ...adminOnly, c.getLiveAnalytics);           // P9-3

// ── Promo Codes (P1-C) ────────────────────────────────────────
router.get  ('/admin/promos',                    ...adminOnly, promoCtrl.listPromos);
router.post ('/admin/promos',                    ...adminOnly, promoCtrl.createPromo);
router.patch('/admin/promos/:promoId/toggle',    ...adminOnly, promoCtrl.togglePromo);

// ── Shop Interest Registrations (P4-1A) ──────────────────────
// Read and action shop owner pre-registration leads from /shop-signup
router.get  ('/admin/shop-interests',      ...adminOnly, getShopInterests);
router.patch('/admin/shop-interests/:id',  ...adminOnly, updateShopInterestStatus);

// ── Cashback Rules (P4-2B) ────────────────────────────────────
// GET    /admin/cashback/rules         — list all rules (active + inactive)
router.get   ('/admin/cashback/rules',             ...adminOnly, cashbackCtrl.getCashbackRules);
// POST   /admin/cashback/rules         — create a new tier or shop-specific rule
router.post  ('/admin/cashback/rules',             ...adminOnly, cashbackCtrl.createCashbackRule);
// PATCH  /admin/cashback/rules/:ruleId — update percent / active status / expiry
router.patch ('/admin/cashback/rules/:ruleId',     ...adminOnly, cashbackCtrl.updateCashbackRule);
// DELETE /admin/cashback/rules/:ruleId — soft delete (sets is_active=false)
router.delete('/admin/cashback/rules/:ruleId',     ...adminOnly, cashbackCtrl.deleteCashbackRule);
// GET    /admin/cashback/preview       — ?amount=<paise>&shop_id=<uuid>
router.get   ('/admin/cashback/preview',           ...adminOnly, cashbackCtrl.previewCashback);
// POST   /admin/cashback/cache/invalidate — force-refresh in-memory rule cache
router.post  ('/admin/cashback/cache/invalidate',  ...adminOnly, cashbackCtrl.invalidateCache);

// ── Cities (P4-4A) ────────────────────────────────────────────
// GET    /admin/cities              — list all cities with shop/order/GMV counts
router.get  ('/admin/cities',                      ...adminOnly, cityCtrl.listCities);
// GET    /admin/cities/:cityId      — per-city analytics (top shops, GMV, avg delivery time)
router.get  ('/admin/cities/:cityId',              ...adminOnly, cityCtrl.getCityAnalytics);
// PATCH  /admin/cities/:cityId/status — toggle is_active; auto-sets launch_date on first activation
router.patch('/admin/cities/:cityId/status',       ...adminOnly, cityCtrl.toggleCityStatus);
// POST   /admin/cities/:cityId/activate — idempotent activation + webhook notification
router.post ('/admin/cities/:cityId/activate',     ...adminOnly, cityCtrl.activateCity);

// ── Settlements (P4-4B) ───────────────────────────────────────
// GET   /admin/settlements/pending            — all pending/processing batches + total outstanding
// NOTE: /pending must come before /:batchId to avoid shadowing
router.get  ('/admin/settlements/pending',          ...adminOnly, st.listPendingSettlements);
// PATCH /admin/settlements/:batchId/paid      — mark paid, record txn ref, notify shop owner
router.patch('/admin/settlements/:batchId/paid',    ...adminOnly, st.markPaid);
// POST  /admin/settlements/generate           — manual settlement run (dev/backfill/off-cycle)
router.post ('/admin/settlements/generate',         ...adminOnly, st.triggerSettlement);

// ── Razorpay Route (P8-2) ──────────────────────────────────────────
// POST  /admin/shops/:shopId/route/setup        — create Razorpay linked account for shop
router.post ('/admin/shops/:shopId/route/setup',             ...adminOnly, payoutCtrl.setupLinkedAccount);
// NOTE: static sub-paths must come before /:id to avoid route shadowing
// GET   /admin/route/transfers/summary          — today's totals + shops on/off Route
router.get  ('/admin/route/transfers/summary',               ...adminOnly, payoutCtrl.getTransferSummary);
// GET   /admin/route/transfers/shop/:shopId     — per-shop transfer history (admin view)
router.get  ('/admin/route/transfers/shop/:shopId',          ...adminOnly, payoutCtrl.listShopTransfersAdmin);
// GET   /admin/route/transfers                  — all transfers (filterable: ?shopId&status&page)
router.get  ('/admin/route/transfers',                       ...adminOnly, payoutCtrl.listAllTransfers);
// POST  /admin/route/transfers/:id/reverse      — reverse a processed transfer
router.post ('/admin/route/transfers/:id/reverse',           ...adminOnly, payoutCtrl.reverseTransfer);

// ── B2B / Contractor Accounts (P6-6) ─────────────────────────────
// GET    /admin/b2b/applications?status=pending|verified|rejected
router.get  ('/admin/b2b/applications',                         ...adminOnly, b2bAdmin.listApplications);
// PATCH  /admin/b2b/applications/:id/approve  { creditLimitPaise, paymentTermsDays, discountPercent }
router.patch('/admin/b2b/applications/:contractorId/approve',   ...adminOnly, b2bAdmin.approveApplication);
// PATCH  /admin/b2b/applications/:id/reject   { reason }
router.patch('/admin/b2b/applications/:contractorId/reject',    ...adminOnly, b2bAdmin.rejectApplication);
// GET    /admin/b2b/outstanding  — overdue credit accounts
router.get  ('/admin/b2b/outstanding',                          ...adminOnly, b2bAdmin.listOutstanding);
// PATCH  /admin/b2b/orders/:b2bOrderId/paid  — mark credit payment received
router.patch('/admin/b2b/orders/:b2bOrderId/paid',              ...adminOnly, b2bAdmin.markPaid);

// ── Job Queue / DLQ Dashboard (P7-7) ─────────────────────────
// NOTE: /failed and /retry-all must come before /:jobId to avoid shadowing
router.get   ('/admin/jobs/failed',           ...adminOnly, jobsCtrl.getFailedJobs);
router.post  ('/admin/jobs/retry-all',        ...adminOnly, jobsCtrl.retryAllJobs);
router.post  ('/admin/jobs/:jobId/retry',     ...adminOnly, jobsCtrl.retryJob);
router.delete('/admin/jobs/:jobId',           ...adminOnly, jobsCtrl.discardJob);

// ── Push Campaigns (P8-3) ──────────────────────────────────────────
// NOTE: static sub-paths (/preview, /:id/schedule, etc.) MUST come before /:id
// GET    /admin/campaigns            — list (paged, ?status filter)
// POST   /admin/campaigns            — create draft
// GET    /admin/campaigns/preview    — audience size preview
// GET    /admin/campaigns/:id        — detail + stats
// PATCH  /admin/campaigns/:id        — update draft/scheduled
// POST   /admin/campaigns/:id/schedule   — set scheduled_at
// POST   /admin/campaigns/:id/send-now   — enqueue immediate send (202)
// POST   /admin/campaigns/:id/cancel     — cancel draft/scheduled
router.get  ('/admin/campaigns',                   ...adminOnly, campaignCtrl.listCampaigns);
router.post ('/admin/campaigns',                   ...adminOnly, campaignCtrl.createCampaign);
router.get  ('/admin/campaigns/preview',           ...adminOnly, campaignCtrl.previewAudience);
router.get  ('/admin/campaigns/:id',               ...adminOnly, campaignCtrl.getCampaign);
router.patch('/admin/campaigns/:id',               ...adminOnly, campaignCtrl.updateCampaign);
router.post ('/admin/campaigns/:id/schedule',      ...adminOnly, campaignCtrl.scheduleCampaign);
router.post ('/admin/campaigns/:id/send-now',      ...adminOnly, campaignCtrl.sendCampaignNow);
router.post ('/admin/campaigns/:id/cancel',        ...adminOnly, campaignCtrl.cancelCampaign);

export default router;
