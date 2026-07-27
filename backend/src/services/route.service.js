// ────────────────────────────────────────────────────────────
// Route Optimization Service — P3-B
//
// GET /rider/deliveries/optimized-route
//
// Calls Google Maps Directions API with waypoint optimization
// (optimize: true) to reorder active deliveries for the shortest
// driving path from the rider's current location.
//
// Cost: $5 / 1000 requests. At 10 riders × 5 calls/day = ~$0.25/day.
//
// Fallback strategy (no Maps API key or API error):
//   → Returns deliveries in assignment order with a flag
//     { fallback: true, reason: '...' } so the mobile app can
//     display a graceful degraded UI (list without polyline).
//
// Address resolution:
//   Delivery coordinates come from the address snapshot stored
//   at order placement time (delivery_address_snapshot JSON field
//   in the orders table). If no coordinates are present we
//   geocode the text address on the fly — also via Maps API.
//
// Rider location:
//   Read from the rider_locations table (most recent row by
//   recorded_at). Falls back to a Patna city-centre coordinate
//   (25.5941° N, 85.1376° E) if no location is on record.
// ────────────────────────────────────────────────────────────
import { Client, TravelMode } from '@googlemaps/google-maps-services-js';
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const mapsClient = new Client();

// Patna city-centre fallback
const PATNA_CENTER = { lat: 25.5941, lng: 85.1376 };

// ── Helpers ───────────────────────────────────────────────────

/** Resolve profile_id → rider.id */
async function getRiderRecord(profileId) {
  const { data, error } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (error || !data) throw new NotFoundError('Rider record not found');
  return data;
}

/**
 * B-09: Resolve the shop a rider is currently assigned to.
 * Used to get the shop's city-centre coordinates for the location fallback.
 * Returns null gracefully if the rider has no active shop assignment.
 */
async function _resolveShopIdForRider(riderId) {
  try {
    const { data } = await supabaseAdmin
      .from('rider_shop_assignments')
      .select('shop_id')
      .eq('rider_id', riderId)
      .eq('is_active', true)
      .limit(1)
      .single();
    return data?.shop_id || null;
  } catch {
    return null; // no assignment or DB error — let caller handle gracefully
  }
}

