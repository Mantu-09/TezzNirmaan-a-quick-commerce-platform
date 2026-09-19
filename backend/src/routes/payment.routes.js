// ────────────────────────────────────────────────────────────
// Payment Routes
// create-razorpay-order and verify require customer auth.
// webhook is called by Razorpay — NO JWT auth, but signature
// is verified in the controller handler itself.
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as c from '../controllers/payment.controller.js';

const router = Router();

// Create a Razorpay order for a placed parent order
router.post('/payments/create-razorpay-order', authenticate, c.createRazorpayOrder);

// Verify Razorpay payment signature after client-side SDK completion
router.post('/payments/verify', authenticate, c.verifyPayment);

// Razorpay webhook — raw body needed for signature verification.
// Note: express.json() must NOT parse this route's body as JSON before
// the signature check. In app.js, add express.raw() for this path BEFORE
// express.json(), or use a dedicated raw body middleware.
router.post('/payments/webhook', c.handleWebhook);

// ── P10-4: RazorpayX Payout Webhook ───────────────────────────
// Called by RazorpayX when payout status changes (processed/failed/queued).
// NO JWT auth — verified via X-Razorpay-Signature + RAZORPAYX_WEBHOOK_SECRET.
// Raw body required for HMAC verification — same pattern as /payments/webhook.
router.post('/payments/razorpayx/webhook', c.handleRazorpayXWebhook);

// ── P16-5: Saved Cards (Razorpay Tokenization) ────────────────
// GET  /payments/saved-cards         — list user's saved payment methods
router.get('/payments/saved-cards', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data, error } = await supabaseAdmin.from('saved_payment_methods')
      .select('id, card_last4, card_network, card_issuer, is_default, created_at')
      .eq('user_id', profile.id).order('is_default', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { cards: data || [] } });
  } catch (err) { next(err); }
});

// POST /payments/save-card           — save a Razorpay token after successful payment
router.post('/payments/save-card', authenticate, async (req, res, next) => {
  try {
    const { razorpay_token_id, card_last4, card_network, card_issuer } = req.body;
    if (!razorpay_token_id) return res.status(400).json({ message: 'razorpay_token_id required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    // If first card, make default
    const { count } = await supabaseAdmin.from('saved_payment_methods').select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { data, error } = await supabaseAdmin.from('saved_payment_methods')
      .insert({ user_id: profile.id, razorpay_token_id, card_last4, card_network, card_issuer, is_default: (count || 0) === 0 })
      .select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data, message: 'Card saved for faster checkout' });
  } catch (err) { next(err); }
});

// DELETE /payments/saved-cards/:id  — remove a saved card
router.delete('/payments/saved-cards/:id', authenticate, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { error } = await supabaseAdmin.from('saved_payment_methods')
      .delete().eq('id', req.params.id).eq('user_id', profile.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── P16-7: Razorpay Subscriptions (UPI Autopay for EMI) ──────
// POST /payments/subscriptions/create
router.post('/payments/subscriptions/create', authenticate, async (req, res, next) => {
  try {
    const { emi_plan_id } = req.body;
    if (!emi_plan_id) return res.status(400).json({ message: 'emi_plan_id required' });
    const { supabaseAdmin } = await import('../config/supabase.js');
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('auth_id', req.user.id).single();
    const { data: cp } = await supabaseAdmin.from('contractor_profiles').select('id, company_name').eq('user_id', profile.id).single();
    if (!cp) return res.status(403).json({ message: 'B2B account required' });
    const { data: plan } = await supabaseAdmin.from('emi_plans').select('*').eq('id', emi_plan_id).eq('contractor_id', cp.id).single();
    if (!plan) return res.status(404).json({ message: 'EMI plan not found' });
    const { createEMISubscription } = await import('../services/razorpay-subscription.service.js');
    const result = await createEMISubscription(plan, cp);
    // Store subscription ID on the plan
    await supabaseAdmin.from('emi_plans').update({ razorpay_subscription_id: result.subscriptionId }).eq('id', emi_plan_id).catch(() => {});
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /payments/subscriptions/webhook — Razorpay subscription events (charge success/failure)
router.post('/payments/subscriptions/webhook', async (req, res, next) => {
  try {
    const sig    = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Session P — hard-fail if signature is absent or webhook secret not configured.
    // Previous code: `if (sig && !verify(...))` — allowed unsigned requests through silently.
    if (!secret) {
      return res.status(503).json({ message: 'Webhook not configured' });
    }
    if (!sig) {
      return res.status(400).json({ message: 'Missing webhook signature' });
    }

    const { verifySubscriptionWebhook } = await import('../services/razorpay-subscription.service.js');
    const raw = JSON.stringify(req.body);
    if (!verifySubscriptionWebhook(raw, sig, secret)) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    if (event.event === 'subscription.charged') {
      const { supabaseAdmin } = await import('../config/supabase.js');
      const planId = event.payload?.subscription?.entity?.notes?.emi_plan_id;
      if (planId) {
        // Mark next pending EMI payment as paid
        const { data: pending } = await supabaseAdmin.from('emi_payments')
          .select('id').eq('plan_id', planId).eq('status', 'pending').order('due_date').limit(1).single();
        if (pending) {
          await supabaseAdmin.from('emi_payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', pending.id);
          await supabaseAdmin.from('emi_plans').update({ paid_count: supabaseAdmin.rpc('increment', { row_id: planId }) }).eq('id', planId).catch(() => {});
        }
      }
    }
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

export default router;
