// ────────────────────────────────────────────────────────────
// Payment Controller
// Handles Razorpay order creation, verification, and webhooks
// ────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { razorpay } from '../config/razorpay.js';
import { supabaseAdmin } from '../config/supabase.js';
import { PaymentError, NotFoundError } from '../utils/errors.js';

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

    // Create Razorpay order (amount in paise — multiply INR by 100)
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.total_amount * 100),
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
        // TODO: Update payment status to 'refund_initiated', store refund amount
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
