// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// order-lifecycle.service.js â€” P5-4A: Order Service Split
//
// Contains: cancelOrderByCustomer, cancelOrder, updateSubOrderStatus
//
// State machine is enforced for ALL transitions.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { supabaseAdmin } from '../../config/supabase.js';
import { assertTransition } from '../../utils/stateMachine.js';
import { NotFoundError, AppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import * as notificationService from '../notification.service.js';
import { invalidateShopInventoryCache } from '../cache.service.js'; // P2-C
import { broadcastOrderStatus }         from '../../lib/websocket.js'; // P5-1
import * as wa from '../whatsapp.service.js'; // P13-2: WhatsApp notifications


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// cancelOrderByCustomer â€” P1-B
//
// Full production cancel flow:
//   1. Ownership + existence check
//   2. 30-minute cancellation window enforcement
//   3. Status gate â€” block if shop has started preparing
//   4. Cancel all eligible sub_orders via state machine
//   5. Restore stock for each cancelled sub_order
//   6. Initiate Razorpay refund if payment was captured
//   7. Notify customer + shop owner
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function cancelOrderByCustomer(orderId, userId, reason) {
  // â”€â”€ 1. Fetch order with sub_orders and payment info â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 2. 30-minute cancellation window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 3. Block if any sub_order is past the cancellable stage â”€â”€
  const CANCELLABLE = ['pending', 'confirmed'];
  const blockingSubOrders = order.sub_orders.filter(
    so => !CANCELLABLE.includes(so.status)
  );

  if (blockingSubOrders.length > 0) {
    throw new AppError(
      'Cannot cancel â€” your order is already being prepared. ' +
      'Please contact the shop directly for assistance.',
      422,
      { shop_phone: order.shops?.phone }
    );
  }

  const nowStr = now.toISOString();

  // â”€â”€ 4. Cancel each sub_order via state machine + restore stock â”€
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

  // P2-C: stock was restored â€” invalidate so catalog shows updated availability
  const shopId = order.shops?.id;
  if (shopId) invalidateShopInventoryCache(shopId).catch(() => {});

  // â”€â”€ 5. Initiate refund â€” wallet first (P3-C), Razorpay fallback â”€â”€
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
      logger.error('cancelOrderByCustomer: refund initiation failed â€” manual action needed', {
        orderId,
        paymentId: payment.razorpay_payment_id,
        error:     refundErr.message,
      });
    }
  }

  // â”€â”€ 6. Notify customer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  notificationService.notifyOrderCancelled(
    userId,
    order.order_number,
    orderId,
    reason || 'Customer cancelled'
  );

  // P13-2: WhatsApp â€” fire-and-forget (non-fatal)
  supabaseAdmin.from('profiles').select('phone').eq('id', userId).maybeSingle().then(({ data: profile }) => {
    if (profile?.phone) {
      const refundRupees = payment?.status === 'captured' ? Math.round((payment.amount || 0) / 100) : 0;
      wa.notifyOrderCancelledWA(profile.phone, order.order_number, refundRupees).catch(() => {});
    }
  }).catch(() => {});


  // â”€â”€ 7. Notify shop owner (fire-and-forget) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// cancelOrder â€” shop/admin-initiated full order cancellation
