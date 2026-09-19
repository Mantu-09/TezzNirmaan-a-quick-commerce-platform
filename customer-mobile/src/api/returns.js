// ────────────────────────────────────────────────────────────
// Returns API — P6-3
// Mobile client for return request lifecycle
// ────────────────────────────────────────────────────────────
import client from './client';

/**
 * Check whether a sub-order is eligible for a return.
 * Call this before showing the "Request Return" button.
 *
 * @param {string} subOrderId
 * @returns {{ eligible: boolean, reason?: string, hours_remaining?: number }}
 */
export async function checkReturnEligibility(subOrderId) {
  return client.get(`/orders/sub/${subOrderId}/return-eligibility`);
}

/**
 * File a return request.
 *
 * @param {string} subOrderId
 * @param {{ reason, description?, photoUrls? }} payload
 */
export async function requestReturn(subOrderId, payload) {
  return client.post(`/orders/sub/${subOrderId}/return`, payload);
}

/** List all return requests for the logged-in customer. */
export async function getMyReturns() {
  return client.get('/returns');
}

/** Get a single return request detail. */
export async function getReturn(returnId) {
  return client.get(`/returns/${returnId}`);
}
