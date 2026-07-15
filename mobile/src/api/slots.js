// ────────────────────────────────────────────────────────────
// Slots API — mobile (B6)
// Used by CheckoutScreen slot picker to show real server-driven
// availability instead of the old static getTomorrowSlots().
// ────────────────────────────────────────────────────────────
import client from './client';

/**
 * Get available delivery slots for a shop on a given date.
 * Public endpoint — no auth required.
 *
 * @param {string} shopId
 * @param {string} date   'YYYY-MM-DD'
 * @param {string} [tier] 'scheduled' (default) or 'quick'
 * @returns {{ slots: Array, date: string }}
 */
export async function getAvailableSlots(shopId, date, tier = 'scheduled') {
  return client.get(`/shops/${shopId}/slots`, { params: { date, tier } });
}