//
// FIXED (Session H): Previously missing refund logic.
// Now restores stock AND initiates refund (wallet or Razorpay).
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function cancelOrder(orderId, actorUserId, reason) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, customer_id, order_number,
      sub_orders(id, status),
      payments(method, status, razorpay_payment_id, amount)
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) throw new NotFoundError('Order not found');

  const now = new Date().toISOString();
  const results = [];
  let totalRefundPaise = 0;

  for (const subOrder of order.sub_orders) {
    try { assertTransition(subOrder.status, 'cancelled', 'admin'); } catch { continue; }

    await supabaseAdmin
      .from('sub_orders')
      .update({ status: 'cancelled', cancelled_at: now, cancellation_reason: reason, updated_at: now })
      .eq('id', subOrder.id);

    await supabaseAdmin.from('sub_order_status_history').insert({
      sub_order_id: subOrder.id,
      from_status:  subOrder.status,
      to_status:    'cancelled',
      changed_by:   actorUserId,
      notes:        reason,
    });

    // â”€â”€ Stock restore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, inventory_id, unit_price')
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
      totalRefundPaise += (item.unit_price || 0) * item.quantity;
    }

    results.push(subOrder.id);
  }

  // â”€â”€ Refund â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FIXED: shop/admin cancellation must also refund the customer.
  if (results.length > 0 && totalRefundPaise > 0) {
    const payment = order.payments?.[0];
    try {
      const { refundToWalletOrRazorpay } = await import('../payment.service.js');
      await refundToWalletOrRazorpay({
        userId:            order.customer_id,
        orderId,
        orderNumber:       order.order_number,
        amountPaise:       totalRefundPaise,
        reason:            reason || 'Order cancelled',
        razorpayPaymentId: payment?.razorpay_payment_id || null,
        preferWallet:      true,
      });
      logger.info('cancelOrder: refund initiated', { orderId, totalRefundPaise });
    } catch (refundErr) {
      logger.error('cancelOrder: refund failed â€” MANUAL ACTION NEEDED', {
        orderId, totalRefundPaise, error: refundErr.message,
      });
    }
  }

  // â”€â”€ Notify customer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  notificationService.sendNotification(
    order.customer_id,
    'order_cancelled',
    'Order Cancelled',
    `Your order ${order.order_number} has been cancelled. ${reason || ''}`.trim(),
    { order_id: orderId }
  );

  logger.info('cancelOrder: done', { orderId, actorUserId, cancelledSubOrders: results, reason });
  return { cancelledSubOrders: results };
}


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// updateSubOrderStatus â€” shop/rider status transitions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function updateSubOrderStatus(subOrderId, newStatus, userRole, shopId, opts = {}) {
  const { reason } = opts;

  const { data: subOrder, error } = await supabaseAdmin
    .from('sub_orders')
    .select('id, status, order_id, total_amount, orders!inner(customer_id, order_number, total_amount)')
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

    // â”€â”€ FIXED (Session H): Shop rejection must restore stock + refund â”€â”€
    // Previously only sent a notification â€” customer was left charged
    // and stock unreturned when a shop rejected their sub-order.
    setImmediate(async () => {
      try {
        // 1. Restore stock for each item in this sub-order
        const { data: items } = await supabaseAdmin
          .from('order_items')
          .select('inventory_id, quantity, unit_price')
          .eq('sub_order_id', subOrderId);

        let subOrderTotalPaise = 0;
        for (const item of (items || [])) {
          if (item.inventory_id) {
            await supabaseAdmin.rpc('increment_inventory_stock', {
              p_inventory_id: item.inventory_id,
              p_amount:       item.quantity,
            }).catch(e => logger.error('rejected: stock restore failed', { inventoryId: item.inventory_id, error: e.message }));
          }
          subOrderTotalPaise += (item.unit_price || 0) * item.quantity;
        }

        // 2. Refund the sub-order amount (wallet first, then Razorpay)
        if (subOrderTotalPaise > 0) {
          const { data: orderRow } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payments(razorpay_payment_id)')
            .eq('id', orderId)
            .single();

          const { refundToWalletOrRazorpay } = await import('../payment.service.js');
          await refundToWalletOrRazorpay({
            userId:            customerId,
            orderId,
            orderNumber:       orderRow?.order_number || orderNumber,
            amountPaise:       subOrderTotalPaise,
            reason:            `Sub-order rejected by shop: ${reason || ''}`.trim(),
            razorpayPaymentId: orderRow?.payments?.[0]?.razorpay_payment_id || null,
            preferWallet:      true,
          });
          logger.info('updateSubOrderStatus: rejected sub-order refund initiated', { subOrderId, subOrderTotalPaise });
        }
      } catch (err) {
        logger.error('updateSubOrderStatus: rejected refund/stock-restore failed â€” MANUAL ACTION NEEDED', {
          subOrderId, orderId, error: err.message,
        });
      }
    });
  }


  // P13-2: WhatsApp notifications (fire-and-forget â€” never blocks order flow)
  supabaseAdmin.from('profiles').select('phone, name').eq('id', customerId).maybeSingle().then(({ data: profile }) => {
    const phone = profile?.phone;
    if (!phone) return;
    if (newStatus === 'confirmed') {
      wa.notifyOrderConfirmedWA(phone, orderNumber, 'your items', '').catch(() => {});
    } else if (newStatus === 'delivered') {
      wa.notifyOrderDeliveredWA(phone, orderNumber).catch(() => {});
    } else if (newStatus === 'cancelled' || newStatus === 'rejected') {
      wa.notifyOrderCancelledWA(phone, orderNumber, 0).catch(() => {});
    }

    // P17-6: SMS fallback (fire-and-forget, non-fatal)
    import('../../services/sms.service.js').then(sms => {
      const totalRupees = Math.round((subOrder.orders?.total_amount || 0) / 100);
      if (newStatus === 'confirmed') {
        sms.sendSMS(phone, sms.smsOrderConfirmed(orderNumber, totalRupees)).catch(() => {});
      } else if (newStatus === 'delivered') {
        sms.sendSMS(phone, sms.smsOrderDelivered(orderNumber)).catch(() => {});
      } else if (newStatus === 'cancelled' || newStatus === 'rejected') {
        sms.sendSMS(phone, sms.smsOrderCancelled(orderNumber, 0)).catch(() => {});
      }
    }).catch(() => {});
  }).catch(() => {});

  // P15-5: Auto rider assignment on confirmation (fire-and-forget)
  if (newStatus === 'confirmed') {
    import('../../services/rider-assignment.service.js')
      .then(({ autoAssignRider }) => autoAssignRider(orderId))
      .then(result => {
        if (result.assigned) logger.info('Auto-assigned rider', { orderId, rider_id: result.rider_id });
        else logger.info('Auto-assign: no rider available, manual assignment needed', { orderId });
      })
      .catch(err => logger.warn('Auto-assign error (non-fatal)', { error: err.message }));
  }

  // P19-5: Award loyalty stamp on delivery (fire-and-forget)
  if (newStatus === 'delivered') {
    supabaseAdmin
      .from('loyalty_stamps')
      .insert({ profile_id: customerId, order_id: orderId })
      .then(() => logger.info('Loyalty stamp awarded', { customerId, orderId }))
      .catch(() => {}); // non-fatal
  }


  broadcastOrderStatus(orderId, newStatus, {
    order_number: orderNumber,
    sub_order_id: subOrderId,
  });

  logger.info('Sub-order status updated', {
    subOrderId, from: subOrder.status, to: newStatus, role: userRole,
  });

  return { subOrderId, previousStatus: subOrder.status, newStatus };
}

