// ────────────────────────────────────────────────────────────
// Payment Controller
// Handles Razorpay order creation, verification, and webhooks
// P8-2: payment.captured now enqueues a route-transfer job so shop
// payouts are processed automatically via Razorpay Route.
// ────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { razorpay }           from '../config/razorpay.js';
import { supabaseAdmin }      from '../config/supabase.js';
import { PaymentError, NotFoundError } from '../utils/errors.js';
import * as paymentService    from '../services/payment.service.js'; // P1-B
import * as notificationService from '../services/notification.service.js'; // P1-B
import * as returnService     from '../services/return.service.js'; // P6-3
import * as payoutService     from '../services/payout.service.js'; // P8-2
import { enqueueRouteTransfer } from '../lib/jobQueue.js';           // P8-2
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

    // Session N — H2: Guard against duplicate payment creation
    // If a captured payment already exists for this order (e.g. double-tap),
    // return the existing razorpay_order_id so client can show payment was done.
    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('razorpay_order_id, status')
      .eq('order_id', orderId)
      .in('status', ['captured', 'pending'])
      .maybeSingle();

    if (existingPayment?.status === 'captured') {
      logger.info('createRazorpayOrder: payment already captured, returning existing', { orderId });
      return res.json({
        success: true,
        data: {
          razorpayOrderId: existingPayment.razorpay_order_id,
          amount:          order.total_amount,
          currency:        'INR',
          keyId:           process.env.RAZORPAY_KEY_ID,
          alreadyCaptured: true,
        },
      });
    }

    // If a pending Razorpay order already exists for this payment, reuse it
    // (avoids creating orphaned Razorpay orders on retry)
    if (existingPayment?.status === 'pending' && existingPayment.razorpay_order_id) {
      logger.info('createRazorpayOrder: reusing existing pending Razorpay order', { orderId });
      return res.json({
        success: true,
        data: {
          razorpayOrderId: existingPayment.razorpay_order_id,
          amount:          order.total_amount,
          currency:        'INR',
          keyId:           process.env.RAZORPAY_KEY_ID,
        },
      });
    }

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

    // Session N: Guard — if secret is not configured, return 503 (not 500)
    // so Razorpay doesn't keep retrying with exponential backoff.
    if (!webhookSecret) {
      logger.error('handleWebhook: RAZORPAY_WEBHOOK_SECRET is not set');
      return res.status(503).json({ success: false, error: { message: 'Webhook not configured' } });
    }
    if (!webhookSignature) {
      return res.status(400).json({ success: false, error: { message: 'Missing webhook signature' } });
    }

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

        // P8-2: Enqueue Razorpay Route transfer — fire-and-forget
        // Never await this; webhook must respond 200 within Razorpay's 5s timeout.
        // The worker handles retry on failure (up to 3 attempts via pg-boss).
        const { data: orderRow } = await supabaseAdmin
          .from('orders')
          .select('id, customer_id, order_number')
          .eq('razorpay_order_id', razorpayOrderId)
          .maybeSingle();

        if (orderRow?.id) {
          enqueueRouteTransfer(orderRow.id, razorpayPaymentId).catch(err =>
            logger.warn('webhook: route-transfer enqueue failed (non-fatal)', {
              orderId: orderRow.id, razorpayPaymentId, error: err.message,
            })
          );

          // Session O: Notify customer that payment was captured and order is confirmed
          if (orderRow.customer_id && orderRow.order_number) {
            notificationService.notifyOrderPlaced(
              orderRow.customer_id,
              orderRow.order_number,
              orderRow.id,
            );
          }
        }
        break;
      }
      case 'payment.failed': {
        const { order_id: razorpayOrderId, error_description } = payload.payment.entity;

        // 1. Mark payment as failed
        await supabaseAdmin
          .from('payments')
          .update({ status: 'failed', failure_reason: error_description, updated_at: new Date().toISOString() })
          .eq('razorpay_order_id', razorpayOrderId);

        // Session N — H1: Cancel all sub_orders, restore stock, notify customer
        // (Previously was a TODO — orphaned sub_orders would pile up on payment failure)
        try {
          // Find the parent order and its sub_orders
          const { data: parentOrder } = await supabaseAdmin
            .from('orders')
            .select('id, customer_id, order_number')
            .eq('razorpay_order_id', razorpayOrderId)
            .maybeSingle();

          if (parentOrder) {
            const { data: subOrders } = await supabaseAdmin
              .from('sub_orders')
              .select('id, shop_id')
              .eq('order_id', parentOrder.id)
              .not('status', 'in', '("cancelled","rejected","delivered")');

            if (subOrders?.length) {
              // Cancel all active sub_orders
              await supabaseAdmin
                .from('sub_orders')
                .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                .in('id', subOrders.map(s => s.id));

              // Restore stock for each sub_order's items
              for (const sub of subOrders) {
                const { data: items } = await supabaseAdmin
                  .from('order_items')
                  .select('product_id, quantity, shop_id')
                  .eq('sub_order_id', sub.id);

                if (items?.length) {
                  for (const item of items) {
                    await supabaseAdmin.rpc('increment_inventory_stock', {
                      p_shop_id:   sub.shop_id,
                      p_product_id: item.product_id,
                      p_quantity:  item.quantity,
                    }).catch(err => logger.warn('webhook: stock restore failed', {
                      subOrderId: sub.id, productId: item.product_id, error: err.message,
                    }));
                  }
                }
              }
            }

            // Notify customer — non-blocking, fire-and-forget
            const { default: notificationService } = await import('../services/notification.service.js');
            notificationService.sendNotification(
              parentOrder.customer_id,
              'payment_failed',
              'Payment Failed',
              `Payment for Order #${parentOrder.order_number} could not be processed. ${error_description || 'Please try again.'}`,
              { order_id: parentOrder.id, order_number: parentOrder.order_number },
              true, // sendSms
            ).catch(() => {});

            logger.info('webhook: payment.failed — sub_orders cancelled, stock restored', {
              orderId:       parentOrder.id,
              subOrderCount: subOrders?.length ?? 0,
              reason:        error_description,
            });
          }
        } catch (cleanupErr) {
          // Cleanup failure is logged but must NOT cause webhook to fail (Razorpay retries on non-200)
          logger.error('webhook: payment.failed cleanup failed', { error: cleanupErr.message, razorpayOrderId });
        }

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

      // P8-2: Razorpay Route transfer events ————————————————————
      // These confirm/fail the automated payout to the shop's bank account.
      case 'transfer.processed': {
        payoutService.handleTransferProcessed(payload).catch(err =>
          logger.warn('webhook: transfer.processed handler failed', { error: err.message })
        );
        break;
      }
      case 'transfer.failed': {
        payoutService.handleTransferFailed(payload).catch(err =>
          logger.warn('webhook: transfer.failed handler failed', { error: err.message })
        );
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

// ── P10-4: POST /payments/razorpayx/webhook ──────────────────
// RazorpayX payout status webhook (separate from payment gateway).
// Signature verified using RAZORPAYX_WEBHOOK_SECRET via HMAC-SHA256.
// Always returns 200 — non-200 causes RazorpayX to retry.
export async function handleRazorpayXWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';

    // Extract raw body string BEFORE parsing — needed for HMAC verification.
    // JSON.stringify(parsedObject) changes key order/whitespace vs original bytes.
    let rawBody;
    let payload;
    if (Buffer.isBuffer(req.body)) {
      rawBody  = req.body.toString('utf8');
      payload  = JSON.parse(rawBody);
    } else if (typeof req.body === 'string') {
      rawBody  = req.body;
      payload  = JSON.parse(rawBody);
    } else {
      // express.json() already parsed it — rawBody unavailable, fall back
      rawBody  = undefined;
      payload  = req.body;
    }

    const { handlePayoutWebhook } = await import('../services/razorpay-payout.service.js');
    await handlePayoutWebhook(payload, signature, rawBody);

    res.status(200).json({ success: true });
  } catch (err) {
    // Log but still 200 — prevents infinite retry loop from RazorpayX
    logger.error('RazorpayX webhook error', { error: err.message });
    if (err.status === 401) {
      // Signature mismatch — return 400 to reject forged requests
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    res.status(200).json({ success: true });
  }
}
