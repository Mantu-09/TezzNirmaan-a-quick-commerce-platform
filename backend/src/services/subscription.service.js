// ────────────────────────────────────────────────────────────
// Subscription Service — P5-3: TezzNirmaan Pass
//
// Responsibilities:
//   getPlans()              → list active plans for plan-picker UI
//   getSubscription(userId) → current user's sub status + savings
//   purchasePass(...)       → activate / renew a pass
//   applyPassBenefits(...)  → waive delivery fee + log usage
//   cancelPass(userId)      → cancel auto-renewal (access until expiry)
//   expireSubscriptions()   → daily cron — mark stale rows 'expired'
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }    from '../config/supabase.js';
import * as notify         from './notification.service.js';
import logger              from '../utils/logger.js';
import { AppError }        from '../utils/errors.js';

// ── 1. Plan catalogue ─────────────────────────────────────────

/**
 * List all active plans (public — no auth required).
 * Cached by the controller for 10 min; plans rarely change.
 */
export async function getPlans() {
  const { data, error } = await supabaseAdmin
    .from('pass_plans')
    .select('id, name, tier, price_paise, free_deliveries, delivery_discount_percent, cashback_multiplier')
    .eq('is_active', true)
    .order('price_paise', { ascending: true });

  if (error) throw error;
  return data;
}

// ── 2. User subscription status ──────────────────────────────

/**
 * Return the user's active subscription + savings summary.
 * Returns null if no active subscription.
 */
export async function getSubscription(userId) {
  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select(`
      id, status, started_at, expires_at, auto_renew, cancelled_at,
      pass_plans(id, name, tier, price_paise, cashback_multiplier, delivery_discount_percent)
    `)
    .eq('user_id', userId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (!data) return null;

  // Compute days remaining
  const msLeft   = new Date(data.expires_at) - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  // Total savings — delivery fees waived
  const { data: savingsRow } = await supabaseAdmin
    .from('subscription_benefits_used')
    .select('delivery_fee_waived_paise, extra_cashback_paise')
    .eq('subscription_id', data.id);

  const totalWaived = (savingsRow || []).reduce(
    (acc, r) => acc + (r.delivery_fee_waived_paise || 0), 0
  );

  return {
    ...data,
    daysLeft,
    isActive: data.status === 'active' && daysLeft > 0,
    totalWaivedPaise: totalWaived,
  };
}

// ── 3. Purchase / renew ───────────────────────────────────────

/**
 * Activate or renew a pass for a user.
 * Called after successful Razorpay payment.
 *
 * @param {string} userId
 * @param {string} planId   UUID of the pass_plans row
 * @param {string} paymentId  Razorpay payment_id for audit trail
 * @returns {object}  The created/updated user_subscriptions row
 */
export async function purchasePass(userId, planId, paymentId) {
  // Fetch plan — validates planId
  const { data: plan, error: planErr } = await supabaseAdmin
    .from('pass_plans')
    .select('*')
    .eq('id', planId)
    .eq('is_active', true)
    .single();

  if (planErr || !plan) throw new AppError('Invalid or inactive plan', 404);

  // Calculate expiry from NOW (not from previous expiry — simpler UX)
  const expiresAt = new Date();
  if (plan.tier === 'weekly')  expiresAt.setDate(expiresAt.getDate() + 7);
  if (plan.tier === 'monthly') expiresAt.setMonth(expiresAt.getMonth() + 1);

  // Upsert — handles both first-time activation and renewal
  const { data: sub, error: upsertErr } = await supabaseAdmin
    .from('user_subscriptions')
    .upsert(
      {
        user_id:                 userId,
        plan_id:                 planId,
        status:                  'active',
        started_at:              new Date().toISOString(),
        expires_at:              expiresAt.toISOString(),
        auto_renew:              true,
        razorpay_subscription_id: paymentId || null,
        cancelled_at:            null,
      },
      { onConflict: 'user_id' }    // ONE active sub per user at a time
    )
    .select('*, pass_plans(*)')
    .single();

  if (upsertErr) throw upsertErr;

  // Notify user
  const expiryStr = expiresAt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long',
  });

  try {
    await notify.sendNotification(
      userId,
      'pass_activated',
      '🎫 TezzNirmaan Pass activated!',
      `Free delivery on all orders until ${expiryStr}. Enjoy ${plan.cashback_multiplier}× cashback!`,
      { plan_name: plan.name, expires_at: expiresAt.toISOString() }
    );
  } catch (notifErr) {
    // Don't fail the purchase if notification fails
    logger.warn('Pass activation notification failed', { userId, error: notifErr.message });
  }

  logger.info('Pass purchased', { userId, planId, tier: plan.tier, expiresAt });
  return sub;
}

