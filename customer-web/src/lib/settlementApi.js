/**
 * Settlement API — Dashboard (P4-4B)
 * Shop-facing settlement history + admin settlement processing.
 */
import { api } from './api';

// ── Shop Owner ────────────────────────────────────────────────

/**
 * Fetch paginated settlement batches for the authenticated shop.
 * Includes summary: total_earned_paise, pending_paise.
 *
 * @param {{ page?: number, limit?: number }} params
 */
export const fetchMySettlements = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/shop/settlements${qs ? `?${qs}` : ''}`);
};

/**
 * Fetch a single settlement batch with its line items (order-level detail).
 *
 * @param {string} batchId
 */
export const fetchSettlementDetail = (batchId) =>
  api.get(`/shop/settlements/${batchId}`);

// ── Admin ─────────────────────────────────────────────────────

/**
 * Fetch all pending/processing settlement batches across all shops.
 * Returns { batches, total_outstanding_paise }.
 */
export const fetchPendingSettlements = () =>
  api.get('/admin/settlements/pending');

/**
 * Mark a settlement batch as paid.
 *
 * @param {string} batchId
 * @param {{ payment_method: 'upi'|'bank_transfer', payment_reference: string, notes?: string }} data
 */
export const markSettlementPaid = (batchId, data) =>
  api.patch(`/admin/settlements/${batchId}/paid`, data);

/**
 * Manually trigger a settlement generation run (admin only).
 * Omit dates to run for the past 7 days.
 *
 * @param {{ period_start?: string, period_end?: string }} [data]
 */
export const triggerSettlement = (data = {}) =>
  api.post('/admin/settlements/generate', data);
