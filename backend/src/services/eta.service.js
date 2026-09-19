// backend/src/services/eta.service.js — P15-7
// Calculates delivery ETA for the track page.
// Uses haversine straight-line + speed estimate (falls back gracefully if no Google key).

import { supabaseAdmin } from '../config/supabase.js';

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const AVG_SPEED_KMH = 25; // Muzaffarpur city speed
const PREP_MINUTES  = 10; // Avg shop prep time

/**
 * getOrderETA(orderNumber)
 * Returns { eta_minutes, status_label, rider_lat, rider_lng, progress_pct }
 */
export async function getOrderETA(orderNumber) {
  // Get order with delivery address and assignment
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select(`
      id, status,
      delivery_lat, delivery_lng,
      sub_orders(
        status,
        delivery_assignments(
          status, rider_id,
          rider:riders(id, name),
          picked_up_at
        ),
        shop:shops(lat, lng)
      )
    `)
    .eq('order_number', orderNumber)
    .single()
    .catch(() => ({ data: null }));

  if (!order) return null;

  const subOrder   = order.sub_orders?.[0];
  const assignment = subOrder?.delivery_assignments?.[0];
  const orderStatus = subOrder?.status || order.status;

  if (['delivered', 'cancelled'].includes(orderStatus)) {
    return { eta_minutes: 0, status_label: orderStatus === 'delivered' ? 'Delivered' : 'Cancelled', progress_pct: 100 };
  }

  // Get rider's last known location
  let riderLat = null, riderLng = null;
  if (assignment?.rider_id) {
    const { data: loc } = await supabaseAdmin
      .from('rider_locations')
      .select('lat, lng, updated_at')
      .eq('rider_id', assignment.rider_id)
      .single()
      .catch(() => ({ data: null }));
    if (loc) { riderLat = loc.lat; riderLng = loc.lng; }
  }

  const delivLat = order.delivery_lat;
  const delivLng = order.delivery_lng;
  const shopLat  = subOrder?.shop?.lat;
  const shopLng  = subOrder?.shop?.lng;

  let etaMinutes = PREP_MINUTES;
  let progressPct = 10;
  let statusLabel = 'Preparing your order';

  if (orderStatus === 'confirmed' || !assignment) {
    etaMinutes  = PREP_MINUTES + 20;
    progressPct = 15;
    statusLabel = 'Order confirmed — finding rider';
  } else if (assignment.status === 'accepted') {
    // Rider heading to shop
    if (riderLat && shopLat) {
      const distToShop = haversineKm(riderLat, riderLng, shopLat, shopLng);
      const travelMins = Math.round((distToShop / AVG_SPEED_KMH) * 60);
      etaMinutes = travelMins + PREP_MINUTES + (delivLat && delivLng ? Math.round((haversineKm(shopLat, shopLng, delivLat, delivLng) / AVG_SPEED_KMH) * 60) : 15);
    } else {
      etaMinutes = 25;
    }
    progressPct = 35;
    statusLabel = 'Rider is on the way to shop';
  } else if (assignment.status === 'picked_up') {
    // Rider heading to customer
    if (riderLat && delivLat) {
      const distToDest = haversineKm(riderLat, riderLng, delivLat, delivLng);
      etaMinutes  = Math.max(1, Math.round((distToDest / AVG_SPEED_KMH) * 60));
      progressPct = distToDest < 0.5 ? 90 : 65;
    } else {
      etaMinutes = 10;
    }
    statusLabel = etaMinutes <= 5 ? 'Rider is nearby!' : 'Order picked up — on the way';
  }

  return {
    eta_minutes:  etaMinutes,
    status_label: statusLabel,
    progress_pct: progressPct,
    rider_lat:    riderLat,
    rider_lng:    riderLng,
    rider_name:   assignment?.rider?.name || null,
  };
}
