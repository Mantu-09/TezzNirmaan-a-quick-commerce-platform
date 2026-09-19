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
import { getPlatformAnalyticsHandler, getShopInterests, updateShopInterestStatus, createStaffAccount } from '../controllers/admin.controller.js'; // P4-1A / Phase E
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
import * as campaignCtrl    from '../controllers/campaign.controller.js'; // P8-3
import * as riderPayoutCtrl from '../controllers/rider-payout.controller.js'; // P10-5
import * as investorCtrl    from '../controllers/investor-analytics.controller.js'; // P10-6
import { generateInvestorToken } from '../services/investor-token.service.js';      // P11-5
import * as img from '../controllers/image.controller.js';                          // Phase 12


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
// NOTE: static routes (/categories, /brands) MUST be before /:id
router.get   ('/admin/products',          ...adminOnly, validate(adminProductsQuerySchema, 'query'), c.getProducts);
router.post  ('/admin/products',          ...adminOnly, validate(createProductSchema), c.createProduct);
router.get   ('/admin/products/:id',      ...adminOnly, c.getProductById);              // Phase 12
router.patch ('/admin/products/:id',      ...adminOnly, validate(updateProductSchema), c.updateProduct);
router.patch ('/admin/products/:id/archive', ...adminOnly, c.archiveProduct);           // Phase 12

// ── Categories CRUD (Session J) ──────────────────────────────
router.get   ('/admin/categories',     ...adminOnly, c.getAdminCategories);
router.post  ('/admin/categories',     ...adminOnly, c.createCategory);
router.patch ('/admin/categories/:id', ...adminOnly, c.updateCategory);
router.delete('/admin/categories/:id', ...adminOnly, c.deleteCategory);

// ── Brands CRUD (Session J) ──────────────────────────────────
router.get   ('/admin/brands',     ...adminOnly, c.getAdminBrands);
router.post  ('/admin/brands',     ...adminOnly, c.createBrand);
router.patch ('/admin/brands/:id', ...adminOnly, c.updateBrand);
router.delete('/admin/brands/:id', ...adminOnly, c.deleteBrand);


// ── Admin image upload (same R2 handler as /shop/images/upload-url, admin-scoped) ──
router.post('/admin/images/upload-url', ...adminOnly, img.getImageUploadUrl); // Phase 12

router.get  ('/admin/riders',                  ...adminOnly, c.getRiders);
router.post ('/admin/riders',                  ...adminOnly, validate(createRiderSchema), c.createRider);
router.patch('/admin/riders/:riderId',         ...adminOnly, c.updateRider);
router.post ('/admin/riders/:riderId/assign',  ...adminOnly, c.assignRiderToShop);

// ── Phase E: Staff Accounts ────────────────────────────────────────────────
// POST /admin/staff — create a generic staff account (shop_owner | rider | shop_staff)
router.post ('/admin/staff', ...adminOnly, c.createStaffAccount);

// ── Analytics ───────────────────────────────────────────────
router.get('/admin/analytics/overview',      ...adminOnly, c.getAnalyticsOverview);
router.get('/admin/analytics/platform',      ...adminOnly, getPlatformAnalyticsHandler); // P2-A
router.get('/admin/analytics/live',          ...adminOnly, c.getLiveAnalytics);           // P9-3
// P10-6: Investor / Series A analytics — static before dynamic
// NOTE: /investor, /cohorts, /unit-economics must come before /:id
router.get('/admin/analytics/investor',      ...adminOnly, investorCtrl.getInvestorDashboard);
router.get('/admin/analytics/cohorts',       ...adminOnly, investorCtrl.getCohortDashboard);
router.get('/admin/analytics/unit-economics',...adminOnly, investorCtrl.getUnitEconomicsDashboard);

// P11-5: Generate shareable investor report link (7-day signed token)
// POST /admin/investor/generate-link → { token, url_hint }
router.post('/admin/investor/generate-link', ...adminOnly, (req, res) => {
  try {
    const token = generateInvestorToken();
    return res.json({ success: true, token });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to generate token' });
  }
});

