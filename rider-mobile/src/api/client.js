import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://localhost:3000/api/v1';

export const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach auth token ──────────────────
client.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch (_) {
      // SecureStore unavailable (e.g. simulator without keychain) — continue without token
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: unwrap {success, data} envelope ───
client.interceptors.response.use(
  (response) => {
    // Backend always returns { success: true, data: { ... } }
    return response.data?.data ?? response.data;
  },
  async (error) => {
    const status  = error.response?.status;
    const message = error.response?.data?.error?.message || error.message || 'Something went wrong';

    // 401 → clear stored token (session expired)
    if (status === 401) {
      await SecureStore.deleteItemAsync('auth_token').catch(() => {});
      // The authStore's onTokenExpired callback will be called by consumers
    }

    const appError = new Error(message);
    appError.status  = status;
    appError.code    = error.response?.data?.error?.code;
    return Promise.reject(appError);
  }
);

export default client;
