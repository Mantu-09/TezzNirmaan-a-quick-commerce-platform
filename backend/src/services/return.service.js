// ────────────────────────────────────────────────────────────
// Return Service — P6-3
//
// Business logic for the full return request lifecycle:
//   requestReturn()  — Customer files a return (24h window check)
//   getCustomerReturns() — Customer lists own returns
//   getReturn()      — Single return with access check
//   getShopReturns() — Shop sees their pending/all returns
//   approveReturn()  — Shop approves: routes to wallet OR Razorpay
//   rejectReturn()   — Shop rejects with reason
//   markRefunded()   — Called by Razorpay webhook on refund.processed
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }        from '../config/supabase.js';
import { AppError, NotFoundError, ConflictError } from '../utils/errors.js';
import logger                   from '../utils/logger.js';
import { creditWallet }         from './wallet.service.js';
import { initiateRefund }       from './payment.service.js';
import { sendNotification }     from './notification.service.js';

// Return window: 24 hours from delivery
const RETURN_WINDOW_HOURS = 24;

// ── Internal helpers ──────────────────────────────────────────

/**
 * Fetch a return request and verify the shop owner/staff has access.
 * Returns the full return_request row joined with order number.
 */
async function getReturnWithShopAccess(returnId, shopId) {
  const { data, error } = await supabaseAdmin
    .from('return_requests')
    .select(`
      *,
      orders!inner(id, order_number, customer_id)
    `)
    .eq('id', returnId)
    .eq('shop_id', shopId)
    .single();

  if (error || !data) throw new NotFoundError('Return request not found');

  // Fetch the Razorpay payment ID from the payments table (not on orders)
  const { data: paymentRow } = await supabaseAdmin
    .from('payments')
    .select('razorpay_payment_id')
    .eq('order_id', data.orders.id)
    .eq('status', 'captured')
    .limit(1)
    .maybeSingle();

  data.razorpay_payment_id = paymentRow?.razorpay_payment_id || null;
  return data;
}

// ── Customer operations ───────────────────────────────────────

/**
 * File a return request for a delivered sub-order.
 *
 * Checks:
 *  1. Sub-order belongs to the customer and is delivered
 *  2. Within 24 hours of delivery
 *  3. No active (non-rejected) return already exists
 *
 * @param {string} userId
 * @param {object} payload
 * @param {string} payload.subOrderId
 * @param {string} payload.reason          - return_reason enum value
 * @param {string} [payload.description]   - optional narrative
 * @param {string[]} [payload.photoUrls]   - Supabase Storage public URLs
 * @returns {object} return_request row
 */
export async function requestReturn(userId, { subOrderId, reason, description, photoUrls }) {
  // 1. Verify sub-order belongs to user and is delivered
  const { data: subOrder, error: soErr } = await supabaseAdmin
    .from('sub_orders')
    .select(`
      id, status, delivered_at, order_number,
      orders!inner(id, user_id),
      shops!inner(id, name, owner_id)
    `)
    .eq('id', subOrderId)
    .eq('orders.user_id', userId)
    .single();

  if (soErr || !subOrder) throw new NotFoundError('Order not found');

  if (subOrder.status !== 'delivered') {
    throw new AppError('Returns can only be requested for delivered orders', 422);
  }

  // 2. Check 24-hour return window
  if (!subOrder.delivered_at) {
    throw new AppError('Delivery timestamp missing — please contact support', 422);
  }
  const hoursSince = (Date.now() - new Date(subOrder.delivered_at).getTime()) / (1000 * 60 * 60);
  if (hoursSince > RETURN_WINDOW_HOURS) {
    throw new AppError(
      `Return window has closed. Returns must be requested within ${RETURN_WINDOW_HOURS} hours of delivery.`,
      422
    );
  }

  // 3. Check for existing active return (allow re-request only if previously rejected)
  const { data: existing } = await supabaseAdmin
    .from('return_requests')
    .select('id, status')
    .eq('sub_order_id', subOrderId)
    .neq('status', 'rejected')
    .maybeSingle();

  if (existing) {
    throw new ConflictError('A return request already exists for this order');
  }

  // 4. Insert return request
  const { data: returnReq, error: insertErr } = await supabaseAdmin
    .from('return_requests')
    .insert({
      order_id:    subOrder.orders.id,
      sub_order_id: subOrderId,
      user_id:     userId,
      shop_id:     subOrder.shops.id,
      reason,
      description:  description || null,
      photo_urls:   photoUrls || [],
    })
    .select()
    .single();

  if (insertErr) throw insertErr;

  // 5. Notify shop owner (fail-silently)
  sendNotification(
    subOrder.shops.owner_id,
    'return_requested',
    '🔄 Return request received',
    `Customer requested a return for order #${subOrder.order_number}. Reason: ${reason.replace(/_/g, ' ')}.`,
    { return_id: returnReq.id, sub_order_id: subOrderId },
    false  // no SMS for shop notifications — push only
  ).catch(err => logger.warn('return.service: notification failed', { err: err.message }));

  logger.info('return.service: return requested', { returnId: returnReq.id, userId, subOrderId, reason });
  return returnReq;
}

