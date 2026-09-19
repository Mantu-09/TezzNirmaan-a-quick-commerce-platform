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
// ── R9: Push notification token registration ──────────────────
import { saveExpoPushToken } from '../services/push.service.js';

// Apply for a contractor account
router.post('/b2b/apply',               authenticate, b2bCtrl.applyForContractor);
// Get contractor profile + credit status
router.get ('/b2b/profile',             authenticate, b2bCtrl.getContractorProfile);
// Checkout: get discount + credit availability for a given order total
router.get ('/b2b/benefits',            authenticate, b2bCtrl.getCheckoutBenefits);
// GST Invoices
router.get ('/b2b/invoices',            authenticate, b2bCtrl.listInvoices);
router.get ('/b2b/invoices/:invoiceId', authenticate, b2bCtrl.getInvoice);

// ── P12-7: Project management ─────────────────────────────────
router.get ('/b2b/projects',           authenticate, b2bCtrl.listProjects  || ((req, res) => res.json({ data: { projects: [] } })));
router.post('/b2b/projects',           authenticate, b2bCtrl.createProject || ((req, res) => res.status(501).json({ message: 'Not implemented yet' })));
router.patch('/b2b/projects/:id',      authenticate, b2bCtrl.updateProject || ((req, res) => res.status(501).json({ message: 'Not implemented yet' })));

// ── P12-5: Product reviews ────────────────────────────────────
// POST /customer/products/:productId/reviews — submit a review (auth)
router.post('/products/:productId/reviews', authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rating, title, body: reviewBody } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating must be 1–5' });
    }
    const { supabaseAdmin } = await import('../config/supabase.js');

    // Get customer_id from profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', req.user.id)
      .single();
    if (!profile) return res.status(401).json({ message: 'Profile not found' });

    // Verify purchase (optional — allows unverified reviews too, just no is_verified badge)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('customer_id', profile.id)
      .eq('status', 'delivered')
      .limit(1)
      .single();

    const { data, error } = await supabaseAdmin
      .from('product_reviews')
      .upsert({
        product_id:   productId,
        customer_id:  profile.id,
        order_id:     order?.id || null,
        rating:       Number(rating),
        title:        title?.trim() || null,
        body:         reviewBody?.trim() || null,
        is_approved:  false, // Needs admin approval
      }, { onConflict: 'product_id,customer_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ data, message: 'Review submitted. It will appear after approval.' });
  } catch (err) {
    next(err);
  }
});

// ── P12-8: Push token registration ───────────────────────────
// POST /customer/push-token — register WebPush subscription
router.post('/push-token', authenticate, async (req, res, next) => {
  try {
    const { endpoint, p256dh, auth: authKey, platform = 'web' } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'endpoint required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { error } = await supabaseAdmin
      .from('push_tokens')
      .upsert({
        user_id:  req.user.id,
        token:    endpoint,
        p256dh,
        auth:     authKey,
        platform,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,token' });
    if (error) throw error;
    res.json({ message: 'Push token registered' });
  } catch (err) {
    next(err);
  }
});


// ── P14-1: Wallet transaction history ────────────────────────
router.get('/wallet/history', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const { data: walletRow } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', profile.id).single();
    const { data: txns, error } = await supabaseAdmin
      .from('wallet_transactions').select('id, type, amount, description, created_at, expires_at, order_id')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ success: true, data: { balance: walletRow?.balance || 0, transactions: txns || [] } });
  } catch (err) { next(err); }
});

