// dashboard/src/lib/cashbackApi.js — P4-2B
// Cashback Rule admin API helpers for the Next.js dashboard.
//
// All calls go to /admin/cashback/* which requires platform_admin role.
// These are thin wrappers around the existing authenticated axios/fetch client.

import { apiClient } from './api'; // same client used by analyticsApi

/** Fetch all cashback rules (active + inactive) for admin view. */
export async function fetchCashbackRules() {
  const { data } = await apiClient.get('/admin/cashback/rules');
  return data.data.rules;
}

/**
 * Create a new cashback rule.
 * @param {{ min_order_paise: number, max_order_paise: number|null, cashback_percent: number, shop_id: string|null }} rule
 */
export async function createCashbackRule(rule) {
  const { data } = await apiClient.post('/admin/cashback/rules', rule);
  return data.data.rule;
}

/**
 * Update an existing cashback rule.
 * @param {string} ruleId
 * @param {{ cashback_percent?: number, is_active?: boolean, valid_until?: string }} updates
 */
export async function updateCashbackRule(ruleId, updates) {
  const { data } = await apiClient.patch(`/admin/cashback/rules/${ruleId}`, updates);
  return data.data.rule;
}

/**
 * Soft-delete (deactivate) a cashback rule.
 * @param {string} ruleId
 */
export async function deleteCashbackRule(ruleId) {
  const { data } = await apiClient.delete(`/admin/cashback/rules/${ruleId}`);
  return data.data.rule;
}

/**
 * Preview cashback for a given order amount.
 * @param {number} amountPaise
 * @param {string|null} shopId
 */
export async function previewCashback(amountPaise, shopId = null) {
  const params = new URLSearchParams({ amount: amountPaise });
  if (shopId) params.set('shop_id', shopId);
  const { data } = await apiClient.get(`/admin/cashback/preview?${params}`);
  return data.data;
}
