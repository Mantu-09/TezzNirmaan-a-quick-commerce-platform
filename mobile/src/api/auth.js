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
 * Returns { token, user: { id, role, phone } }
 */
export async function verifyOtp(phone, otp) {
  const data = await client.post('/auth/otp/verify', { phone, otp });
  // Persist token to encrypted storage
  if (data?.token) {
    await SecureStore.setItemAsync('auth_token', data.token);
    await SecureStore.setItemAsync('auth_user', JSON.stringify(data.user));
  }
  return data;
}

/**
 * Sign out — clear stored credentials.
 */
export async function signOut() {
  await SecureStore.deleteItemAsync('auth_token').catch(() => {});
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