router.post('/wallet/apply', authenticate, async (req, res, next) => {
  try {
    const { order_total_paise } = req.body;
    if (!order_total_paise) return res.status(400).json({ message: 'order_total_paise required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: wallet  } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', profile.id).single();
    const balance = wallet?.balance || 0;
    const applied = Math.min(balance, order_total_paise);
    res.json({ success: true, data: { wallet_balance: balance, applied_paise: applied, new_total_paise: order_total_paise - applied } });
  } catch (err) { next(err); }
});

// ── P14-3: Referral stats enhanced ──────────────────────────
router.get('/referral-stats', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id, referral_code').eq('auth_id', req.user.id).single();
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const { data: referrals, count } = await supabaseAdmin
      .from('referrals').select('id, status, reward_paise, created_at', { count: 'exact' })
      .eq('referrer_id', profile.id).order('created_at', { ascending: false });
    const totalEarned = (referrals || []).reduce((s, r) => s + (r.reward_paise || 0), 0);
    const completed   = (referrals || []).filter(r => r.status === 'rewarded').length;
    const code = profile.referral_code || '';
    res.json({
      success: true,
      data: {
        referral_code:       code,
        referral_url:        `https://tezznirmaan.in?ref=${code}`,
        whatsapp_share:      `https://wa.me/?text=${encodeURIComponent(`Order construction materials in 60 min! Use code ${code} get Rs.50 off -> https://tezznirmaan.in?ref=${code}`)}`,
        total_referrals:     count || 0,
        completed_referrals: completed,
        total_earned_paise:  totalEarned,
        next_milestone:      Math.ceil((completed + 1) / 5) * 5,
      },
    });
  } catch (err) { next(err); }
});

// ── P19-3: Reminders ────────────────────────────────────────
router.post('/reminders', authenticate, async (req, res, next) => {
  try {
    const { product_id, reminder_type = 'restock', remind_at } = req.body;

    if (!product_id) return res.status(400).json({ message: 'product_id required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data, error } = await supabaseAdmin.from('product_reminders')
      .upsert({ user_id: profile.id, product_id, reminder_type, remind_at: remind_at || null, is_sent: false, created_at: new Date().toISOString() },
        { onConflict: 'user_id,product_id,reminder_type' }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/reminders', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data, error } = await supabaseAdmin.from('product_reminders')
      .select('id, product_id, reminder_type, remind_at, is_sent, product:products(name, image_url)')
      .eq('user_id', profile.id).eq('is_sent', false).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { reminders: data || [] } });
  } catch (err) { next(err); }
});

// ── P14-5: Notification Center ──────────────────────────────
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    const { data: notifs, error } = await supabaseAdmin
      .from('notifications').select('id, type, title, body, data, created_at')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    // Get read IDs for this batch
    const ids = (notifs || []).map(n => n.id);
    const { data: readRows } = ids.length
      ? await supabaseAdmin.from('notification_reads').select('notification_id').eq('user_id', profile.id).in('notification_id', ids)
      : { data: [] };
    const readSet = new Set((readRows || []).map(r => r.notification_id));
    // Unread count
    const { count: unread } = await supabaseAdmin.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('user_id', profile.id).is('notification_reads', null)
      .catch(() => ({ count: 0 }));
    res.json({
      success: true,
      data: {
        notifications: (notifs || []).map(n => ({ ...n, is_read: readSet.has(n.id) })),
        unread_count: unread || 0,
      },
    });
  } catch (err) { next(err); }
});

router.post('/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const { data: unread } = await supabaseAdmin.from('notifications').select('id').eq('user_id', profile.id).limit(200);
    if (unread?.length) {
      await supabaseAdmin.from('notification_reads').upsert(
        unread.map(n => ({ user_id: profile.id, notification_id: n.id, read_at: new Date().toISOString() })),
        { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
      );
    }
    res.json({ success: true, message: `Marked ${unread?.length || 0} notifications as read` });
  } catch (err) { next(err); }
});

router.post('/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    await supabaseAdmin.from('notification_reads').upsert(
      { user_id: profile.id, notification_id: req.params.id },
      { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});


// ── P15-1: Bulk Quote Requests (B2B) ────────────────────────
router.post('/b2b/quotes', authenticate, async (req, res, next) => {
  try {
    const { items, notes } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'items array required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: contractor } = await supabaseAdmin.from('contractor_profiles').select('id, is_verified').eq('user_id', profile.id).single();
    if (!contractor) return res.status(403).json({ message: 'B2B account required. Apply at /b2b' });
    const { data, error } = await supabaseAdmin.from('bulk_quote_requests')
      .insert({ contractor_id: contractor.id, items, status: 'pending', admin_notes: notes, created_at: new Date().toISOString() })
      .select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data, message: 'Quote request submitted. We\'ll respond within 2 hours.' });
  } catch (err) { next(err); }
});

