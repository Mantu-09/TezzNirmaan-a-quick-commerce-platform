// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Notification Service â€” B1 Enhanced + P1-E (Job Queue)
//
// V3 approach:
//   1. Insert into `notifications` table â†’ Supabase Realtime delivers in-app
//   2. If job queue (pg-boss) is enabled, enqueue SMS + push as background jobs
//   3. If queue is disabled (DATABASE_URL not set), fall back to fire-and-forget
//
// Fail-silently contract: sendNotification() NEVER throws.
// Both in-app and SMS/push failures are logged and swallowed.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { supabaseAdmin } from '../config/supabase.js';
import * as smsService from './sms.service.js';
import * as pushService from './push.service.js'; // P1-A
import logger from '../utils/logger.js';
// P1-E: lazy import to avoid circular dep (jobQueue imports this file)
let _queue = null;
async function getJobQueue() {
  if (_queue !== undefined) return _queue;
  try {
    const { enqueueNotification, isQueueEnabled } = await import('../lib/jobQueue.js');
    _queue = isQueueEnabled() ? enqueueNotification : null;
  } catch {
    _queue = null;
  }
  return _queue;
}

// â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Look up a user's phone number AND push token from the profiles table.
 * Returns { phone, pushToken } â€” both nullable on failure.
 */
async function getUserContactInfo(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('phone, expo_push_token')
      .eq('id', userId)
      .single();
    return {
      phone:     data?.phone           || null,
      pushToken: data?.expo_push_token || null,
    };
  } catch {
    return { phone: null, pushToken: null };
  }
}

// â”€â”€ Core function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Send a notification to a user.
 *   1. Inserts into notifications table (â†’ Supabase Realtime)
 *   2. Sends SMS via Fast2SMS if sendSms = true
 *
 * @param {string}  userId   - profile UUID of the recipient
 * @param {string}  type     - notification type key (e.g. 'order_confirmed')
 * @param {string}  title    - short heading (shown in push/toast)
 * @param {string}  message  - full message body
 * @param {object}  metadata - deep-link data { order_id, sub_order_id, ... }
 * @param {boolean} sendSms  - whether to also send an SMS (default: true for critical events)
 * @returns {Promise<string|null>} notification ID or null on failure
 */
export async function sendNotification(userId, type, title, message, metadata = {}, sendSms = true) {
  let notificationId = null;

  // â”€â”€ 1. Insert into notifications table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({ user_id: userId, type, title, message, metadata })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to insert notification', { userId, type, error: error.message });
    } else {
      notificationId = data.id;
      logger.debug('In-app notification sent', { notificationId, userId, type });
    }
  } catch (err) {
    logger.error('Unexpected notification insert error', { userId, type, error: err.message });
  }

  // â”€â”€ 2. P1-E: Route SMS + push through job queue (or fire-and-forget fallback) â”€â”€
  // The job queue guarantees delivery with retries.
  // Fire-and-forget is used when DATABASE_URL is not configured.
  const { enqueueNotification, isQueueEnabled } = await import('../lib/jobQueue.js').catch(() => ({}));

  if (isQueueEnabled?.() && sendSms) {
    // Queue path: enqueue delivery as a background job
    // The job worker calls sendNotificationDirect() below
    try {
      await enqueueNotification(userId, type, title, message, { sendSms, metadata });
      logger.debug('Notification delivery enqueued', { userId, type });
    } catch (err) {
      // Queue failed â€” fall through to fire-and-forget
      logger.warn('Queue enqueue failed, falling back to fire-and-forget', { userId, type, error: err.message });
      _fireAndForget(userId, type, title, message, metadata, sendSms);
    }
  } else {
    // Fire-and-forget path (queue disabled OR sendSms = false)
    _fireAndForget(userId, type, title, message, metadata, sendSms);
  }

  return notificationId;
}

/**
 * Direct delivery â€” called by the pg-boss worker (P1-E) AND by the fallback path.
 * Sends SMS + push synchronously (awaited inside the worker).
 * Also exported so job queue workers can call it directly.
 *
 * @param {string} userId
 * @param {string} type
 * @param {string} title
 * @param {string} body
 * @param {object} jobData  { sendSms, metadata }
 */
export async function sendNotificationDirect(userId, type, title, body, jobData = {}) {
  const { sendSms = true, metadata = {} } = jobData;
  const { phone, pushToken } = await getUserContactInfo(userId);

  const deliveryJobs = [];

  if (sendSms && phone) {
    const smsBody = `TezzNirmaan: ${body}`;
    deliveryJobs.push(
      smsService.sendSMS(phone, smsBody)
        .catch(err => logger.error('SMS delivery error', { userId, type, error: err.message }))
    );
  }

  if (pushToken) {
    deliveryJobs.push(
      pushService.sendPushNotification(
        pushToken,
        title,
        body,
        { type, orderId: metadata?.order_id, subOrderId: metadata?.sub_order_id }
      )
    );
  }

  if (deliveryJobs.length > 0) {
    await Promise.allSettled(deliveryJobs);
    logger.debug('sendNotificationDirect complete', { userId, type, channels: deliveryJobs.length });
  }
}

/**
 * Internal fire-and-forget (non-blocking) delivery.
 * Used when the job queue is disabled.
 */