// ── 4. Apply pass benefits on order ──────────────────────────

/**
 * Check if user has an active pass and, if so:
 *   - Log the delivery fee waiver
 *   - Return the cashback_multiplier for cashback calculation
 *
 * Called from order.service.js AFTER the order row is created.
 * Always resolves (never throws) — pass failure must not block order.
 *
 * @param {string} userId
 * @param {string} orderId
 * @param {number} deliveryFeePaise  The delivery fee charged before waiver
 * @returns {{ feeWaived: number, cashbackMultiplier: number }}
 */
export async function applyPassBenefits(userId, orderId, deliveryFeePaise) {
  const NOOP = { feeWaived: 0, cashbackMultiplier: 1 };

  try {
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id, pass_plans(cashback_multiplier, delivery_discount_percent)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!sub) return NOOP;

    const discountPct = sub.pass_plans?.delivery_discount_percent ?? 100;
    const feeWaived   = Math.round(deliveryFeePaise * discountPct / 100);
    const multiplier  = Number(sub.pass_plans?.cashback_multiplier ?? 1);

    // Record usage (fire-and-forget — log failure but don't block)
    supabaseAdmin.from('subscription_benefits_used').insert({
      subscription_id:          sub.id,
      order_id:                 orderId,
      delivery_fee_waived_paise: feeWaived,
      extra_cashback_paise:     0,          // updated later when cashback posts
    }).then(({ error }) => {
      if (error) logger.warn('Benefit usage log failed', { orderId, error: error.message });
    });

    logger.info('Pass benefit applied', { userId, orderId, feeWaived, multiplier });
    return { feeWaived, cashbackMultiplier: multiplier };

  } catch (err) {
    logger.warn('applyPassBenefits failed — continuing without pass', {
      userId, orderId, error: err.message,
    });
    return NOOP;
  }
}

// ── 5. Cancel pass ────────────────────────────────────────────

/**
 * Cancel auto-renewal. User keeps access until expires_at.
 * Does NOT refund.
 */
export async function cancelPass(userId) {
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('id, expires_at, pass_plans(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!sub) throw new AppError('No active subscription found', 404);

  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .update({
      auto_renew:   false,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', sub.id);

  if (error) throw error;

  const expiryStr = new Date(sub.expires_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long',
  });

  try {
    await notify.sendNotification(
      userId,
      'pass_cancelled',
      'TezzNirmaan Pass auto-renewal cancelled',
      `You'll continue to enjoy benefits until ${expiryStr}. Renew anytime.`,
      {}
    );
  } catch { /* ignore */ }

  logger.info('Pass auto-renewal cancelled', { userId, expiresAt: sub.expires_at });
  return { message: `Pass active until ${expiryStr}`, expiresAt: sub.expires_at };
}

// ── 6. Daily expiry cron ──────────────────────────────────────

/**
 * Mark all overdue 'active' subscriptions as 'expired'.
 * Sends renewal reminder push to each expired user.
 * Called by pg-boss cron at 00:00 IST.
 */
export async function expireSubscriptions() {
  const { data: expired, error } = await supabaseAdmin
    .from('user_subscriptions')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select('user_id, pass_plans(name)');

  if (error) {
    logger.error('expireSubscriptions failed', { error: error.message });
    return;
  }

  logger.info('Subscriptions expired', { count: expired?.length ?? 0 });

  for (const row of (expired || [])) {
    try {
      await notify.sendNotification(
        row.user_id,
        'pass_expired',
        'Your TezzNirmaan Pass has expired 😔',
        'Renew now to keep free delivery and bonus cashback on every order.',
        { plan_name: row.pass_plans?.name }
      );
    } catch (notifErr) {
      logger.warn('Pass expiry notification failed', {
        userId: row.user_id, error: notifErr.message,
      });
    }
  }

  return { expired: expired?.length ?? 0 };
}
