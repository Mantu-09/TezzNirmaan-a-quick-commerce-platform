// ────────────────────────────────────────────────────────────
// Geo Service
// PostGIS-powered shop discovery and delivery eligibility checks
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import { getCachedNearbyShops } from './cache.service.js'; // P2-C

/**
 * Find all active shops within delivery range of a customer's location.
 *
 * Uses PostGIS ST_DWithin against shops.location (geography column).
 * Returns shops annotated with their applicable tiers and distance.
 *
 * The query uses the larger (scheduled) radius as the outer search bound,
 * then determines per-tier eligibility in the result set.
 *
 * @param {number} lat - Customer latitude
 * @param {number} lng - Customer longitude
 * @returns {Array} shops with distance_km, can_quick_deliver, can_scheduled_deliver
 */
export async function findNearbyShops(lat, lng) {
  if (!lat || !lng) throw new AppError('lat and lng are required', 400);

  // P2-C: wrap the expensive PostGIS RPC in a 2-min grid-cell cache.
  // Cache miss runs the actual supabase.rpc(); hit returns JSON instantly.
  return getCachedNearbyShops(lat, lng, async (fetchLat, fetchLng) => {
    const { data, error } = await supabaseAdmin.rpc('find_nearby_shops', {
      customer_lat: fetchLat,
      customer_lng: fetchLng,
    });
    if (error) throw error;
    return data || [];
  });
}

/**
 * Check whether a customer's address is within a shop's delivery radius
 * for a specific delivery tier.
 *
 * @param {string} shopId
 * @param {{ lat: number, lng: number }} customerLocation
 * @param {'quick'|'scheduled'} tier
 * @returns {{ eligible: boolean, distanceKm: number, radiusKm: number }}
 */
export async function checkDeliveryEligibility(shopId, customerLocation, tier) {
  const { lat, lng } = customerLocation;

  // Fetch shop delivery radii
  const { data: shop, error } = await supabaseAdmin
    .from('shops')
    .select('id, quick_delivery_radius_km, scheduled_delivery_radius_km, is_accepting_orders')
    .eq('id', shopId)
    .eq('is_active', true)
    .single();

  if (error || !shop) throw new AppError('Shop not found or inactive', 404);
  if (!shop.is_accepting_orders) {
    return { eligible: false, reason: 'Shop is not accepting orders' };
  }

  const radiusKm = tier === 'quick'
    ? shop.quick_delivery_radius_km
    : shop.scheduled_delivery_radius_km;

  // Use ST_DWithin via RPC or raw query
  // Requires a Postgres function:
  //
  // CREATE OR REPLACE FUNCTION check_shop_delivery_range(
  //   p_shop_id uuid, customer_lat float8, customer_lng float8, radius_km numeric
  // )
  // RETURNS TABLE(within_range boolean, distance_km float8)
  // LANGUAGE sql STABLE AS $$
  //   SELECT
  //     ST_DWithin(s.location, ST_MakePoint(customer_lng, customer_lat)::geography, radius_km * 1000) AS within_range,
  //     ST_Distance(s.location, ST_MakePoint(customer_lng, customer_lat)::geography) / 1000 AS distance_km
  //   FROM shops s WHERE s.id = p_shop_id;
  // $$;

  const { data: rangeResult, error: rangeError } = await supabaseAdmin.rpc('check_shop_delivery_range', {
    p_shop_id: shopId,
    customer_lat: lat,
    customer_lng: lng,
    radius_km: radiusKm,
  });

  if (rangeError) throw rangeError;

  const result = rangeResult?.[0] ?? { within_range: false, distance_km: null };
  return {
    eligible: result.within_range,
    distanceKm: result.distance_km,
    radiusKm,
    tier,
  };
}
