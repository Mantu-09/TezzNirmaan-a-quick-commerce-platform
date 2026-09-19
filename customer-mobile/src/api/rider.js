// ────────────────────────────────────────────────────────────
// Rider API Client — P3-B
// ────────────────────────────────────────────────────────────
import { client } from './client';

/** GET /rider/deliveries — paginated list (active or completed) */
export const getRiderDeliveries = (params = {}) =>
  client.get('/rider/deliveries', { params });

/** GET /rider/deliveries/:id — full delivery detail */
export const getRiderDeliveryDetail = (assignmentId) =>
  client.get(`/rider/deliveries/${assignmentId}`);

/** POST /rider/deliveries/:id/accept */
export const acceptDelivery = (assignmentId) =>
  client.post(`/rider/deliveries/${assignmentId}/accept`);

/** POST /rider/deliveries/:id/pickup */
export const confirmPickup = (assignmentId) =>
  client.post(`/rider/deliveries/${assignmentId}/pickup`);

/** POST /rider/deliveries/:id/deliver */
export const confirmDelivery = (assignmentId, payload) =>
  client.post(`/rider/deliveries/${assignmentId}/deliver`, payload);

/** POST /rider/deliveries/:id/cancel */
export const cancelDelivery = (assignmentId, reason) =>
  client.post(`/rider/deliveries/${assignmentId}/cancel`, { reason });

/** PATCH /rider/status */
export const updateRiderStatus = (status) =>
  client.patch('/rider/status', { status });

/** POST /rider/location */
export const updateRiderLocation = (lat, lng) =>
  client.post('/rider/location', { lat, lng });

/**
 * P3-B: GET /rider/deliveries/optimized-route
 * Returns active deliveries reordered for shortest driving path.
 * Result shape: {
 *   deliveries: Stop[],
 *   optimized: boolean,
 *   fallback: boolean,
 *   fallback_reason?: string,
 *   total_distance_km: number | null,
 *   total_duration_min: number | null,
 *   polyline: string | null,         // encoded Google Maps polyline
 *   rider_location: { lat, lng } | undefined,
 * }
 */
export const getOptimizedRoute = () =>
  client.get('/rider/deliveries/optimized-route');

// ── R3: COD Collection ────────────────────────────────────────────────────

/**
 * POST /rider/delivery/:assignmentId/collect-cod
 * Rider confirms they have collected cash from the customer.
 */
export const collectCod = (assignmentId) =>
  client.post(`/rider/delivery/${assignmentId}/collect-cod`);

/**
 * GET /rider/cod/summary
 * Returns total cash held by rider + list of uncollected orders.
 */
export const getRiderCodSummary = () =>
  client.get('/rider/cod/summary');
