// mobile/src/api/cashback.js — P4-2B
// API helpers for cashback — used to preview earned cashback before/after delivery.
import { apiClient } from './client';

/**
 * Client-side cashback preview — calculates expected cashback for an order amount.
 * Mirrors the server-side tier logic (seeded defaults).
 * Used on OrderConfirmationScreen immediately after placing an order
 * without needing an extra API round-trip.
 *
 * @param {number} orderAmountPaise
 * @returns {{ paise: number, percent: number }}
 */
export function estimateCashback(orderAmountPaise) {
  const tiers = [
    { min: 0,      max: 49999,  percent: 1 },
    { min: 50000,  max: 199999, percent: 2 },
    { min: 200000, max: null,   percent: 3 },
  ];

  const tier = tiers.find(t =>
    orderAmountPaise >= t.min && (t.max === null || orderAmountPaise <= t.max)
  );

  if (!tier) return { paise: 0, percent: 0 };

  const paise = Math.floor(orderAmountPaise * tier.percent / 100);
  return { paise, percent: tier.percent };
}

/**
 * Fetch cashback rules from admin API.
 * Used only by the admin dashboard.
 */
export async function fetchCashbackRules() {
  const { data } = await apiClient.get('/admin/cashback/rules');
  return data.data.rules;
}

/**
 * Create a new cashback rule.
 */
export async function createCashbackRule(ruleData) {
  const { data } = await apiClient.post('/admin/cashback/rules', ruleData);
  return data.data.rule;
}

/**
 * Update an existing cashback rule.
 * @param {string} ruleId
 * @param {object} updates — { cashback_percent?, is_active?, valid_until? }
 */
export async function updateCashbackRule(ruleId, updates) {
  const { data } = await apiClient.patch(`/admin/cashback/rules/${ruleId}`, updates);
  return data.data.rule;
}

/**
 * Soft-delete (deactivate) a cashback rule.
 */
export async function deleteCashbackRule(ruleId) {
  const { data } = await apiClient.delete(`/admin/cashback/rules/${ruleId}`);
  return data.data.rule;
}
