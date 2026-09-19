// backend/src/services/rider-assignment.service.js — Session I
// Smart auto-assignment: finds best available rider in city,
// scores by distance + active deliveries.
//
// UPDATED (Session I): inserts status='offered' (not 'accepted') and
// sends a push notification to the rider. The rider has 60 seconds to
// accept via POST /rider/deliveries/:id/accept. If they decline or the
// window expires, the next best rider is tried by the reassignment cron.

import { supabaseAdmin }  from '../config/supabase.js';
import { sendPushNotification } from './push.service.js';
import logger             from '../utils/logger.js';


/** Haversine distance in km between two GPS points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2
             + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * autoAssignRider(orderId)
 * Finds the best available rider near the shop, creates a delivery_assignment
 * row with status='offered', and sends the rider a push notification.
 *
 * Returns: { assigned: boolean, rider_id?, assignment_id? }
 */
export async function autoAssignRider(orderId, { excludeRiderIds = [] } = {}) {
  try {
    // 1. Get order details with shop GPS
    const { data: order, error: oErr } = await supabaseAdmin
      .from('orders')
      .select(`id, city_id, sub_orders(id, shop_id, shop:shops(id, lat, lng, name))`)
      .eq('id', orderId)
      .single();

    if (oErr || !order) {
      logger.warn('[AutoAssign] Order not found:', orderId);
      return { assigned: false };
    }

    const subOrder = order.sub_orders?.[0];
    const shop     = subOrder?.shop;
    if (!shop?.lat || !shop?.lng) {
      logger.warn('[AutoAssign] Shop has no GPS coordinates for order:', orderId);
      return { assigned: false };
    }

    // 2. Active riders in city (pinged in last 10 minutes), excluding already-tried riders
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    let locQuery = supabaseAdmin
      .from('rider_locations')
      .select('rider_id, lat, lng, updated_at')
      .eq('city_id', order.city_id)
      .gte('updated_at', tenMinAgo);

    if (excludeRiderIds.length) {
      locQuery = locQuery.not('rider_id', 'in', `(${excludeRiderIds.join(',')})`);
    }

    const { data: riderLocations } = await locQuery;
    if (!riderLocations?.length) {
      logger.warn('[AutoAssign] No active riders available in city:', order.city_id);
      return { assigned: false };
    }

    // 3. Count active deliveries per rider (accepted or picked_up)
    const riderIds = riderLocations.map(r => r.rider_id);
    const { data: activeAssignments } = await supabaseAdmin
      .from('delivery_assignments')
      .select('rider_id')
      .in('rider_id', riderIds)
      .in('status', ['offered', 'accepted', 'picked_up']); // include 'offered' in cap count

    const activeCount = {};
    (activeAssignments || []).forEach(a => {
      activeCount[a.rider_id] = (activeCount[a.rider_id] || 0) + 1;
    });

    // 4. Score each rider: lower = better
    const scored = riderLocations
      .filter(r => (activeCount[r.rider_id] || 0) < 3) // max 3 concurrent
      .map(r => {
        const distKm = haversineKm(shop.lat, shop.lng, r.lat, r.lng);
        const score  = distKm * 2 + (activeCount[r.rider_id] || 0) * 3;
        return { ...r, distKm, score };
      })
      .sort((a, b) => a.score - b.score);

    if (!scored.length) {
      logger.warn('[AutoAssign] All riders at capacity for order:', orderId);
      return { assigned: false };
    }

    const bestRider = scored[0];
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 1000); // 60-second accept window

    // 5. Create delivery assignment with status='offered' (not 'accepted')
    const { data: assignment, error: aErr } = await supabaseAdmin
      .from('delivery_assignments')
      .insert({
        sub_order_id:    subOrder.id,
        rider_id:        bestRider.rider_id,
        status:          'offered',              // ← KEY CHANGE from 'accepted'
        assigned_at:     now.toISOString(),
        offered_at:      now.toISOString(),
        offer_expires_at: expiresAt.toISOString(),
        distance_km:     Math.round(bestRider.distKm * 100) / 100,
      })
      .select()
      .single();

    if (aErr) throw aErr;

    logger.info(`[AutoAssign] Offered delivery to rider ${bestRider.rider_id} for order ${orderId} (${bestRider.distKm.toFixed(1)}km, expires in 60s)`);

    // 6. Push notification to rider — "New delivery offer"
    //    Fire-and-forget: never block the order flow
    setImmediate(async () => {
      try {
        // Session P — fix: push tokens are stored in profiles.expo_push_token,
        // NOT in riders.push_token (which was never populated by savePushToken()).
        const { data: riderRow } = await supabaseAdmin
          .from('riders')
          .select('profile_id, profiles!inner(name, expo_push_token)')
          .eq('id', bestRider.rider_id)
          .single();

        const pushToken = riderRow?.profiles?.expo_push_token;
        if (pushToken) {
          await sendPushNotification(
            pushToken,
            '🛵 New Delivery Offer',
            `Order from ${shop.name || 'nearby shop'} — ${bestRider.distKm.toFixed(1)}km away. Accept within 60 seconds!`,
            {
              type:          'delivery_offered',
              assignment_id: assignment.id,
              order_id:      orderId,
              shop_lat:      shop.lat,
              shop_lng:      shop.lng,
              expires_at:    expiresAt.toISOString(),
            }
          );
        } else {
          logger.debug('[AutoAssign] Rider has no push token, skipping push', { riderId: bestRider.rider_id });
        }
      } catch (pushErr) {
        logger.warn('[AutoAssign] Push notification failed (non-fatal)', { error: pushErr.message });
      }
    });

    // 7. Also emit Socket.IO event (for riders with the app open)
    try {
      const { getIO } = await import('../lib/websocket.js');
      const io = getIO();
      if (io) {
        io.of('/rider').to(`rider:${bestRider.rider_id}`).emit('delivery_offered', {
          assignment_id:   assignment.id,
          order_id:        orderId,
          shop_lat:        shop.lat,
          shop_lng:        shop.lng,
          expires_at:      expiresAt.toISOString(),
          distance_km:     bestRider.distKm,
        });
      }
    } catch { /* Socket not critical */ }

    return { assigned: true, rider_id: bestRider.rider_id, assignment_id: assignment.id };
  } catch (err) {
    logger.error('[AutoAssign] Error:', { error: err.message });
    return { assigned: false };
  }
}