function _fireAndForget(userId, type, title, message, metadata, sendSms) {
  getUserContactInfo(userId)
    .then(({ phone, pushToken }) => {
      const jobs = [];

      if (sendSms && phone) {
        const smsBody = `TezzNirmaan: ${message}`;
        jobs.push(
          smsService.sendSMS(phone, smsBody)
            .catch(err => logger.error('SMS fire-and-forget error', { userId, type, error: err.message }))
        );
      }

      if (pushToken) {
        jobs.push(
          pushService.sendPushNotification(
            pushToken,
            title,
            message,
            { type, orderId: metadata?.order_id, subOrderId: metadata?.sub_order_id }
          )
        );
      }

      return Promise.allSettled(jobs);
    })
    .catch(err => {
      logger.error('Notification fire-and-forget error (non-fatal)', { userId, type, error: err.message });
    });
}

// â”€â”€ Read / Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Get notifications for a user (paginated). */
export async function getNotifications(userId, { page = 1, limit = 30 } = {}) {
  const from = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;
  return { notifications: data, pagination: { page: +page, limit: +limit, total: count } };
}

/** Get unread count for a user (for badge). */
export async function getUnreadCount(userId) {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
}

/** Mark specific notifications as read. */
export async function markRead(userId, notificationIds) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .in('id', notificationIds);

  if (error) throw error;
  return { markedRead: notificationIds.length };
}

/** Mark all notifications as read for a user. */
export async function markAllRead(userId) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return { message: 'All notifications marked as read' };
}

// â”€â”€ Typed notification helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each helper encapsulates the correct type key, title, and message template.
// sendSms defaults are set per event based on importance.

export function notifyOrderPlaced(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'order_placed',
    'Order Placed! ðŸŽ‰',
    `Your order ${orderNumber} has been placed. The shop will confirm it shortly.`,
    { order_id: orderId, order_number: orderNumber },
    true  // SMS: yes â€” customer confirmation is critical
  );
}

export function notifyShopNewOrder(shopOwnerId, orderNumber, orderId, itemCount) {
  return sendNotification(
    shopOwnerId,
    'new_order',
    `New Order! ðŸ””`,
    `New order ${orderNumber} received â€” ${itemCount} item${itemCount !== 1 ? 's' : ''} waiting for confirmation.`,
    { order_id: orderId, order_number: orderNumber },
    true  // SMS: yes â€” shop owner must be alerted even if dashboard is closed
  );
}

export function notifyOrderConfirmed(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'order_confirmed',
    'Order Confirmed âœ…',
    `Your order ${orderNumber} is confirmed and being prepared.`,
    { order_id: orderId, order_number: orderNumber },
    true
  );
}

export function notifyOrderPreparing(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'order_preparing',
    'Order Being Packed ðŸ“¦',
    `Your order ${orderNumber} is being packed. A rider will be assigned shortly.`,
    { order_id: orderId, order_number: orderNumber },
    false  // SMS: no â€” low-urgency status update
  );
}

export function notifyRiderNewAssignment(riderId, orderNumber, subOrderId, deliveryOtp) {
  return sendNotification(
    riderId,
    'new_assignment',
    'New Delivery Assignment ðŸ›µ',
    `Order ${orderNumber} is ready for pickup. Delivery OTP: ${deliveryOtp}`,
    { sub_order_id: subOrderId, order_number: orderNumber },
    true  // SMS: yes â€” rider may not have the app open
  );
}

export function notifyOutForDelivery(customerId, orderNumber, orderId, subOrderId) {
  return sendNotification(
    customerId,
    'out_for_delivery',
    'On the Way! ðŸ›µ',
    `Your order ${orderNumber} is out for delivery. The rider will arrive soon.`,
    { order_id: orderId, sub_order_id: subOrderId, order_number: orderNumber },
    true
  );
}

export function notifyDelivered(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'delivered',
    'Delivered! ðŸŽ‰',
    `Your order ${orderNumber} has been delivered. Thank you for shopping with TezzNirmaan!`,
    { order_id: orderId, order_number: orderNumber },
    true
  );
}

export function notifyOrderRejected(customerId, orderNumber, orderId, reason) {
  return sendNotification(
    customerId,
    'order_rejected',
    'Order Rejected',
    `Your order ${orderNumber} was rejected. ${reason ? `Reason: ${reason}` : 'Please contact support.'}`,
    { order_id: orderId, order_number: orderNumber },
    true
  );
}

export function notifyOrderCancelled(customerId, orderNumber, orderId, reason) {
  return sendNotification(
    customerId,
    'order_cancelled',
    'Order Cancelled',
    `Your order ${orderNumber} has been cancelled. ${reason ? `Reason: ${reason}` : ''}`.trim(),
    { order_id: orderId, order_number: orderNumber },
    false  // SMS: no â€” customer initiated, they know
  );
}

export function notifyLowStock(shopOwnerId, productName, stockQty) {
  return sendNotification(
    shopOwnerId,
    'low_stock',
    'Low Stock Alert âš ï¸',
    `"${productName}" is running low â€” only ${stockQty} units left.`,
    { product_name: productName },
    false  // SMS: no â€” non-critical operational alert
  );
}

// P1-B: Refund notification (triggered by refund.processed webhook from Razorpay)
export function notifyRefundProcessed(customerId, orderNumber, orderId, amountRupees) {
  return sendNotification(
    customerId,
    'refund_processed',
    'Refund Processed ðŸ’°',
    `Your refund of â‚¹${amountRupees} for order ${orderNumber} has been processed and ` +
    `will appear in your account within 5-7 business days.`,
    { order_id: orderId, order_number: orderNumber },
    true  // SMS: yes â€” customer must know the refund is on its way
  );
}

