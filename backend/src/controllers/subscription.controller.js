// ────────────────────────────────────────────────────────────
// Subscription Controller — P5-3
//
// GET  /customer/pass/plans      → list active plans (public)
// GET  /customer/pass            → current subscription + savings
// POST /customer/pass/purchase   → buy / renew a pass
// POST /customer/pass/cancel     → cancel auto-renewal
// ────────────────────────────────────────────────────────────
import * as subService from '../services/subscription.service.js';
import logger          from '../utils/logger.js';

// GET /customer/pass/plans
// Public — no auth. Returns plan catalogue for plan-picker UI.
export async function getPlans(req, res, next) {
  try {
    const plans = await subService.getPlans();
    res.json({ success: true, data: { plans } });
  } catch (err) {
    next(err);
  }
}

// GET /customer/pass
// Auth required. Returns active subscription or null.
export async function getMySubscription(req, res, next) {
  try {
    const sub = await subService.getSubscription(req.user.id);
    res.json({ success: true, data: { subscription: sub } });
  } catch (err) {
    next(err);
  }
}

// POST /customer/pass/purchase
// Body: { plan_id: UUID, payment_id: string }
// Auth required.
export async function purchasePass(req, res, next) {
  try {
    const { plan_id, payment_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ success: false, message: 'plan_id is required' });
    }

    const sub = await subService.purchasePass(req.user.id, plan_id, payment_id || null);
    res.status(201).json({ success: true, data: { subscription: sub } });
  } catch (err) {
    next(err);
  }
}

// POST /customer/pass/cancel
// Auth required. Cancels auto-renewal; access continues until expiry.
export async function cancelPass(req, res, next) {
  try {
    const result = await subService.cancelPass(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