// P11-6: Upsert a marketing spend row
// POST /admin/investor/spend { month, channel, campaign_name?, amount_paise, new_customers_attributed?, notes? }
router.post('/admin/investor/spend', ...adminOnly, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { month, channel, campaign_name, amount_paise, new_customers_attributed = 0, notes } = req.body;

    if (!month || !channel || amount_paise == null) {
      return res.status(400).json({ success: false, message: 'month, channel, and amount_paise are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('marketing_spend')
      .upsert({
        month,
        channel,
        campaign_name: campaign_name || null,
        amount_paise:  Math.round(Number(amount_paise)),
        new_customers_attributed: Math.round(Number(new_customers_attributed)),
        notes:         notes || null,
        created_by:    req.user?.id || null,
      }, { onConflict: 'month,channel,campaign_name' })
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

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

// ── P10-5: Rider Payout Management ───────────────────────────
// NOTE: /pending and /balance must come before /:id to avoid shadowing
router.get ('/admin/payouts/pending',     ...adminOnly, riderPayoutCtrl.listPendingPayouts);
router.get ('/admin/payouts/balance',     ...adminOnly, riderPayoutCtrl.getRazorpayXBalance);
router.post('/admin/payouts/:id/approve', ...adminOnly, riderPayoutCtrl.approvePayoutRequest);
router.post('/admin/payouts/:id/reject',  ...adminOnly, riderPayoutCtrl.rejectPayoutRequest);

// ── R3: COD Reconciliation ────────────────────────────────────────────────
// GET  /admin/cod/pending    — list all collected-but-not-remitted COD sub_orders
// GET  /admin/cod/balances   — per-rider cash balance summary
// POST /admin/cod/reconcile  — batch mark as remitted { sub_order_ids, remittance_ref }
// NOTE: /pending and /balances must come before any /:id route
router.get ('/admin/cod/pending',    ...adminOnly, c.getCodPending);
router.get ('/admin/cod/balances',   ...adminOnly, c.getRiderCodBalances);
router.post('/admin/cod/reconcile',  ...adminOnly, c.reconcileCod);

// ── P13-5: Flash Sales CRUD ───────────────────────────────────
import { supabaseAdmin as _sba } from '../config/supabase.js';

router.get('/admin/flash-sales', ...adminOnly, async (req, res, next) => {
  try {
    const { data, error } = await _sba.from('flash_sales').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { flash_sales: data } });
  } catch (err) { next(err); }
});

router.post('/admin/flash-sales', ...adminOnly, async (req, res, next) => {
  try {
    const { title, discount_pct, max_discount_paise, starts_at, ends_at, product_ids, category, city_id, is_active, max_usage } = req.body;
    if (!title || !discount_pct || !starts_at || !ends_at) {
      return res.status(400).json({ success: false, message: 'title, discount_pct, starts_at, ends_at are required' });
    }
    const { data, error } = await _sba.from('flash_sales').insert({
      title, discount_pct, max_discount_paise: max_discount_paise || null,
      starts_at, ends_at, product_ids: product_ids || null,
      category: category || null, city_id: city_id || null,
      is_active: is_active !== false, max_usage: max_usage || null,
      created_by: req.user?.id || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/admin/flash-sales/:id', ...adminOnly, async (req, res, next) => {
  try {
    const allowed = ['title', 'discount_pct', 'max_discount_paise', 'starts_at', 'ends_at', 'is_active', 'category', 'max_usage'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await _sba.from('flash_sales').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/admin/flash-sales/:id', ...adminOnly, async (req, res, next) => {
  try {
    const { error } = await _sba.from('flash_sales').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── P13-8: Search Analytics ───────────────────────────────────
router.get('/admin/search-analytics', ...adminOnly, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Top queries
    const { data: topQueries } = await _sba.rpc('admin_top_search_queries', { p_since: since, p_limit: 20 })
      .catch(() => ({ data: null }));

    // Zero-result queries (stocking gaps)
    const { data: zeroResults } = await _sba
      .from('search_queries')
      .select('query, count:query')
      .eq('result_count', 0)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20)
      .catch(() => ({ data: null }));

    // Total search count
    const { count: totalSearches } = await _sba
      .from('search_queries')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .catch(() => ({ count: 0 }));

    res.json({
      success: true,
      data: {
        period_days:   days,
        total_searches: totalSearches || 0,
        top_queries:   topQueries || [],
        zero_results:  zeroResults || [],
      },
    });
  } catch (err) { next(err); }
});

// ── P13-2: WhatsApp toggle per city ──────────────────────────
router.patch('/admin/whatsapp-toggle', ...adminOnly, async (req, res, next) => {
  try {
    const { city_id, enabled } = req.body;
    if (!city_id) return res.status(400).json({ success: false, message: 'city_id required' });
    // Upsert into city_settings (if table exists, fallback gracefully)
    await _sba.from('cities').update({ whatsapp_enabled: enabled }).eq('id', city_id).catch(() => {});
    res.json({ success: true, city_id, whatsapp_enabled: enabled });
  } catch (err) { next(err); }
});

// ── P14-2: Cashback Rules CRUD ───────────────────────────────
router.get('/admin/cashback-rules', ...adminOnly, async (req, res, next) => {
  try {
    const { data, error } = await _sba.from('cashback_rules').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { rules: data || [] } });
  } catch (err) { next(err); }
});

router.post('/admin/cashback-rules', ...adminOnly, async (req, res, next) => {
  try {
    const { category, min_order_paise, cashback_pct, max_cashback_paise, expires_at, is_active = true } = req.body;
    if (!cashback_pct) return res.status(400).json({ message: 'cashback_pct required' });
    const { data, error } = await _sba.from('cashback_rules').insert({
      category, min_order_paise, cashback_pct, max_cashback_paise, expires_at, is_active,
      created_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/admin/cashback-rules/:id', ...adminOnly, async (req, res, next) => {
  try {
    const allowed = ['cashback_pct', 'max_cashback_paise', 'min_order_paise', 'is_active', 'expires_at', 'category'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await _sba.from('cashback_rules').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/admin/cashback-rules/:id', ...adminOnly, async (req, res, next) => {
  try {
    const { error } = await _sba.from('cashback_rules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── P14-7: Retention Metrics ─────────────────────────────────
router.get('/admin/retention-metrics', ...adminOnly, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const churnCutoff = new Date(Date.now() - 14 * 86400000).toISOString();

    // New customers in period
    const { count: newCustomers } = await _sba.from('profiles')
      .select('id', { count: 'exact', head: true }).gte('created_at', since);

    // Repeat customers (more than 1 order)
    const { data: repeatData } = await _sba
      .from('orders').select('customer_id')
      .gte('created_at', since).eq('status', 'delivered')
      .catch(() => ({ data: [] }));

    const customerOrderCount = {};
    (repeatData || []).forEach(o => {
      customerOrderCount[o.customer_id] = (customerOrderCount[o.customer_id] || 0) + 1;
    });
    const repeatCustomers = Object.values(customerOrderCount).filter(c => c > 1).length;
    const totalActive     = Object.keys(customerOrderCount).length;

    // Churned: had orders before churnCutoff, none after
    const { count: churned } = await _sba
      .from('profiles').select('id', { count: 'exact', head: true })
      .lt('created_at', churnCutoff)
      .catch(() => ({ count: 0 }));

    // Top repeat customers
    const { data: topCustomers } = await _sba
      .from('orders').select('customer_id, profile:profiles(name, phone)')
      .eq('status', 'delivered').gte('created_at', since).limit(200)
      .catch(() => ({ data: [] }));

    const topMap = {};
    (topCustomers || []).forEach(o => {
      const k = o.customer_id;
      if (!topMap[k]) topMap[k] = { customer_id: k, name: o.profile?.name, phone: o.profile?.phone, orders: 0 };
      topMap[k].orders++;
    });
    const top10 = Object.values(topMap).sort((a, b) => b.orders - a.orders).slice(0, 10);

    res.json({
      success: true,
      data: {
        period_days:      days,
        new_customers:    newCustomers || 0,
        active_customers: totalActive,
        repeat_customers: repeatCustomers,
        repeat_rate_pct:  totalActive ? Math.round((repeatCustomers / totalActive) * 100) : 0,
        estimated_churned: churned || 0,
        top_customers:    top10,
      },
    });
  } catch (err) { next(err); }
});

// ── P14-8: Reorder Nudge Rules ───────────────────────────────
router.get('/admin/nudges', ...adminOnly, async (req, res, next) => {
  try {
    const { data, error } = await _sba.from('reorder_nudge_rules').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { rules: data || [] } });
  } catch (err) { next(err); }
});

router.post('/admin/nudges', ...adminOnly, async (req, res, next) => {
  try {
    const { category, days_after_order, message_template, is_active = true } = req.body;
    if (!days_after_order) return res.status(400).json({ message: 'days_after_order required' });
    const { data, error } = await _sba.from('reorder_nudge_rules')
      .insert({ category, days_after_order, message_template, is_active, created_at: new Date().toISOString() })
      .select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/admin/nudges/:id', ...adminOnly, async (req, res, next) => {
  try {
    const { is_active, days_after_order, message_template } = req.body;
    const { data, error } = await _sba.from('reorder_nudge_rules')
      .update({ is_active, days_after_order, message_template }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── P15-1: Bulk Quote Admin ───────────────────────────────────
router.get('/admin/b2b/quotes', ...adminOnly, async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const { data, error } = await _sba.from('bulk_quote_requests')
      .select('id, items, status, quoted_total_paise, discount_pct, valid_until, admin_notes, rejection_reason, created_at, contractor:contractor_profiles(company_name, gst_number, user_id)')
      .eq('status', status).order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: { quotes: data || [] } });
  } catch (err) { next(err); }
});

router.patch('/admin/b2b/quotes/:id', ...adminOnly, async (req, res, next) => {
  try {
    const { action, quoted_total_paise, discount_pct, admin_notes, rejection_reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'action must be approve or reject' });
    const validUntil = new Date(Date.now() + 48 * 3600000).toISOString();
    const updates = action === 'approve'
      ? { status: 'quoted', quoted_total_paise, discount_pct: discount_pct || 0, admin_notes, valid_until: validUntil, updated_at: new Date().toISOString() }
      : { status: 'rejected', rejection_reason, updated_at: new Date().toISOString() };
    const { data, error } = await _sba.from('bulk_quote_requests').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    // Notify contractor via WhatsApp (fire-and-forget)
    if (data?.contractor_id) {
      _sba.from('contractor_profiles').select('user_id').eq('id', data.contractor_id).single()
        .then(({ data: cp }) => cp?.user_id && _sba.from('profiles').select('phone').eq('id', cp.user_id).single())
        .then(r => {
          const phone = r?.data?.phone;
          if (!phone) return;
          const msg = action === 'approve'
            ? `✅ Your bulk quote has been approved! Total: ₹${Math.round(quoted_total_paise / 100)}. Valid 48h. Login to accept → tezznirmaan.in/b2b/quote`
            : `❌ Your bulk quote request was not approved. Reason: ${rejection_reason || 'Not specified'}. Contact us for details.`;
          import('../services/whatsapp.service.js').then(({ sendMessage }) => sendMessage(phone, msg)).catch(() => {});
        }).catch(() => {});
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── P15-3: Contractor Credit Management ──────────────────────
router.get('/admin/b2b/contractors', ...adminOnly, async (req, res, next) => {
  try {
    const { data, error } = await _sba.from('contractor_profiles')
      .select('id, company_name, gst_number, credit_limit_paise, outstanding_credit_paise, payment_terms_days, discount_percent, is_verified, verified_at, user:profiles(name, phone, email)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { contractors: data || [] } });
  } catch (err) { next(err); }
});

router.patch('/admin/b2b/contractors/:id/credit', ...adminOnly, async (req, res, next) => {
  try {
    const { credit_limit_paise, payment_terms_days, discount_percent } = req.body;
    const updates = {};
    if (credit_limit_paise  !== undefined) updates.credit_limit_paise  = credit_limit_paise;
    if (payment_terms_days  !== undefined) updates.payment_terms_days  = payment_terms_days;
    if (discount_percent    !== undefined) updates.discount_percent     = discount_percent;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await _sba.from('contractor_profiles').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/admin/b2b/contractors/:id/record-payment', ...adminOnly, async (req, res, next) => {
  try {
    const { amount_paise } = req.body;
    if (!amount_paise) return res.status(400).json({ message: 'amount_paise required' });
    // Decrement outstanding balance
    const { data: cp } = await _sba.from('contractor_profiles').select('outstanding_credit_paise').eq('id', req.params.id).single();
    const newOutstanding = Math.max(0, (cp?.outstanding_credit_paise || 0) - amount_paise);
    const { data, error } = await _sba.from('contractor_profiles').update({ outstanding_credit_paise: newOutstanding, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data, message: `Payment of ₹${Math.round(amount_paise / 100)} recorded. New outstanding: ₹${Math.round(newOutstanding / 100)}` });
  } catch (err) { next(err); }
});

// ── P15-6: Delivery Zones CRUD ───────────────────────────────
router.get('/admin/delivery-zones', ...adminOnly, async (req, res, next) => {
  try {
    const { data, error } = await _sba.from('delivery_zones')
      .select('*, city:cities(name)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { zones: data || [] } });
  } catch (err) { next(err); }
});

router.post('/admin/delivery-zones', ...adminOnly, async (req, res, next) => {
  try {
    const { city_id, name, base_fee_paise, surge_multiplier = 1.0, surge_start_hour = 18, surge_end_hour = 21, max_distance_km = 10 } = req.body;
    if (!city_id || !name) return res.status(400).json({ message: 'city_id and name required' });
    const { data, error } = await _sba.from('delivery_zones').insert({ city_id, name, base_fee_paise: base_fee_paise || 2000, surge_multiplier, surge_start_hour, surge_end_hour, max_distance_km, is_active: true }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/admin/delivery-zones/:id', ...adminOnly, async (req, res, next) => {
  try {
    const allowed = ['name', 'base_fee_paise', 'surge_multiplier', 'surge_start_hour', 'surge_end_hour', 'max_distance_km', 'is_active'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await _sba.from('delivery_zones').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/admin/delivery-zones/:id', ...adminOnly, async (req, res, next) => {
  try {
    await _sba.from('delivery_zones').update({ is_active: false }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── P17-3: Admin AI Assistant ──────────────────────────────────
// POST /admin/ai/chat
router.post('/admin/ai/chat', ...adminOnly, async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'message required' });
    const { chat } = await import('../services/ai-assistant.service.js');
    const result = await chat(message.trim(), history);
    // Persist to chat history
    const { data: profile } = await _sba.from('profiles').select('id').eq('auth_id', req.user.id).single();
    if (profile) {
      await _sba.from('ai_chat_history').insert({ admin_id: profile.id, message: message.trim(), reply: result.reply, source: result.source }).catch(() => {});
    }
    res.json({ success: true, data: { reply: result.reply, source: result.source, context: result.context_used } });
  } catch (err) { next(err); }
});

// GET /admin/ai/history
router.get('/admin/ai/history', ...adminOnly, async (req, res, next) => {
  try {
    const { data: profile } = await _sba.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data } = await _sba.from('ai_chat_history').select('id, message, reply, source, created_at').eq('admin_id', profile.id).order('created_at', { ascending: false }).limit(50);
    res.json({ success: true, data: { history: (data || []).reverse() } });
  } catch (err) { next(err); }
});

// ── P17-7: WhatsApp Broadcasts ────────────────────────────────
// GET /admin/broadcasts/templates
router.get('/admin/broadcasts/templates', ...adminOnly, async (req, res, next) => {
  try {
    const { BROADCAST_TEMPLATES } = await import('../services/whatsapp-broadcast.service.js');
    res.json({ success: true, data: { templates: BROADCAST_TEMPLATES } });
  } catch (err) { next(err); }
});

// GET /admin/broadcasts/reach?segment=
router.get('/admin/broadcasts/reach', ...adminOnly, async (req, res, next) => {
  try {
    const { segment } = req.query;
    if (!segment) return res.status(400).json({ message: 'segment required' });
    const { getEstimatedReach } = await import('../services/whatsapp-broadcast.service.js');
    const reach = await getEstimatedReach(segment);
    res.json({ success: true, data: { segment, reach } });
  } catch (err) { next(err); }
});

// POST /admin/broadcasts/whatsapp
router.post('/admin/broadcasts/whatsapp', ...adminOnly, async (req, res, next) => {
  try {
    const { template_name, segment, params = {} } = req.body;
    if (!template_name || !segment) return res.status(400).json({ message: 'template_name and segment required' });
    const { data: profile } = await _sba.from('profiles').select('id').eq('auth_id', req.user.id).single();
    // Insert campaign record
    const { data: campaign } = await _sba.from('broadcast_campaigns')
      .insert({ admin_id: profile.id, template_name, segment, params, status: 'pending' })
      .select().single();
    // Get phones and send
    const { getSegmentPhones, sendBroadcast } = await import('../services/whatsapp-broadcast.service.js');
    const phones = await getSegmentPhones(segment);
    const result = await sendBroadcast(phones, template_name, params);
    // Update campaign record
    await _sba.from('broadcast_campaigns').update({
      estimated_reach: phones.length, sent_count: result.sent, failed_count: result.failed,
      status: result.sent > 0 ? 'sent' : 'failed', sent_at: new Date().toISOString(),
    }).eq('id', campaign.id);
    res.json({ success: true, data: { campaign_id: campaign.id, ...result } });
  } catch (err) { next(err); }
});

// GET /admin/broadcasts/history
router.get('/admin/broadcasts/history', ...adminOnly, async (req, res, next) => {
  try {
    const { data } = await _sba.from('broadcast_campaigns')
      .select('id, template_name, segment, estimated_reach, sent_count, failed_count, status, params, created_at, sent_at')
      .order('created_at', { ascending: false }).limit(50);
    res.json({ success: true, data: { campaigns: data || [] } });
  } catch (err) { next(err); }
});

// ── P17-9: Performance Metrics ───────────────────────────────
// GET /admin/performance/metrics
router.get('/admin/performance/metrics', ...adminOnly, async (req, res, next) => {
  try {
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const [ordersHour, totalShops, totalRiders, totalProfiles] = await Promise.all([
      _sba.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', hourAgo),
      _sba.from('shops').select('id', { count: 'exact', head: true }).eq('is_active', true),
      _sba.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'rider'),
      _sba.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    res.json({
      success: true,
      data: {
        orders_last_hour:  ordersHour.count || 0,
        active_shops:      totalShops.count || 0,
        active_riders:     totalRiders.count || 0,
        total_customers:   totalProfiles.count || 0,
        server_time:       new Date().toISOString(),
        uptime_seconds:    Math.round(process.uptime()),
        memory_mb:         Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        node_version:      process.version,
      },
    });
  } catch (err) { next(err); }
});

// ── Phase E: Staff Account Creation ──────────────────────────────────────
// POST /admin/staff — create shop_owner, rider, or shop_staff accounts
router.post('/admin/staff', ...adminOnly, createStaffAccount);

// ── Phase F: Live Rider Locations ─────────────────────────────────────────
// GET /admin/riders/locations
// Returns all riders with their latest GPS position, online status,
// and whether they currently have an active delivery.
// Used by useRiderLocations.js hook on the admin live dashboard.
router.get('/admin/riders/locations', ...adminOnly, async (req, res, next) => {
  try {
    const { supabaseAdmin: db } = await import('../config/supabase.js');

    // Fetch all riders with their latest location + profile info
    const { data: riders, error } = await db
      .from('profiles')
      .select(`
        id,
        full_name,
        phone,
        is_active,
        rider_locations (
          lat,
          lng,
          is_online,
          updated_at
        )
      `)
      .eq('role', 'rider')
      .order('full_name');

    if (error) throw error;

    // For each online rider, check if they have an active delivery
    const onlineIds = (riders || [])
      .filter(r => r.rider_locations?.[0]?.is_online)
      .map(r => r.id);

    let activeDeliveryMap = {};
    if (onlineIds.length > 0) {
      const { data: activeAssignments } = await db
        .from('delivery_assignments')
        .select('rider_id, id')
        .in('rider_id', onlineIds)
        .in('status', ['assigned', 'picked_up']);

      (activeAssignments || []).forEach(a => {
        activeDeliveryMap[a.rider_id] = a.id;
      });
    }

    const formatted = (riders || []).map(r => {
      const loc = r.rider_locations?.[0] || {};
      return {
        id:                  r.id,
        full_name:           r.full_name || 'Rider',
        phone:               r.phone,
        is_online:           loc.is_online || false,
        lat:                 loc.lat      || null,
        lng:                 loc.lng      || null,
        updated_at:          loc.updated_at || null,
        has_active_delivery: !!activeDeliveryMap[r.id],
        delivery_id:         activeDeliveryMap[r.id] || null,
      };
    });

    res.json({
      success: true,
      data: {
        riders:          formatted,
        online_count:    formatted.filter(r => r.is_online).length,
        delivering_count:formatted.filter(r => r.has_active_delivery).length,
        total:           formatted.length,
        fetched_at:      new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

export default router;
