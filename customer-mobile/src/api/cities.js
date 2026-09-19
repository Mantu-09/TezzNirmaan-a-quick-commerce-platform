// ────────────────────────────────────────────────────────────
// Cities API — Mobile (P4-4A)
//
// GET  /public/cities        — unauthenticated, city list for picker
// POST /public/city-waitlist — waitlist signup for coming-soon cities
//
// These routes are unauthenticated (called before OTP login).
// We use the raw axios client but WITHOUT the Bearer token
// interceptor for city-list calls.
// ────────────────────────────────────────────────────────────
import client from './client';

/**
 * Fetch all Bihar cities (active + coming-soon).
 * Unauthenticated — used by the city picker before login.
 *
 * @returns {{ cities: Array<{
 *   id: string, name: string, state: string,
 *   center_lat: number, center_lng: number,
 *   delivery_radius_km: number,
 *   is_active: boolean, launch_date: string|null
 * }> }}
 */
export async function fetchCities() {
  return client.get('/public/cities');
}

/**
 * Join the waitlist for a coming-soon city.
 * Idempotent — safe to call multiple times with the same phone+city.
 *
 * @param {{ city_id: string, name: string, phone: string }} payload
 */
export async function joinWaitlist(payload) {
  return client.post('/public/city-waitlist', payload);
}

/**
 * Session K: Check if a lat/lng is within a serviceable delivery area.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ serviceable: boolean, city: object|null, active_shop_count: number, nearest_city: object|null, reason: string|null }}
 */
export async function checkServiceability(lat, lng) {
  const res = await client.get(`/public/serviceability?lat=${lat}&lng=${lng}`);
  return res?.data || res;
}