/**
 * List all return requests for a customer.
 */
export async function getCustomerReturns(userId) {
  const { data, error } = await supabaseAdmin
    .from('return_requests')
    .select(`
      id, reason, description, status, refund_amount_paise, refund_method,
      rejection_reason, photo_urls, requested_at, reviewed_at, resolved_at,
      orders!inner(order_number),
      shops!inner(name)
    `)
    .eq('user_id', userId)
    .order('requested_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get a single return request (customer must own it).
 */
export async function getCustomerReturn(userId, returnId) {
  const { data, error } = await supabaseAdmin
    .from('return_requests')
    .select(`
      id, reason, description, status, refund_amount_paise, refund_method,
      rejection_reason, photo_urls, requested_at, reviewed_at, resolved_at,
      orders!inner(id, order_number, total_amount),
      shops!inner(name)
    `)
    .eq('id', returnId)
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new NotFoundError('Return request not found');
  return data;
}

/**
 * Check whether a sub-order is eligible for a return.
 * Used by the mobile client to conditionally show the "Request Return" button.
 *
 * @returns {{ eligible: boolean, reason?: string }}
 */
export async function checkReturnEligibility(userId, subOrderId) {
  const { data: subOrder } = await supabaseAdmin
    .from('sub_orders')
    .select('id, status, delivered_at, orders!inner(user_id)')
    .eq('id', subOrderId)
    .eq('orders.user_id', userId)
    .single();

  if (!subOrder) return { eligible: false, reason: 'Order not found' };
  if (subOrder.status !== 'delivered') return { eligible: false, reason: 'Order not yet delivered' };

  const hoursSince = (Date.now() - new Date(subOrder.delivered_at || 0).getTime()) / (1000 * 60 * 60);
  if (hoursSince > RETURN_WINDOW_HOURS) return { eligible: false, reason: 'Return window closed (24h)' };

  // Check no active return
  const { data: existing } = await supabaseAdmin
    .from('return_requests')
    .select('id, status')
    .eq('sub_order_id', subOrderId)
    .neq('status', 'rejected')
    .maybeSingle();

  if (existing) return { eligible: false, reason: 'Return already requested' };

  const hoursRemaining = Math.max(0, RETURN_WINDOW_HOURS - hoursSince);
  return { eligible: true, hours_remaining: Math.floor(hoursRemaining) };
}

// ── Shop operations ───────────────────────────────────────────

/**
 * List return requests for the shop, with optional status filter.
 */
export async function getShopReturns(shopId, { status, page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('return_requests')
    .select(`
      id, reason, description, status, refund_amount_paise, refund_method,
      rejection_reason, photo_urls, requested_at, reviewed_at, resolved_at,
      orders!inner(order_number, total_amount),
      profiles!inner(full_name, phone)
    `, { count: 'exact' })
    .eq('shop_id', shopId)
    .order('requested_at', { ascending: false })
    .range(from, from + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;

  return { returns: data || [], total: count || 0 };
}

/**
 * Get a single return request (shop-scoped).
 */
export async function getShopReturn(shopId, returnId) {
  return getReturnWithShopAccess(returnId, shopId);
}

/**
 * Approve a return: issue refund (wallet or Razorpay) then update status.
 *
 * @param {string} shopId
 * @param {string} returnId
 * @param {object} payload
 * @param {number} payload.refundAmountPaise    - amount decided by shop owner
 * @param {string} payload.refundMethod         - 'wallet' | 'original_payment_method'
 */
export async function approveReturn(shopId, returnId, { refundAmountPaise, refundMethod }) {
  const returnReq = await getReturnWithShopAccess(returnId, shopId);

  if (!['requested', 'under_review'].includes(returnReq.status)) {
    throw new AppError(`Return is already ${returnReq.status}`, 409);
  }

  let refundDbId = null;

  if (refundMethod === 'wallet') {
    // ── Instant wallet credit ──────────────────────────────
    await creditWallet(
      returnReq.user_id,
      refundAmountPaise,
      'credit_refund',
      `Return approved: Order #${returnReq.orders.order_number}`,
      returnReq.order_id
    );

    // Update return status — wallet refunds are resolved immediately
    await supabaseAdmin
      .from('return_requests')
      .update({
        status:               'refunded',
        refund_amount_paise:  refundAmountPaise,
        refund_method:        'wallet',
        reviewed_at:          new Date().toISOString(),
        resolved_at:          new Date().toISOString(),
      })
      .eq('id', returnId);

  } else {
    // ── Razorpay bank refund ───────────────────────────────
    const razorpayPaymentId = returnReq.razorpay_payment_id;
    if (!razorpayPaymentId) {
      throw new AppError(
        'No captured Razorpay payment found for this order. Use wallet refund for COD orders.',
        422
      );
    }

    // initiateRefund() returns the raw Razorpay refund object (rfnd_xxx)
    const rzpRefund = await initiateRefund(
      returnReq.order_id,
      razorpayPaymentId,
      refundAmountPaise,
      `Return: ${returnReq.reason} — Order #${returnReq.orders.order_number}`
    );

    // Fetch the DB refunds row UUID we just inserted (matched by razorpay_refund_id)
    if (rzpRefund?.id) {
      const { data: refundRow } = await supabaseAdmin
        .from('refunds')
        .select('id')
        .eq('razorpay_refund_id', rzpRefund.id)
        .maybeSingle();
      refundDbId = refundRow?.id || null;
    }

    // Status stays 'approved' until webhook confirms
    await supabaseAdmin
      .from('return_requests')
      .update({
        status:               'approved',
        refund_amount_paise:  refundAmountPaise,
        refund_method:        'original_payment_method',
        refund_id:            refundDbId,
        reviewed_at:          new Date().toISOString(),
      })
      .eq('id', returnId);
  }

  // Notify customer
  const amountRupees = (refundAmountPaise / 100).toFixed(0);
  const msg = refundMethod === 'wallet'
    ? `₹${amountRupees} has been credited to your TezzNirmaan wallet instantly.`
    : `₹${amountRupees} refund initiated. Reaches your account in 5–7 business days.`;

  sendNotification(
    returnReq.orders.customer_id,
    'return_approved',
    '✅ Return approved',
    msg,
    { return_id: returnId, order_id: returnReq.order_id },
    true
  ).catch(err => logger.warn('return.service: notification failed', { err: err.message }));

  logger.info('return.service: return approved', { returnId, shopId, refundMethod, refundAmountPaise });
  return { success: true, refund_method: refundMethod };
}

/**
 * Reject a return request.
 */
export async function rejectReturn(shopId, returnId, { rejectionReason }) {
  const returnReq = await getReturnWithShopAccess(returnId, shopId);

  if (!['requested', 'under_review'].includes(returnReq.status)) {
    throw new AppError(`Return is already ${returnReq.status}`, 409);
  }

  await supabaseAdmin
    .from('return_requests')
    .update({
      status:           'rejected',
      rejection_reason: rejectionReason,
      reviewed_at:      new Date().toISOString(),
    })
    .eq('id', returnId);

  sendNotification(
    returnReq.orders.customer_id,
    'return_rejected',
    '❌ Return request update',
    `Your return request for order #${returnReq.orders.order_number} was reviewed. Reason: ${rejectionReason}`,
    { return_id: returnId },
    true
  ).catch(err => logger.warn('return.service: notification failed', { err: err.message }));

  logger.info('return.service: return rejected', { returnId, shopId, rejectionReason });
}

/**
 * Mark a return as fully refunded (called from the Razorpay refund.processed webhook).
 *
 * @param {string} razorpayRefundId - Razorpay rfnd_xxx
 */
export async function markReturnRefunded(razorpayRefundId) {
  // Find the return_request linked to this refund via the refunds table
  const { data: refundRow } = await supabaseAdmin
    .from('refunds')
    .select('id, order_id')
    .eq('razorpay_refund_id', razorpayRefundId)
    .single();

  if (!refundRow) return; // not a return-initiated refund — handled elsewhere

  const { data: returnReq } = await supabaseAdmin
    .from('return_requests')
    .select('id, status')
    .eq('refund_id', refundRow.id)
    .single();

  if (!returnReq || returnReq.status !== 'approved') return;

  await supabaseAdmin
    .from('return_requests')
    .update({
      status:       'refunded',
      resolved_at:  new Date().toISOString(),
    })
    .eq('id', returnReq.id);

  logger.info('return.service: marked refunded', { returnId: returnReq.id, razorpayRefundId });
}