router.get('/b2b/quotes', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: contractor } = await supabaseAdmin.from('contractor_profiles').select('id').eq('user_id', profile.id).single();
    if (!contractor) return res.json({ success: true, data: { quotes: [] } });
    const { data, error } = await supabaseAdmin.from('bulk_quote_requests')
      .select('id, items, status, quoted_total_paise, discount_pct, valid_until, admin_notes, rejection_reason, created_at')
      .eq('contractor_id', contractor.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { quotes: data || [] } });
  } catch (err) { next(err); }
});

// ── P15-2: GST Invoice PDF download ──────────────────────────
router.get('/b2b/invoices/:invoiceId/pdf', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: contractor } = await supabaseAdmin.from('contractor_profiles')
      .select('id, company_name, gst_number, address').eq('user_id', profile.id).single();
    if (!contractor) return res.status(403).json({ message: 'B2B account required' });

    // Get invoice + order items
    const { data: invoice, error: iErr } = await supabaseAdmin
      .from('gst_invoices')
      .select('*, b2b_order:b2b_orders(*, order:orders(*, sub_orders(order_items(*, product:products(name, hsn_code)))))')
      .eq('id', req.params.invoiceId).single();
    if (iErr || !invoice) return res.status(404).json({ message: 'Invoice not found' });

    // Flatten order items
    const orderItems = invoice.b2b_order?.order?.sub_orders?.flatMap(s =>
      s.order_items?.map(i => ({
        name: i.product?.name || 'Product',
        hsn_code: i.product?.hsn_code || '3214',
        qty: i.quantity,
        unit_price_paise: i.unit_price_paise,
        gst_pct: 18,
      })) || []
    ) || [];

    const { generateGSTInvoice } = await import('../services/gst-invoice.service.js');
    const pdfBuffer = await generateGSTInvoice(invoice, contractor, orderItems);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number || req.params.invoiceId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── P15-4: EMI Plans ─────────────────────────────────────────
router.post('/b2b/emi-plans', authenticate, async (req, res, next) => {
  try {
    const { order_id, installments = 3 } = req.body;
    if (!order_id || ![3,6,12].includes(+installments)) return res.status(400).json({ message: 'order_id and installments (3/6/12) required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: contractor } = await supabaseAdmin.from('contractor_profiles').select('id').eq('user_id', profile.id).single();
    if (!contractor) return res.status(403).json({ message: 'B2B account required' });

    const { data: order } = await supabaseAdmin.from('orders').select('total_amount').eq('id', order_id).single();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const perEmi = Math.ceil(order.total_amount / (+installments));
    const nextDue = new Date(); nextDue.setMonth(nextDue.getMonth() + 1);

    const { data: plan, error } = await supabaseAdmin.from('emi_plans')
      .insert({ contractor_id: contractor.id, order_id, total_paise: order.total_amount, installments: +installments, per_emi_paise: perEmi, next_due_date: nextDue.toISOString().slice(0,10), status: 'active' })
      .select().single();
    if (error) throw error;

    // Create payment schedule rows
    const payments = Array.from({ length: +installments }, (_, i) => {
      const due = new Date(); due.setMonth(due.getMonth() + i + 1);
      return { plan_id: plan.id, amount_paise: perEmi, due_date: due.toISOString().slice(0,10), status: 'pending' };
    });
    await supabaseAdmin.from('emi_payments').insert(payments);

    res.status(201).json({ success: true, data: { plan, per_emi_paise: perEmi, schedule: payments } });
  } catch (err) { next(err); }
});

router.get('/b2b/emi-plans', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: contractor } = await supabaseAdmin.from('contractor_profiles').select('id').eq('user_id', profile.id).single();
    if (!contractor) return res.json({ success: true, data: { plans: [] } });
    const { data, error } = await supabaseAdmin.from('emi_plans')
      .select('*, payments:emi_payments(id, amount_paise, due_date, status, paid_at)')
      .eq('contractor_id', contractor.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { plans: data || [] } });
  } catch (err) { next(err); }
});

