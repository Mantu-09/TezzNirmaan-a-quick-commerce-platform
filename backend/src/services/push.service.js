// ────────────────────────────────────────────────────────────
// Push Notification Service — P1-A
//
// Sends Expo push notifications (delivers via FCM on Android,
// APNs on iOS) using the Expo Push API.
//
// Contract: ALL functions are fire-and-forget and NEVER throw.
// A push failure must never crash an order flow or any API call.
//
// Env var required:
//   EXPO_ACCESS_TOKEN  — from expo.dev → Account Settings → Access Tokens
//                        Needed to use the enhanced Expo Push API with
//                        higher throughput limits and delivery receipts.
// ────────────────────────────────────────────────────────────
import Expo from 'expo-server-sdk';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// Create Expo client once — reused for every send call.
// accessToken is optional but strongly recommended for production.
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
  useFcmV1:    true, // Use FCM v1 API (required after June 2024 Google deprecation)
});

// ── Android notification channels ────────────────────────────
// Must match the channels registered in the mobile app.
const CHANNEL_ORDERS  = 'orders';   // High priority, vibration
const CHANNEL_GENERAL = 'general';  // Default priority

function getChannelId(type) {
  const orderTypes = [
    'order_placed', 'order_confirmed', 'order_preparing',
    'new_order', 'new_assignment', 'out_for_delivery',
    'delivered', 'order_rejected', 'order_cancelled',
  ];
  return orderTypes.includes(type) ? CHANNEL_ORDERS : CHANNEL_GENERAL;
}

// ── Core send function ────────────────────────────────────────

/**
 * Send a push notification to a single Expo push token.
 * Fire-and-forget — does not throw, logs failures.
 *
 * @param {string} expoPushToken  - e.g. "ExponentPushToken[xxxxxx]"
 * @param {string} title          - notification title
 * @param {string} body           - notification body text
 * @param {object} data           - deep-link data ({ type, orderId, ... })
 */
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken) return;

  if (!Expo.isExpoPushToken(expoPushToken)) {
    logger.warn('push.service: invalid Expo push token', { token: expoPushToken });
    return;
  }

  const message = {
    to:        expoPushToken,
    sound:     'default',
    title,
    body,
    data,
    channelId: getChannelId(data.type),
    // Android badge count (not supported by Expo API v1 for Android, but harmless)
    badge:     1,
    // Priority — use 'high' for order-critical events
    priority:  getChannelId(data.type) === CHANNEL_ORDERS ? 'high' : 'normal',
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      // Process tickets — an 'error' ticket means the message was rejected at send time
      for (const ticket of ticketChunk) {
        if (ticket.status === 'error') {
          logger.error('push.service: send-time error', {
            error:   ticket.message,
            details: ticket.details,
            token:   expoPushToken,
          });
          // DeviceNotRegistered: the user uninstalled the app or revoked permissions.
          // Remove the stale token so we don't keep trying.
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await removeExpoPushToken(expoPushToken);
          }
        }
      }
    }
  } catch (err) {
    // Network errors, Expo API down, etc. — log and swallow.
    logger.error('push.service: unexpected error (non-fatal)', {
      error: err.message,
      token: expoPushToken,
    });
  }
}

/**
 * Send push notifications to multiple tokens at once.
 * Expo automatically batches up to 100 per API call.
 *
 * @param {Array<{ token, title, body, data }>} notifications
 */
export async function sendBulkPushNotifications(notifications) {
  const messages = notifications
    .filter(n => n.token && Expo.isExpoPushToken(n.token))
    .map(n => ({
      to:        n.token,
      sound:     'default',
      title:     n.title,
      body:      n.body,
      data:      n.data || {},
      channelId: getChannelId(n.data?.type),
      priority:  getChannelId(n.data?.type) === CHANNEL_ORDERS ? 'high' : 'normal',
    }));

  if (messages.length === 0) return;

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          logger.error('push.service: bulk send-time error', {
            error: ticket.message, details: ticket.details,
          });
        }
      }
    }
  } catch (err) {
    logger.error('push.service: bulk send failed (non-fatal)', { error: err.message });
  }
}

/**
 * Fetch a user's Expo push token from their profile.
 * Returns null if not set or on any error.
 */
export async function getUserPushToken(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .single();
    return data?.expo_push_token || null;
  } catch {
    return null;
  }
}

/**
 * Save (or update) a user's Expo push token.
 * Called from PATCH /auth/push-token endpoint.
 */
export async function saveExpoPushToken(userId, token) {
  if (!token || !Expo.isExpoPushToken(token)) {
    logger.warn('push.service: attempted to save invalid token', { userId, token });
    return;
  }
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId);

  if (error) {
    logger.error('push.service: failed to save push token', {
      userId, error: error.message,
    });
    throw error;
  }
  logger.info('push.service: push token saved', { userId });
}

/**
 * Remove a stale Expo push token (DeviceNotRegistered).
 * Non-throwing — called internally from sendPushNotification.
 */
async function removeExpoPushToken(token) {
  try {
    await supabaseAdmin
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('expo_push_token', token);
    logger.info('push.service: stale token removed', { token });
  } catch (err) {
    logger.warn('push.service: failed to remove stale token', { error: err.message });
  }
}