/**
 * reassignExpiredOffers()
 * Called by the internal cron endpoint every 30 seconds.
 * Finds 'offered' assignments past their expiry and re-offers to the next best rider.
 */
export async function reassignExpiredOffers() {
  const now = new Date().toISOString();

  const { data: expired } = await supabaseAdmin
    .from('delivery_assignments')
    .select('id, rider_id, sub_order_id, sub_orders(order_id)')
    .eq('status', 'offered')
    .lt('offer_expires_at', now)
    .eq('is_active', true);

  if (!expired?.length) return { reassigned: 0 };

  let reassigned = 0;
  for (const assignment of expired) {
    // Mark as declined (timeout)
    await supabaseAdmin
      .from('delivery_assignments')
      .update({ status: 'declined', declined_at: now, is_active: false, updated_at: now })
      .eq('id', assignment.id);

    logger.info('[AutoAssign] Offer expired, marking declined and re-offering', { assignmentId: assignment.id });

    // Try next best rider, excluding this one
    const orderId = assignment.sub_orders?.order_id;
    if (orderId) {
      const result = await autoAssignRider(orderId, { excludeRiderIds: [assignment.rider_id] });
      if (result.assigned) reassigned++;
      else logger.warn('[AutoAssign] No rider available after re-offer attempt', { orderId });
    }
  }

  return { reassigned, checked: expired.length };
}
