// ────────────────────────────────────────────────────────────
// Payment Service — P1-B: Refund initiation
//
// Wraps Razorpay refund API and records every refund in the
// local `refunds` table for tracking and webhook reconciliation.
//
// Contract: initiateRefund() throws on Razorpay API failure
// so the caller (cancelOrderByCustomer) can surface the error.
// The refunds table row is still inserted first so we have an
// audit trail even if the Razorpay call partially succeeds.
// ────────────────────────────────────────────────────────────
import { razorpay } from '../config/razorpay.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';
// P3-C: Wallet refund path
import { refundToWallet } from './wallet.service.js';

/**
 * Initiate a full refund for a captured Razorpay payment.
 *
 * @param {string} orderId          - Our internal order UUID (for DB record)
 * @param {string} razorpayPaymentId - Razorpay payment ID (pay_xxx)
 * @param {number} amountPaise       - Amount to refund in paise (must equal original for full refund)
 * @param {string} reason            - Human-readable cancellation reason
 * @returns {Promise<object>}        - Razorpay refund object
 */
export async function initiateRefund(orderId, razorpayPaymentId, amountPaise, reason) {
  // Insert a tracking row immediately — even if Razorpay fails we have a record
  const { data: refundRow, error: insertErr } = await supabaseAdmin
    .from('refunds')
    .insert({
      order_id:            orderId,
      razorpay_payment_id: razorpayPaymentId,
      amount_paise:        amountPaise,
      status:              'initiated',
      reason,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Log but don't abort — the Razorpay refund should still be attempted
    logger.error('payment.service: failed to insert refund row', {
      orderId, error: insertErr.message,
    });
  }

  // Call Razorpay API
  const refund = await razorpay.payments.refund(razorpayPaymentId, {
    amount: amountPaise,
    notes: {
      reason,
      platform:  'TezzNirmaan',
      order_id:  orderId,
    },
    speed: 'normal', // 'normal' = 5-7 days; 'optimum' = fastest available
  });

  logger.info('payment.service: refund initiated', {
    orderId,
    razorpayRefundId: refund.id,
    amountPaise,
  });

  // Update refund row with the Razorpay refund ID
  if (refundRow?.id) {
    await supabaseAdmin
      .from('refunds')
      .update({ razorpay_refund_id: refund.id })
      .eq('id', refundRow.id);
  }

  return refund;
}

// ── P3-C: Smart refund routing ──────────────────────────────────────

/**
 * Route a refund either to the customer's wallet (instant) or
 * to Razorpay (5–7 days).
 *
 * Default: preferWallet = true (instant, better UX, keeps funds in platform)
 *
 * The wallet path is attempted first. If it fails (rare — e.g. DB error),
 * we fall back to Razorpay so no money is ever lost.
 *
 * @param {object} opts
 * @param {string} opts.userId          - customer's profile UUID
 * @param {string} opts.orderId         - our internal order UUID
 * @param {string} opts.orderNumber     - human-readable order number
 * @param {number} opts.amountPaise     - amount to refund in paise
 * @param {string} opts.reason          - cancellation reason
 * @param {string|null} opts.razorpayPaymentId  - Razorpay pay_xxx (null for COD)
 * @param {boolean} [opts.preferWallet=true]    - false to force Razorpay
 * @returns {{ method: 'wallet'|'razorpay'|'none', details: any }}
 */
export async function refundToWalletOrRazorpay({
  userId,
  orderId,
  orderNumber,
  amountPaise,
  reason,
  razorpayPaymentId,
  preferWallet = true,
}) {
  // COD orders: no payment captured, nothing to refund
  if (!razorpayPaymentId && !preferWallet) {
    logger.info('payment.service: COD order cancelled — no refund needed', { orderId });
    return { method: 'none', details: null };
  }

  // ── Option A: Instant wallet credit ────────────────────────────
  if (preferWallet) {
    try {
      await refundToWallet(userId, amountPaise, orderId, orderNumber);
      logger.info('payment.service: refund credited to wallet', { orderId, userId, amountPaise });
      return { method: 'wallet', details: { amountPaise } };
    } catch (walletErr) {
      logger.error('payment.service: wallet refund failed — falling back to Razorpay', {
        orderId, error: walletErr.message,
      });
      // Fall through to Razorpay path below
    }
  }

  // ── Option B: Razorpay bank refund ─────────────────────────────
  if (!razorpayPaymentId) {
    // COD order — nothing to refund via Razorpay either
    logger.warn('payment.service: no razorpayPaymentId for refund, skipping', { orderId });
    return { method: 'none', details: null };
  }

  try {
    const rzpRefund = await initiateRefund(orderId, razorpayPaymentId, amountPaise, reason);
    return { method: 'razorpay', details: rzpRefund };
  } catch (rzpErr) {
    logger.error('payment.service: Razorpay refund also failed — MANUAL ACTION NEEDED', {
      orderId, razorpayPaymentId, amountPaise, error: rzpErr.message,
    });
    // Re-throw so the caller can surface this to ops
    throw rzpErr;
  }
}


/**
 * Mark a refund as processed (called from the refund.processed webhook).
 *
 * @param {string} razorpayRefundId - Razorpay refund ID (rfnd_xxx)
 */
export async function markRefundProcessed(razorpayRefundId) {
  const { error } = await supabaseAdmin
    .from('refunds')
    .update({
      status:       'processed',
      processed_at: new Date().toISOString(),
    })
    .eq('razorpay_refund_id', razorpayRefundId);

  if (error) {
    logger.error('payment.service: failed to mark refund processed', {
      razorpayRefundId, error: error.message,
    });
    throw error;
  }
}

/**
 * Fetch a refund record by Razorpay refund ID.
 * Used in webhook to find the associated order for customer notification.
 *
 * @param {string} razorpayRefundId
 * @returns {Promise<{orderId: string, amountPaise: number}|null>}
 */
export async function getRefundByRazorpayId(razorpayRefundId) {
  const { data } = await supabaseAdmin
    .from('refunds')
    .select('order_id, amount_paise')
    .eq('razorpay_refund_id', razorpayRefundId)
    .single();
  return data || null;
}
