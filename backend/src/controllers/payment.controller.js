// ────────────────────────────────────────────────────────────
// Payment Controller
// Handles Razorpay order creation, verification, and webhooks
// ────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { razorpay } from '../config/razorpay.js';
import { supabaseAdmin } from '../config/supabase.js';
import { PaymentError, NotFoundError } from '../utils/errors.js';
import * as paymentService from '../services/payment.service.js'; // P1-B
import * as notificationService from '../services/notification.service.js'; // P1-B
import * as returnService from '../services/return.service.js'; // P6-3
import logger from '../utils/logger.js';


export async function createRazorpayOrder(req, res, next) {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    // Fetch the parent order (validates it belongs to this customer)
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, order_number')
      .eq('id', orderId)
      .eq('customer_id', userId)
      .single();

    if (error || !order) throw new NotFoundError('Order not found');

    // TODO: Check no existing captured payment for this order

    // Create Razorpay order
    // total_amount is stored in PAISE (bigint) — pass directly, no multiplication needed
    const razorpayOrder = await razorpay.orders.create({
      amount: order.total_amount,   // already in paise ✓
      currency: 'INR',
      receipt: order.order_number,
      notes: { order_id: order.id },
    });

    // Update payment record with razorpay_order_id
    await supabaseAdmin
      .from('payments')
      .update({ razorpay_order_id: razorpayOrder.id, updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('status', 'pending');

    res.json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;
    const userId = req.user.id;

    // Verify Razorpay signature: HMAC SHA256 of "orderId|paymentId" with secret
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      throw new PaymentError('Payment signature verification failed');
    }

    // Update payment record to captured
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .update({
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        status: 'captured',
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_order_id', razorpayOrderId);

    if (paymentError) throw paymentError;

    // TODO: The sub_orders for this parent order are now visible to the shop
    // They were created in 'pending' status during placeOrder — no further action needed
    // The shop will see them in their dashboard immediately

    res.json({ success: true, data: { message: 'Payment verified successfully', orderId } });
  } catch (err) {
    next(err);
  }
}

export async function handleWebhook(req, res, next) {
  try {
    // Verify Razorpay webhook signature
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== webhookSignature) {
      return res.status(400).json({ success: false, error: { message: 'Invalid webhook signature' } });
    }

    const { event, payload } = req.body;

    // Handle relevant payment events
    switch (event) {
      case 'payment.captured': {
        const { order_id: razorpayOrderId, id: razorpayPaymentId } = payload.payment.entity;
        await supabaseAdmin
          .from('payments')
          .update({ razorpay_payment_id: razorpayPaymentId, status: 'captured', updated_at: new Date().toISOString() })
          .eq('razorpay_order_id', razorpayOrderId);
        break;
      }
      case 'payment.failed': {
        const { order_id: razorpayOrderId, error_description } = payload.payment.entity;
        await supabaseAdmin
          .from('payments')
          .update({ status: 'failed', failure_reason: error_description, updated_at: new Date().toISOString() })
          .eq('razorpay_order_id', razorpayOrderId);
        // TODO: Cancel associated sub_orders if payment fails
        break;
      }
      case 'refund.created': {
        // Razorpay has accepted the refund and it's now being processed.
        // Our refund row was already inserted by payment.service.initiateRefund().
        // Update with the Razorpay refund ID if it arrived via webhook rather than API response.
        const rfndEntity = payload.refund?.entity;
        if (rfndEntity?.id && rfndEntity?.payment_id) {
          await supabaseAdmin
            .from('refunds')
            .update({ razorpay_refund_id: rfndEntity.id })
            .eq('razorpay_payment_id', rfndEntity.payment_id)
            .is('razorpay_refund_id', null); // only update if not already set
          logger.info('webhook: refund.created', { razorpayRefundId: rfndEntity.id });
        }
        break;
      }
      case 'refund.processed': {
        // Razorpay has successfully completed the refund — money is back to customer.
        const rfndEntity = payload.refund?.entity;
        if (!rfndEntity?.id) break;

        // 1. Mark refund as processed in DB
        await paymentService.markRefundProcessed(rfndEntity.id);

        // 2. P6-3: If this refund was created by a return request, mark the return as refunded
        returnService.markReturnRefunded(rfndEntity.id).catch(err =>
          logger.warn('webhook: markReturnRefunded failed', { razorpayRefundId: rfndEntity.id, err: err.message })
        );

        // 3. Find the order to notify the customer
        const refundRecord = await paymentService.getRefundByRazorpayId(rfndEntity.id);
        if (refundRecord) {
          // Look up order to get customer_id and order_number
          const { data: orderRow } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, customer_id')
            .eq('id', refundRecord.order_id)
            .single();

          if (orderRow) {
            const amountRupees = (refundRecord.amount_paise / 100).toFixed(2);
            notificationService.notifyRefundProcessed(
              orderRow.customer_id,
              orderRow.order_number,
              orderRow.id,
              amountRupees
            );
          }
        }

        logger.info('webhook: refund.processed', { razorpayRefundId: rfndEntity.id });
        break;
      }
      default:
        // Acknowledge unknown events without action
        break;
    }

    // Always respond 200 to Razorpay to confirm receipt
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
