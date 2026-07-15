// ────────────────────────────────────────────────────────────
// Notification Service — B1 Enhanced
//
// V2 approach:
//   1. Insert into `notifications` table → Supabase Realtime delivers in-app
//   2. Send SMS via Fast2SMS for critical events (order lifecycle)
//
// Fail-silently contract: sendNotification() NEVER throws.
// Both in-app and SMS failures are logged and swallowed.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import * as smsService from './sms.service.js';
import logger from '../utils/logger.js';

// ── Internal helpers ─────────────────────────────────────────

/**
 * Look up a user's phone number from the profiles table.
 * Returns null on any failure — SMS is non-critical.
 */
async function getUserPhone(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('phone')
      .eq('id', userId)
      .single();
    return data?.phone || null;
  } catch {
    return null;
  }
}

// ── Core function ─────────────────────────────────────────────

/**
 * Send a notification to a user.
 *   1. Inserts into notifications table (→ Supabase Realtime)
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

  // ── 1. Insert into notifications table ────────────────────
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

  // ── 2. Send SMS (fire-and-forget, non-blocking) ───────────
  if (sendSms) {
    // Don't await — SMS runs in background, never blocks the response
    getUserPhone(userId)
      .then(phone => {
        if (phone) {
          // Keep SMS concise (max ~120 chars for good deliverability)
          const smsBody = `TezzNirmaan: ${message}`;
          return smsService.send(phone, smsBody);
        }
      })
      .catch(err => {
        logger.error('SMS fire-and-forget error', { userId, type, error: err.message });
      });
  }

  return notificationId;
}

// ── Read / Update ─────────────────────────────────────────────

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

// ── Typed notification helpers ────────────────────────────────
// Each helper encapsulates the correct type key, title, and message template.
// sendSms defaults are set per event based on importance.

export function notifyOrderPlaced(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'order_placed',
    'Order Placed! 🎉',
    `Your order ${orderNumber} has been placed. The shop will confirm it shortly.`,
    { order_id: orderId, order_number: orderNumber },
    true  // SMS: yes — customer confirmation is critical
  );
}

export function notifyShopNewOrder(shopOwnerId, orderNumber, orderId, itemCount) {
  return sendNotification(
    shopOwnerId,
    'new_order',
    `New Order! 🔔`,
    `New order ${orderNumber} received — ${itemCount} item${itemCount !== 1 ? 's' : ''} waiting for confirmation.`,
    { order_id: orderId, order_number: orderNumber },
    true  // SMS: yes — shop owner must be alerted even if dashboard is closed
  );
}

export function notifyOrderConfirmed(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'order_confirmed',
    'Order Confirmed ✅',
    `Your order ${orderNumber} is confirmed and being prepared.`,
    { order_id: orderId, order_number: orderNumber },
    true
  );
}

export function notifyOrderPreparing(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'order_preparing',
    'Order Being Packed 📦',
    `Your order ${orderNumber} is being packed. A rider will be assigned shortly.`,
    { order_id: orderId, order_number: orderNumber },
    false  // SMS: no — low-urgency status update
  );
}

export function notifyRiderNewAssignment(riderId, orderNumber, subOrderId, deliveryOtp) {
  return sendNotification(
    riderId,
    'new_assignment',
    'New Delivery Assignment 🛵',
    `Order ${orderNumber} is ready for pickup. Delivery OTP: ${deliveryOtp}`,
    { sub_order_id: subOrderId, order_number: orderNumber },
    true  // SMS: yes — rider may not have the app open
  );
}

export function notifyOutForDelivery(customerId, orderNumber, orderId, subOrderId) {
  return sendNotification(
    customerId,
    'out_for_delivery',
    'On the Way! 🛵',
    `Your order ${orderNumber} is out for delivery. The rider will arrive soon.`,
    { order_id: orderId, sub_order_id: subOrderId, order_number: orderNumber },
    true
  );
}

export function notifyDelivered(customerId, orderNumber, orderId) {
  return sendNotification(
    customerId,
    'delivered',
    'Delivered! 🎉',
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
    false  // SMS: no — customer initiated, they know
  );
}

export function notifyLowStock(shopOwnerId, productName, stockQty) {
  return sendNotification(
    shopOwnerId,
    'low_stock',
    'Low Stock Alert ⚠️',
    `"${productName}" is running low — only ${stockQty} units left.`,
    { product_name: productName },
    false  // SMS: no — non-critical operational alert
  );
}
