/**
 * usePushNotifications.js — R9
 *
 * Requests Expo push notification permission on first call,
 * gets the Expo push token, and registers it with the backend
 * (PATCH /customer/expo-push-token → profiles.expo_push_token).
 *
 * Also sets up Android notification channels used by push.service.js:
 *   - "orders"  (high priority, vibration) — order status updates
 *   - "general" (default priority)         — promos, broadcasts
 *
 * Call this hook ONCE from RootNavigator when the user is authenticated.
 * It is idempotent — safe to call on every app-open (token upserts on backend).
 *
 * Requires: expo-notifications, expo-device (both in package.json).
 */

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { client } from '../api/client';

// ── Foreground notification display ──────────────────────────
// By default Expo suppresses notifications when the app is in the foreground.
// This ensures order/rider alerts always show as banners with sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

// ── Android notification channels ────────────────────────────
// Must match channelId values in backend push.service.js
async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name:            'Order Updates',
    importance:      Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor:      '#E8740C',
    sound:           'default',
    description:     'Order confirmations, rider assignment, delivery updates',
  });
  await Notifications.setNotificationChannelAsync('general', {
    name:        'General',
    importance:  Notifications.AndroidImportance.DEFAULT,
    sound:       'default',
    description: 'Promotions, flash sales, announcements',
  });
}

// ── Register token with backend ───────────────────────────────
async function registerTokenWithBackend(token) {
  try {
    await client.patch('/customer/expo-push-token', { token });
  } catch (err) {
    // Non-fatal — push will still work until next successful registration
    if (__DEV__) console.warn('[usePushNotifications] token registration failed:', err.message);
  }
}

// ── Main hook ─────────────────────────────────────────────────
export default function usePushNotifications() {
  useEffect(() => {
    let cancelled = false;

    async function register() {
      // Push notifications only work on physical devices
      if (!Device.isDevice) {
        if (__DEV__) console.log('[usePushNotifications] Skipping — not a physical device');
        return;
      }

      // Set up Android channels first (no-op on iOS)
      await ensureAndroidChannels();

      // Request / check permissions
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        if (__DEV__) console.log('[usePushNotifications] Permission not granted — skipping token registration');
        return;
      }

      // Get Expo push token
      let tokenData;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync();
      } catch (err) {
        if (__DEV__) console.warn('[usePushNotifications] getExpoPushTokenAsync failed:', err.message);
        return;
      }

      if (cancelled) return;
      const token = tokenData?.data;
      if (!token) return;

      if (__DEV__) console.log('[usePushNotifications] Registering token:', token);
      await registerTokenWithBackend(token);
    }

    register();
    return () => { cancelled = true; };
  }, []); // Run once on mount — only called when user is authenticated
}
