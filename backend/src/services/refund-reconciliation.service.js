// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Refund Reconciliation Service — Session L
//
// Problem: Our refunds table has rows with status='initiated' that were sent
// to Razorpay but never confirmed via webhook (webhook missed, Razorpay delay,
// server restart mid-flight, etc.).
//
// Solution: A cron job that queries all 'initiated' refunds older than 5 min,
// fetches the live status from Razorpay, and syncs our DB.
//
// Called by: POST /internal/cron/reconcile-refunds  (every 15 min via Render)
// ─────────────────────────────────────────────────────────────────────────────
import { razorpay }      from '../config/razorpay.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../utils/logger.js';

/**
 * Maps Razorpay refund status to our internal status.
 * Razorpay statuses: 'pending' | 'processed' | 'failed' | 'cancelled'
 */
function mapRazorpayStatus(rzpStatus) {
  switch (rzpStatus) {
    case 'processed':  return 'succeeded';
    case 'failed':     return 'failed';
    case 'cancelled':  return 'failed';
    default:           return 'initiated'; // still pending
  }
}

/**
 * Reconcile all refunds stuck in 'initiated' state for more than 5 minutes.
 *
 * @returns {{ checked: number, updated: number, errors: number }}
 */
export async function reconcileRefunds() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Find initiated refunds older than 5 min that have a Razorpay refund ID
  const { data: staleRefunds, error: fetchErr } = await supabaseAdmin
    .from('refunds')
    .select('id, order_id, razorpay_refund_id, razorpay_payment_id, amount_paise, status, created_at')
    .eq('status', 'initiated')
    .not('razorpay_refund_id', 'is', null)
    .lt('created_at', fiveMinutesAgo)
    .order('created_at', { ascending: true })
    .limit(50); // Process max 50 per run to avoid Razorpay rate limits

  if (fetchErr) {
    logger.error('[RefundReconcile] Failed to fetch stale refunds', { error: fetchErr.message });
    throw fetchErr;
  }

  if (!staleRefunds?.length) {
    logger.info('[RefundReconcile] No stale refunds to reconcile');
    return { checked: 0, updated: 0, errors: 0 };
  }

  logger.info(`[RefundReconcile] Checking ${staleRefunds.length} stale refunds`);

  let updated = 0;
  let errors  = 0;

  for (const refund of staleRefunds) {
    try {
      // Fetch live status from Razorpay
      const rzpRefund = await razorpay.refunds.fetch(refund.razorpay_refund_id);
      const newStatus = mapRazorpayStatus(rzpRefund.status);

      if (newStatus === 'initiated') {
        // Still pending — nothing to update yet
        continue;
      }

      // Status changed — update our DB
      const { error: updateErr } = await supabaseAdmin
        .from('refunds')
        .update({
          status:       newStatus,
          updated_at:   new Date().toISOString(),
          // Store raw Razorpay response metadata
          notes: {
            rzp_status:          rzpRefund.status,
            rzp_processed_at:    rzpRefund.processed_at ? new Date(rzpRefund.processed_at * 1000).toISOString() : null,
            rzp_speed_processed: rzpRefund.speed_processed,
          },
        })
        .eq('id', refund.id);

      if (updateErr) {
        logger.error('[RefundReconcile] Failed to update refund row', {
          refundId: refund.id,
          error:    updateErr.message,
        });
        errors++;
        continue;
      }

      logger.info('[RefundReconcile] Synced refund status', {
        refundId:         refund.id,
        orderId:          refund.order_id,
        razorpayRefundId: refund.razorpay_refund_id,
        oldStatus:        'initiated',
        newStatus,
        amountPaise:      refund.amount_paise,
      });
      updated++;

      // If refund failed and we haven't already retried — log a warning for manual review
      if (newStatus === 'failed') {
        logger.warn('[RefundReconcile] ATTENTION: Refund failed — manual review needed', {
          refundId:         refund.id,
          orderId:          refund.order_id,
          razorpayRefundId: refund.razorpay_refund_id,
          razorpayPaymentId: refund.razorpay_payment_id,
          amountPaise:      refund.amount_paise,
        });
      }
    } catch (err) {
      logger.error('[RefundReconcile] Error processing refund', {
        refundId: refund.id,
        error:    err.message,
      });
      errors++;
    }
  }

  return { checked: staleRefunds.length, updated, errors };
}
