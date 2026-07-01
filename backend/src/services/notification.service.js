// ────────────────────────────────────────────────────────────
// Notification Service
//
// V1 approach: insert into `notifications` table.
// Supabase Realtime broadcasts to subscribed frontend clients instantly.
// No external push/SMS service needed for V1.
//
// To enable Realtime on the notifications table, run in Supabase:
//   ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

/**
 * Send a notification to a user.
 * Inserts a row in the notifications table — Supabase Realtime handles delivery.
 *
 * @param {string}  userId   - profile UUID of the recipient
 * @param {string}  type     - notification type key (e.g. 'order_confirmed')
 * @param {string}  title    - short heading (shown in push/toast)
 * @param {string}  message  - full message body
 * @param {object}  metadata - deep-link data { order_id, sub_order_id, ... }
 */
export async function sendNotification(userId, type, title, message, metadata = {}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({ user_id: userId, type, title, message, metadata })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to insert notification', { userId, type, error: error.message });
      return null;
    }

    logger.debug('Notification sent', { notificationId: data.id, userId, type });
    return data.id;
  } catch (err) {
    // Notifications are non-critical — never let a notification failure break a request
    logger.error('Unexpected notification error', { userId, type, error: err.message });
    return null;
  }
}

/**
 * Get unread notifications for a user.
 */
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

/**
 * Mark specific notifications as read.
 */
export async function markRead(userId, notificationIds) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .in('id', notificationIds);

  if (error) throw error;
  return { markedRead: notificationIds.length };
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllRead(userId) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return { message: 'All notifications marked as read' };
}

// ── Typed notification helpers ────────────────────────────

export function notifyOrderPlaced(userId, orderNumber, orderId) {
  return sendNotification(userId, 'order_placed', 'Order Placed! 🎉',
    `Your order ${orderNumber} has been placed. The shop will confirm it shortly.`,
    { order_id: orderId, order_number: orderNumber });
}

export function notifyOrderConfirmed(userId, orderNumber, orderId) {
  return sendNotification(userId, 'order_confirmed', 'Order Confirmed ✅',
    `Great news! Your order ${orderNumber} has been confirmed and is being prepared.`,
    { order_id: orderId, order_number: orderNumber });
}

export function notifyOutForDelivery(userId, orderNumber, orderId, subOrderId) {
  return sendNotification(userId, 'out_for_delivery', 'On the way! 🛵',
    `Your order ${orderNumber} is out for delivery. The rider will arrive soon.`,
    { order_id: orderId, sub_order_id: subOrderId, order_number: orderNumber });
}

export function notifyDelivered(userId, orderNumber, orderId) {
  return sendNotification(userId, 'delivered', 'Delivered! 📦',
    `Your order ${orderNumber} has been delivered. Thank you for shopping with TezzNirmaan!`,
    { order_id: orderId, order_number: orderNumber });
}

export function notifyOrderRejected(userId, orderNumber, orderId, reason) {
  return sendNotification(userId, 'order_rejected', 'Order Rejected',
    `We\'re sorry, your order ${orderNumber} was rejected. Reason: ${reason || 'No reason provided.'}`,
    { order_id: orderId, order_number: orderNumber });
}

export function notifyShopNewOrder(shopOwnerId, orderNumber, orderId, itemCount) {
  return sendNotification(shopOwnerId, 'new_order', `New Order! 🔔`,
    `You have a new order ${orderNumber} with ${itemCount} items waiting for confirmation.`,
    { order_id: orderId, order_number: orderNumber });
}

export function notifyLowStock(shopOwnerId, productName, stockQty) {
  return sendNotification(shopOwnerId, 'low_stock', 'Low Stock Alert ⚠️',
    `"${productName}" is running low — only ${stockQty} units remaining.`,
    { product_name: productName });
}
