// ────────────────────────────────────────────────────────────
// order-lifecycle.service.js — P5-4A: Order Service Split
//
// Contains: cancelOrderByCustomer, cancelOrder, updateSubOrderStatus
//
// State machine is enforced for ALL transitions.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../../config/supabase.js';
import { assertTransition } from '../../utils/stateMachine.js';
import { NotFoundError, AppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import * as notificationService from '../notification.service.js';
import { invalidateShopInventoryCache } from '../cache.service.js'; // P2-C
import { broadcastOrderStatus }         from '../../lib/websocket.js'; // P5-1

// ────────────────────────────────────────────────────────────
// cancelOrderByCustomer — P1-B
//
// Full production cancel flow:
//   1. Ownership + existence check
//   2. 30-minute cancellation window enforcement
//   3. Status gate — block if shop has started preparing
//   4. Cancel all eligible sub_orders via state machine
//   5. Restore stock for each cancelled sub_order
//   6. Initiate Razorpay refund if payment was captured
//   7. Notify customer + shop owner
// ────────────────────────────────────────────────────────────
export async function cancelOrderByCustomer(orderId, userId, reason) {
  // ── 1. Fetch order with sub_orders and payment info ─────────
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, customer_id, order_number, placed_at,
      sub_orders(id, status),
      payments(method, status, razorpay_payment_id, amount),
      shops!inner(id, profile_id, phone, profiles!profile_id(id))
    `)
    .eq('id', orderId)
    .eq('customer_id', userId)
    .single();

  if (error || !order) throw new NotFoundError('Order not found');

  // ── 2. 30-minute cancellation window ─────────────────────────
  const placedAt       = new Date(order.placed_at);
  const windowMs       = 30 * 60 * 1000; // 30 minutes
  const now            = new Date();
  const minutesElapsed = Math.floor((now - placedAt) / 60000);

  if (now - placedAt > windowMs) {
    throw new AppError(
      `Cancellation window has expired. Orders can only be cancelled within 30 minutes of placement. ` +
      `This order was placed ${minutesElapsed} minutes ago.`,
      422,
      { shop_phone: order.shops?.phone, minutes_elapsed: minutesElapsed }
    );
  }

  // ── 3. Block if any sub_order is past the cancellable stage ──
  const CANCELLABLE = ['pending', 'confirmed'];
  const blockingSubOrders = order.sub_orders.filter(
    so => !CANCELLABLE.includes(so.status)
  );

  if (blockingSubOrders.length > 0) {
    throw new AppError(
      'Cannot cancel — your order is already being prepared. ' +
      'Please contact the shop directly for assistance.',
      422,
      { shop_phone: order.shops?.phone }
    );
  }

  const nowStr = now.toISOString();

  // ── 4. Cancel each sub_order via state machine + restore stock ─
  for (const subOrder of order.sub_orders) {
    assertTransition(subOrder.status, 'cancelled', 'customer');

    await supabaseAdmin
      .from('sub_orders')
      .update({
        status:               'cancelled',
        cancelled_at:         nowStr,
        cancellation_reason:  reason || 'Customer cancelled',
        updated_at:           nowStr,
      })
      .eq('id', subOrder.id);

    await supabaseAdmin.from('sub_order_status_history').insert({
      sub_order_id: subOrder.id,
      from_status:  subOrder.status,
      to_status:    'cancelled',
      changed_by:   userId,
      notes:        reason || 'Customer cancelled',
    });

    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, inventory_id')
      .eq('sub_order_id', subOrder.id);

    for (const item of (items || [])) {
      if (item.inventory_id) {
        const { error: stockErr } = await supabaseAdmin.rpc('increment_inventory_stock', {
          p_inventory_id: item.inventory_id,
          p_amount:       item.quantity,
        });
        if (stockErr) {
          logger.error('cancelOrderByCustomer: stock restore failed', {
            inventoryId: item.inventory_id, error: stockErr.message,
          });
        }
      }
    }
  }

  // P2-C: stock was restored — invalidate so catalog shows updated availability
  const shopId = order.shops?.id;
  if (shopId) invalidateShopInventoryCache(shopId).catch(() => {});

  // ── 5. Initiate refund — wallet first (P3-C), Razorpay fallback ──
  let refundInitiated = false;
  let refundMethod    = 'none';
  const payment       = order.payments?.[0];

  if (payment?.status === 'captured') {
    try {
      const { refundToWalletOrRazorpay } = await import('../payment.service.js');
      const refundResult = await refundToWalletOrRazorpay({
        userId,
        orderId,
        orderNumber:      order.order_number,
        amountPaise:      payment.amount,
        reason:           reason || 'Customer cancelled',
        razorpayPaymentId: payment.razorpay_payment_id || null,
        preferWallet:     true,
      });
      refundInitiated = true;
      refundMethod    = refundResult.method;
      logger.info('cancelOrderByCustomer: refund routed', { orderId, method: refundMethod });
    } catch (refundErr) {
      logger.error('cancelOrderByCustomer: refund initiation failed — manual action needed', {
        orderId,
        paymentId: payment.razorpay_payment_id,
        error:     refundErr.message,
      });
    }
  }

  // ── 6. Notify customer ────────────────────────────────────────
  notificationService.notifyOrderCancelled(
    userId,
    order.order_number,
    orderId,
    reason || 'Customer cancelled'
  );

  // ── 7. Notify shop owner (fire-and-forget) ────────────────────
  const shopOwnerId = order.shops?.profile_id;
  if (shopOwnerId) {
    notificationService.sendNotification(
      shopOwnerId,
      'order_cancelled',
      'Order Cancelled by Customer',
      `Order #${order.order_number} was cancelled by the customer. Reason: ${reason || 'Not provided'}`,
      { order_id: orderId, order_number: order.order_number }
    );
  }

  logger.info('cancelOrderByCustomer: done', {
    orderId, userId, reason, refundInitiated, subOrderCount: order.sub_orders.length,
  });

  return {
    cancelled:        true,
    refund_initiated: refundInitiated,
    refund_method:    refundMethod,
    order_number:     order.order_number,
  };
}