/** Latest GPS coordinate from rider_locations, or shop's city-centre fallback (B-09) */
async function getLatestRiderLocation(riderId, shopId) {
  const { data } = await supabaseAdmin
    .from('rider_locations')
    .select('lat, lng, recorded_at')
    .eq('rider_id', riderId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (data?.lat && data?.lng) {
    return { lat: data.lat, lng: data.lng };
  }

  // B-09: Fall back to the shop's city centre rather than a hardcoded constant.
  // This will return the correct city centre when we expand beyond Patna.
  if (shopId) {
    const { data: shop } = await supabaseAdmin
      .from('shops')
      .select('city_center_lat, city_center_lng')
      .eq('id', shopId)
      .single();

    if (shop?.city_center_lat && shop?.city_center_lng) {
      logger.warn('route-svc: no rider location — using shop city centre', { riderId, shopId });
      return { lat: shop.city_center_lat, lng: shop.city_center_lng };
    }
  }

  // Final fallback: hardcoded Patna centre (only reached if shop lookup fails)
  logger.warn('route-svc: no rider location or shop city centre — using Patna default', { riderId });
  return { ...PATNA_CENTER };
}

/**
 * Pull all active (is_active = true) delivery_assignments for a rider,
 * including the delivery address and a summarised item list.
 */
async function getActiveDeliveriesForRider(riderId) {
  const { data, error } = await supabaseAdmin
    .from('delivery_assignments')
    .select(`
      id,
      sub_order_id,
      assigned_at,
      status,
      dropoff_lat,
      dropoff_lng,
      sub_orders(
        id, sub_order_number, delivery_tier,
        orders(
          id, order_number,
          delivery_address_snapshot,
          profiles!customer_id(full_name, phone)
        ),
        order_items(product_name, quantity, unit)
      )
    `)
    .eq('rider_id', riderId)
    .eq('is_active', true)
    .order('assigned_at', { ascending: true });

  if (error) throw error;

  // Normalise each assignment into a flat delivery object
  return (data || []).map(da => {
    const sub    = da.sub_orders;
    const order  = sub?.orders;
    const addr   = order?.delivery_address_snapshot || {};
    const items  = (sub?.order_items || [])
      .map(i => `${i.product_name} ×${i.quantity}${i.unit ? ' ' + i.unit : ''}`)
      .join(', ');

    // B-08: Prefer cached coordinates on the assignment row.
    // Fall back to coordinates in the address snapshot (set at order placement),
    // then ultimately to null (which triggers live geocoding in optimizeRiderRoute).
    const cachedLat = da.dropoff_lat  ? parseFloat(da.dropoff_lat)  : null;
    const cachedLng = da.dropoff_lng  ? parseFloat(da.dropoff_lng)  : null;
    const snapLat   = addr.lat ? parseFloat(addr.lat) : null;
    const snapLng   = addr.lng ? parseFloat(addr.lng) : null;

    return {
      assignment_id:     da.id,
      sub_order_id:      da.sub_order_id,
      sub_order_number:  sub?.sub_order_number,
      order_number:      order?.order_number,
      delivery_tier:     sub?.delivery_tier,
      customer_name:     order?.profiles?.full_name || 'Customer',
      customer_phone:    order?.profiles?.phone || '',
      address_line1:     addr.address_line1 || '',
      address_line2:     addr.address_line2 || '',
      landmark:          addr.landmark || '',
      city:              addr.city || 'Patna',
      state:             addr.state || 'Bihar',
      pincode:           addr.pincode || '',
      // B-08: cached assignment coords > snapshot coords > null
      delivery_lat:      cachedLat ?? snapLat,
      delivery_lng:      cachedLng ?? snapLng,
      full_address:      [addr.address_line1, addr.address_line2, addr.city, addr.pincode]
                          .filter(Boolean).join(', '),
      items_summary:     items,
      assigned_at:       da.assigned_at,
    };
  });
}

/**
 * Geocode a plain-text address string using Google Maps Geocoding API.
 * Returns { lat, lng } or null on failure.
 */
async function geocodeAddress(address, apiKey) {
  try {
    const r = await mapsClient.geocode({
      params: { address, key: apiKey },
    });
    const loc = r.data?.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch (e) {
    logger.warn('route-svc: geocode failed', { address, err: e.message });
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────

/**
 * Compute the optimized delivery route for a rider.
 *
 * @param {string} profileId  - rider's user profile_id (from JWT)
 * @returns {OptimizedRouteResult}
 */
export async function optimizeRiderRoute(profileId) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const rider       = await getRiderRecord(profileId);
  const deliveries  = await getActiveDeliveriesForRider(rider.id);

  // ── Short-circuit: 0 or 1 delivery ─────────────────────────
  if (deliveries.length === 0) {
    return {
      deliveries: [],
      optimized:  false,
      fallback:   false,
      message:    'No active deliveries',
      total_distance_km:  0,
      total_duration_min: 0,
      polyline:           null,
    };
  }

  if (deliveries.length === 1) {
    return {
      deliveries,
      optimized:  false,
      fallback:   false,
      message:    'Single delivery — no optimization needed',
      total_distance_km:  null,
      total_duration_min: null,
      polyline:           null,
    };
  }

  // ── Resolve coordinates for all stops ───────────────────────────
  // B-09: pass rider's shop so the fallback is the shop's city centre, not a constant
  const shopId   = deliveries[0]?.assignment_id
    ? await _resolveShopIdForRider(rider.id)
    : null;
  const riderLoc = await getLatestRiderLocation(rider.id, shopId);

  // B-08: Most deliveries will already have cached coords from assignment creation.
  // Only geocode the rare case where caching failed (network error at assignment time).
  const resolved = await Promise.all(
    deliveries.map(async d => {
      if (d.delivery_lat && d.delivery_lng) return d; // cache hit — no API call

      if (!apiKey) return d; // no key — keep nulls, will be in withoutCoords

      const coords = await geocodeAddress(d.full_address, apiKey);
      return {
        ...d,
        delivery_lat: coords?.lat ?? null,
        delivery_lng: coords?.lng ?? null,
      };
    })
  );

  // Separate deliveries that have coordinates from those that don't
  const withCoords    = resolved.filter(d => d.delivery_lat && d.delivery_lng);
  const withoutCoords = resolved.filter(d => !d.delivery_lat || !d.delivery_lng);

  // ── Fallback: no API key or <2 geocoded stops ───────────────
  if (!apiKey || withCoords.length < 2) {
    logger.warn('route-svc: no API key or insufficient coordinates — returning fallback', {
      profileId, withCoords: withCoords.length,
    });
    return {
      deliveries:         resolved,
      optimized:          false,
      fallback:           true,
      fallback_reason:    !apiKey ? 'GOOGLE_MAPS_API_KEY not configured' : 'Insufficient geocoded addresses',
      total_distance_km:  null,
      total_duration_min: null,
      polyline:           null,
    };
  }

  // ── Call Google Maps Directions API ────────────────────────
  try {
    const origin      = `${riderLoc.lat},${riderLoc.lng}`;
    const waypointStrs = withCoords.map(d => `${d.delivery_lat},${d.delivery_lng}`);

    // Directions API: origin → last stop, intermediate stops as waypoints
    const response = await mapsClient.directions({
      params: {
        origin,
        destination: waypointStrs[waypointStrs.length - 1],
        waypoints:   waypointStrs.length > 1
          ? waypointStrs.slice(0, -1).map(w => `via:${w}`) // avoid detour stops
          : [],
        optimize:    true,   // Google reorders waypoints for shortest route
        mode:        TravelMode.driving,
        key:         apiKey,
        language:    'en',
        region:      'in',
      },
    });

    const route           = response.data.routes[0];
    const waypointOrder   = route.waypoint_order;       // reordered indices
    const legs            = route.legs;

    // ── Reorder withCoords deliveries by Google's optimized order ─
    // waypoint_order refers to indices in the waypoints array (not incl. dest)
    // Destination is always last — append it after the waypoints
    const reorderedWithCoords = [
      ...waypointOrder.map(i => withCoords[i]),
      withCoords[withCoords.length - 1],  // destination
    ];

    // Compute cumulative distance from previous stop for each leg
    const deliveriesWithDistance = reorderedWithCoords.map((d, idx) => ({
      ...d,
      stop_number:                 idx + 1,
      distance_from_prev_km:       idx < legs.length
        ? Math.round((legs[idx].distance.value / 1000) * 10) / 10
        : null,
      duration_from_prev_min:      idx < legs.length
        ? Math.round(legs[idx].duration.value / 60)
        : null,
    }));

    // Append any stops we couldn't geocode at the end
    const allDeliveries = [
      ...deliveriesWithDistance,
      ...withoutCoords.map((d, idx) => ({
        ...d,
        stop_number: deliveriesWithDistance.length + idx + 1,
        distance_from_prev_km:  null,
        duration_from_prev_min: null,
      })),
    ];

    const totalDistanceKm  = legs.reduce((sum, l) => sum + l.distance.value, 0) / 1000;
    const totalDurationMin = legs.reduce((sum, l) => sum + l.duration.value, 0) / 60;

    logger.info('route-svc: optimization complete', {
      profileId,
      stops:            allDeliveries.length,
      totalDistanceKm:  Math.round(totalDistanceKm * 10) / 10,
      totalDurationMin: Math.round(totalDurationMin),
    });

    return {
      deliveries:          allDeliveries,
      rider_location:      riderLoc,
      optimized:           true,
      fallback:            false,
      total_distance_km:   Math.round(totalDistanceKm  * 10) / 10,
      total_duration_min:  Math.round(totalDurationMin),
      polyline:            route.overview_polyline.points,   // encoded polyline for map
    };

  } catch (mapsErr) {
    // Google API error — degrade gracefully, never crash the rider app
    logger.error('route-svc: Google Maps API error', {
      profileId,
      status:  mapsErr.response?.status,
      message: mapsErr.message,
    });

    return {
      deliveries:         resolved,
      optimized:          false,
      fallback:           true,
      fallback_reason:    `Maps API error: ${mapsErr.message}`,
      total_distance_km:  null,
      total_duration_min: null,
      polyline:           null,
    };
  }
}
