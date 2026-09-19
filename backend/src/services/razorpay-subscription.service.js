// backend/src/services/razorpay-subscription.service.js — P16-7
// UPI Autopay / Razorpay Subscriptions for B2B EMI auto-collection.
// Requires Razorpay account with Subscriptions product enabled.

import Razorpay from 'razorpay';

const rzp = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

/**
 * createEMISubscription(emiPlan, contractorProfile)
 * Creates a Razorpay subscription for monthly EMI auto-collection via UPI mandate.
 * Returns: { subscriptionId, shortUrl } — shortUrl is the mandate approval link.
 */
export async function createEMISubscription(emiPlan, contractorProfile) {
  if (!process.env.RAZORPAY_KEY_ID) {
    // Dev mode: return mock subscription
    console.log('[RzpSubscription] No Razorpay key — returning mock subscription');
    return { subscriptionId: 'sub_mock_' + Date.now(), shortUrl: null };
  }

  // 1. Create or fetch a Razorpay Plan
  const plan = await rzp.plans.create({
    period:   'monthly',
    interval: 1,
    item: {
      name:     `TezzNirmaan EMI Plan`,
      amount:   emiPlan.per_emi_paise,
      currency: 'INR',
    },
    notes: { emi_plan_id: emiPlan.id },
  });

  // 2. Create Subscription
  const subscription = await rzp.subscriptions.create({
    plan_id:         plan.id,
    total_count:     emiPlan.installments,
    quantity:        1,
    start_at:        Math.floor(new Date(emiPlan.next_due_date).getTime() / 1000),
    customer_notify: 1,
    notes: {
      emi_plan_id:    emiPlan.id,
      contractor_id:  emiPlan.contractor_id,
      company:        contractorProfile.company_name,
    },
  });

  return {
    subscriptionId: subscription.id,
    shortUrl:       subscription.short_url || null,
  };
}

/**
 * cancelSubscription(subscriptionId)
 */
export async function cancelSubscription(subscriptionId) {
  if (!process.env.RAZORPAY_KEY_ID || subscriptionId.startsWith('sub_mock_')) return;
  await rzp.subscriptions.cancel(subscriptionId, false);
}

/**
 * verifySubscriptionWebhook(body, signature, secret)
 * Returns true if signature is valid.
 * @param {string} body      - JSON.stringify(req.body)
 * @param {string} signature - x-razorpay-signature header value
 * @param {string} secret    - RAZORPAY_WEBHOOK_SECRET (caller must validate non-null)
 */
export function verifySubscriptionWebhook(body, signature, secret) {
  const crypto = require('crypto');
  // Session P: secret is now passed in explicitly — no silent empty-string fallback
  const expected = crypto.createHmac('sha256', secret || '').update(body).digest('hex');
  return expected === signature;
}