// Keep the old cancelOrder export as an alias for backward compat
// (used by shop controller for shop-initiated cancellations).
export async function cancelOrder(orderId, userId, reason) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, customer_id, sub_orders(id, status)')
    .eq('id', orderId)
    .eq('customer_id', userId)
    .single();

  if (error || !order) throw new NotFoundError('Order not found');

  const now = new Date().toISOString();
  const results = [];

  for (const subOrder of order.sub_orders) {
    assertTransition(subOrder.status, 'cancelled', 'customer');

    await supabaseAdmin
      .from('sub_orders')
      .update({ status: 'cancelled', cancelled_at: now, cancellation_reason: reason, updated_at: now })
      .eq('id', subOrder.id);

    await supabaseAdmin.from('sub_order_status_history').insert({
      sub_order_id: subOrder.id,
      from_status:  subOrder.status,
      to_status:    'cancelled',
      changed_by:   userId,
      notes:        reason,
    });

    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, inventory_id')
      .eq('sub_order_id', subOrder.id);

    for (const item of (items || [])) {
      if (item.inventory_id) {
        const { error: stockErr } = await supabaseAdmin.rpc('increment_inventory_stock', {
          p_inventory_id: item.inventory_id,
          p_amount:       item.quantity,
        });
        if (stockErr) {
          logger.error('cancelOrder: stock restore failed', {
            inventoryId: item.inventory_id, error: stockErr.message,
          });
        }
      }
    }

    await notificationService.sendNotification(
      userId,
      'order_cancelled',
      'Order Cancelled',
      `Sub-order ${subOrder.id} has been cancelled.`,
      { order_id: orderId, sub_order_id: subOrder.id }
    );

    results.push(subOrder.id);
  }

  logger.info('cancelOrder: done', { orderId, userId, cancelledSubOrders: results, reason });
  return { cancelledSubOrders: results };
}

// ────────────────────────────────────────────────────────────
// updateSubOrderStatus — shop/rider status transitions
// ────────────────────────────────────────────────────────────
export async function updateSubOrderStatus(subOrderId, newStatus, userRole, shopId, opts = {}) {
  const { reason } = opts;

  const { data: subOrder, error } = await supabaseAdmin
    .from('sub_orders')
    .select('id, status, order_id, orders!inner(customer_id, order_number)')
    .eq('id', subOrderId)
    .single();

  if (error || !subOrder) throw new NotFoundError('Sub-order not found');

  // Enforce state machine transition
  assertTransition(subOrder.status, newStatus, userRole);

  const now = new Date().toISOString();
  const timestampMap = {
    confirmed:        'confirmed_at',
    preparing:        'preparing_at',
    ready_for_pickup: 'ready_at',
    out_for_delivery: 'picked_up_at',
    delivered:        'delivered_at',
    cancelled:        'cancelled_at',
  };

  const updatePayload = { status: newStatus, updated_at: now };
  if (timestampMap[newStatus]) updatePayload[timestampMap[newStatus]] = now;
  if (reason) updatePayload.cancellation_reason = reason;

  const { error: updateErr } = await supabaseAdmin
    .from('sub_orders')
    .update(updatePayload)
    .eq('id', subOrderId);
  if (updateErr) throw updateErr;

  // Audit log
  await supabaseAdmin.from('sub_order_status_history').insert({
    sub_order_id: subOrderId,
    from_status:  subOrder.status,
    to_status:    newStatus,
    notes:        reason,
  });

  // B1: Notify relevant party on each status change using typed helpers (include SMS)
  const customerId  = subOrder.orders.customer_id;
  const orderNumber = subOrder.orders.order_number;
  const orderId     = subOrder.order_id;

  if (newStatus === 'confirmed') {
    notificationService.notifyOrderConfirmed(customerId, orderNumber, orderId);
  } else if (newStatus === 'preparing') {
    notificationService.notifyOrderPreparing(customerId, orderNumber, orderId);
  } else if (newStatus === 'out_for_delivery') {
    notificationService.notifyOutForDelivery(customerId, orderNumber, orderId, subOrderId);
  } else if (newStatus === 'delivered') {
    notificationService.notifyDelivered(customerId, orderNumber, orderId);
  } else if (newStatus === 'rejected') {
    notificationService.notifyOrderRejected(customerId, orderNumber, orderId, reason);
  }

  // P5-1: Push status change over WebSocket
  broadcastOrderStatus(orderId, newStatus, {
    order_number: orderNumber,
    sub_order_id: subOrderId,
  });

  logger.info('Sub-order status updated', {
    subOrderId, from: subOrder.status, to: newStatus, role: userRole,
  });

  return { subOrderId, previousStatus: subOrder.status, newStatus };
}
