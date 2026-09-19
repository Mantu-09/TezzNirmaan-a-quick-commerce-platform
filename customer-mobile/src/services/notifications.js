// ────────────────────────────────────────────────────────────
// mobile/src/services/notifications.js — P1-A
//
// Handles:
//   1. Requesting OS permission for push notifications
//   2. Registering Android notification channels
//   3. Getting the Expo push token and uploading it to the backend
//   4. Setting foreground notification handler behaviour
//
// Usage in App.jsx:
//   import { initPushNotifications } from './src/services/notifications';
//   useEffect(() => { initPushNotifications(authToken); }, [authToken]);
// ────────────────────────────────────────────────────────────
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── Foreground presentation behaviour ────────────────────────
// Show alert + sound even when the app is in the foreground.
// This is important for order status updates (e.g. "rider is nearby")
// that the customer shouldn't miss just because they have the app open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ── Android notification channels ────────────────────────────
// Must be created before any notification can be shown on Android 8+.
// These channels match the channelId values set in push.service.js.
async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('orders', {
    name:             'Order Updates',
    description:      'Real-time updates for your orders',
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor:       '#E8740C', // TezzNirmaan orange
    sound:            'default',
    enableVibrate:    true,
  });

  await Notifications.setNotificationChannelAsync('general', {
    name:        'General',
    description: 'App announcements and other notifications',
    importance:  Notifications.AndroidImportance.DEFAULT,
    sound:       'default',
  });
}

// ── Permission request ────────────────────────────────────────

/**
 * Request push notification permission from the OS.
 * On iOS this shows the system dialog; on Android 13+ (API 33)
 * this shows the permission dialog.
 * Returns the final permission status string.
 */
async function requestPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return 'granted';

  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

// ── Token retrieval ───────────────────────────────────────────

/**
 * Get the Expo push token for this device.
 * Simulators/emulators return null — only physical devices support push.
 *
 * @returns {string|null} Expo push token or null
 */
async function getExpoPushToken() {
  if (!Device.isDevice) {
    console.warn('[Push] Skipping push registration — not a physical device');
    return null;
  }

  const status = await requestPermission();
  if (status !== 'granted') {
    console.warn('[Push] Push notification permission denied');
    return null;
  }

  try {
    // projectId links the token to your EAS project for routing
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenResponse.data;
  } catch (err) {
    console.error('[Push] Failed to get Expo push token:', err.message);
    return null;
  }
}

// ── Main init function ────────────────────────────────────────

/**
 * Full push notification initialisation.
 * Call this once after the user is authenticated.
 *
 * @param {function} saveFn  - async (token: string) => void   (calls PATCH /auth/push-token)
 */
export async function initPushNotifications(saveFn) {
  try {
    await setupAndroidChannels();
    const token = await getExpoPushToken();
    if (token && typeof saveFn === 'function') {
      await saveFn(token);
    }
    return token;
  } catch (err) {
    // Never propagate — push setup must not crash the app
    console.error('[Push] initPushNotifications failed (non-fatal):', err.message);
    return null;
  }
}

// ── Listener helpers ──────────────────────────────────────────

/**
 * Subscribe to notification taps (background/killed state).
 * Returns the subscription object — call .remove() on unmount.
 *
 * @param {function} onTap   - ({ orderId, type }) => void
 */
export function addNotificationTapListener(onTap) {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const { orderId, subOrderId, type } =
      response.notification.request.content.data ?? {};
    onTap({ orderId, subOrderId, type });
  });
}

/**
 * Subscribe to notifications received in the foreground.
 * Returns the subscription object — call .remove() on unmount.
 *
 * @param {function} onReceive - (notification) => void
 */
export function addForegroundNotificationListener(onReceive) {
  return Notifications.addNotificationReceivedListener(onReceive);
}

/**
 * Clear the badge count (iOS only — Android manages its own badge).
 */
export async function clearBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // ignore on platforms that don't support badge
  }
}
