// ────────────────────────────────────────────────────────────
// Profile API Client
// ────────────────────────────────────────────────────────────
import { client } from './client';

/**
 * GET /customer/profile
 * Returns { profile: { id, full_name, phone, email, avatar_url, role, created_at } }
 */
export const getProfile = () =>
  client.get('/customer/profile');

/**
 * PATCH /customer/profile
 * Body: { fullName?, phone? }
 * Returns { profile: { id, full_name, phone, email, ... } }
 */
export const updateProfile = (updates) =>
  client.patch('/customer/profile', updates);

/**
 * DELETE /customer/account
 * Body: { confirmation: "DELETE MY ACCOUNT" }
 * Permanently erases all personal data (GDPR / DPDP Act 2023).
 */
export const deleteAccount = () =>
  client.delete('/customer/account', {
    data: { confirmation: 'DELETE MY ACCOUNT' },
  });
