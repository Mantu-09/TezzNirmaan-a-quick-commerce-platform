import client from './client';
import * as SecureStore from 'expo-secure-store';

/**
 * Step 1: Request OTP to be sent to a phone number.
 * Phone format: '+91XXXXXXXXXX'
 */
export async function requestOtp(phone) {
  // Supabase Auth OTP via backend proxy
  return client.post('/auth/otp/request', { phone });
}

/**
 * Step 2: Verify OTP and receive a session token.
 * Backend expects { phone, token } — NOT { phone, otp }
 * Returns unwrapped { access_token, refresh_token, user, ... }
 */
export async function verifyOtp(phone, otp) {
  // Backend field is 'token', not 'otp' (Supabase terminology)
  const data = await client.post('/auth/otp/verify', { phone, token: otp });
  // Backend returns snake_case Supabase session: { access_token, refresh_token, user }
  const accessToken = data?.session?.access_token || data?.access_token || data?.token;
  const user        = data?.user;
  if (accessToken) {
    await SecureStore.setItemAsync('auth_token', accessToken);
    if (data?.session?.refresh_token) {
      await SecureStore.setItemAsync('auth_refresh', data.session.refresh_token);
    }
    if (user) {
      await SecureStore.setItemAsync('auth_user', JSON.stringify(user));
    }
  }
  return { token: accessToken, user };
}

/**
 * Sign out — clear stored credentials.
 */
export async function signOut() {
  await SecureStore.deleteItemAsync('auth_token').catch(() => {});
  await SecureStore.deleteItemAsync('auth_refresh').catch(() => {});
  await SecureStore.deleteItemAsync('auth_user').catch(() => {});
}

/**
 * Get stored user (used during app boot to restore session).
 */
export async function getStoredSession() {
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    const userStr = await SecureStore.getItemAsync('auth_user');
    if (!token || !userStr) return null;
    return { token, user: JSON.parse(userStr) };
  } catch {
    return null;
  }
}

/**
 * P1-A: Register this device's Expo push token with the backend.
 * Called after push permission is granted on app launch.
 * @param {string} expoPushToken  - "ExponentPushToken[xxxxxx]"
 */
export async function savePushToken(expoPushToken) {
  return client.patch('/auth/push-token', { token: expoPushToken });
}