// ── P18-5: Customer Order Receipt PDF ─────────────────────
// GET /customer/orders/:orderId/receipt
// Also accepts ?token=<jwt> so mobile can use Linking.openURL without
// needing custom headers (expo-web-browser not installed in current build).
router.get('/customer/orders/:orderId/receipt', async (req, res, next) => {
  try {
    // Extract token from Authorization header or ?token= query param
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.query.token) {
      token = req.query.token;
    }
    if (!token) return res.status(401).json({ message: 'Authorization required' });

    // Validate token via Supabase (same as authenticate middleware)
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ message: 'Invalid token' });

    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', user.id).single();
    if (!profile) return res.status(401).json({ message: 'Profile not found' });
    const { generateReceipt } = await import('../services/order-receipt.service.js');
    const doc = await generateReceipt(req.params.orderId, profile.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tezznirmaan-receipt-${req.params.orderId.slice(0, 8)}.pdf"`);
    doc.pipe(res);
  } catch (err) {
    if (err.message?.includes('not found')) return res.status(404).json({ message: err.message });
    next(err);
  }
});

// ── P19-5: Loyalty Stamp Card ──────────────────────────────
// GET /customer/loyalty
router.get('/customer/loyalty', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id, full_name').eq('auth_id', req.user.id).single();
    if (!profile) return res.status(401).json({ message: 'Profile not found' });

    // Count lifetime stamps
    const { count: totalStamps } = await supabaseAdmin
      .from('loyalty_stamps').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id);

    const stamps         = totalStamps || 0;
    const STAMPS_PER_REWARD = 5;
    const currentCycle   = stamps % STAMPS_PER_REWARD;
    const rewardsEarned  = Math.floor(stamps / STAMPS_PER_REWARD);
    const stampsToNext   = STAMPS_PER_REWARD - currentCycle;

    // Recent stamps (for display)
    const { data: recent } = await supabaseAdmin
      .from('loyalty_stamps').select('id, created_at, order_id').eq('profile_id', profile.id)
      .order('created_at', { ascending: false }).limit(10);

    res.json({
      success: true,
      data: {
        total_stamps:      stamps,
        current_cycle:     currentCycle,
        stamps_per_reward: STAMPS_PER_REWARD,
        stamps_to_next:    stampsToNext,
        rewards_earned:    rewardsEarned,
        reward_type:       'free_delivery', // 5 stamps = free delivery on next order
        recent_stamps:     recent || [],
      },
    });
  } catch (err) { next(err); }
});

// ── P21-M6: Customer Order Cancellation ───────────────────────────────────
// DELETE /customer/orders/:orderId
// FIXED (Session H): The previous implementation manually set status = 'cancelled'
// without triggering refunds or stock restoration. Now delegates to the same
// cancelOrder controller used by POST /orders/:orderId/cancel, which calls
// cancelOrderByCustomer() with full refund + stock restore + notification logic.
router.delete('/customer/orders/:orderId', authenticate, validate(cancelOrderSchema), c.cancelOrder);
// ── R9: Expo Push Token Registration ─────────────────────────
// PATCH /customer/expo-push-token
// Body: { token: "ExponentPushToken[xxxxx]" }
// Called by the mobile app once on login/app-open to ensure push delivery works.
// Silently ignored for invalid tokens — never breaks the caller.
router.patch('/customer/expo-push-token', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'token required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id').eq('auth_id', req.user.id).single();
    if (!profile) return res.status(401).json({ message: 'Profile not found' });
    await saveExpoPushToken(profile.id, token); // validates Expo format, updates profiles table
    res.json({ message: 'Push token registered' });
  } catch (err) { next(err); }
});


export default router;
