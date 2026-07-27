// ────────────────────────────────────────────────────────────
// Delivery Service
// Handles rider assignment and delivery lifecycle
// ────────────────────────────────────────────────────────────
import { Client }          from '@googlemaps/google-maps-services-js'; // P4-1C B-08
import { supabaseAdmin }   from '../config/supabase.js';
import { assertTransition } from '../utils/stateMachine.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import * as notificationService from './notification.service.js';
import { recordDeliveryEarning } from './rider-earnings.service.js'; // P2-B
import logger from '../utils/logger.js';

// P4-1C B-08: Maps client for one-shot geocoding on assignment creation
const _mapsClient = new Client();

/** Get all deliveries for a rider (by their profile_id). */
export async function getDeliveries(profileId, { status, page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;

  // Resolve profile_id → rider.id
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (!rider) throw new NotFoundError('Rider record not found');

  let query = supabaseAdmin
    .from('delivery_assignments')
    .select(`
      *,
      sub_orders(
        id, sub_order_number, delivery_tier, status, total_amount,
        orders(order_number, delivery_address_snapshot, notes),
        order_items(product_name, quantity, unit, unit_price)
      )
    `, { count: 'exact' })
    .eq('rider_id', rider.id)
    .order('assigned_at', { ascending: false })
    .range(from, from + limit - 1);

  // Filter by active vs completed
  if (status === 'active') query = query.eq('is_active', true);
  if (status === 'completed') query = query.eq('is_active', false);

  const { data, error, count } = await query;
  if (error) throw error;
  return { deliveries: data, pagination: { page: +page, limit: +limit, total: count } };
}

/** Get full detail of a single delivery assignment. */
export async function getDeliveryDetail(assignmentId, profileId) {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (!rider) throw new NotFoundError('Rider record not found');

  const { data, error } = await supabaseAdmin
    .from('delivery_assignments')
    .select(`
      *,
      sub_orders(
        *,
        order_items(*),
        orders(*, profiles!customer_id(full_name, phone))
      )
    `)
    .eq('id', assignmentId)
    .eq('rider_id', rider.id)
    .single();

  if (error || !data) throw new NotFoundError('Delivery assignment not found');
  return data;
}

/**
 * Assign a rider to a sub-order.
 * Called from the shop dashboard (shop owner/staff).
 */
export async function assignRider(subOrderId, riderId, assignedBy, shopId) {
  // Validate sub_order is in ready_for_pickup state
  const { data: subOrder } = await supabaseAdmin
    .from('sub_orders')
    .select('id, status, orders!inner(shop_id)')
    .eq('id', subOrderId)
    .single();

  if (!subOrder) throw new NotFoundError('Sub-order not found');
  // Ensure it belongs to this shop
  if (subOrder.orders.shop_id !== shopId) throw new AppError('Sub-order does not belong to this shop', 403);

  assertTransition(subOrder.status, 'rider_assigned', 'shop_owner');

  // Validate rider is assigned to this shop
  const { data: riderShopLink } = await supabaseAdmin
    .from('rider_shop_assignments')
    .select('id')
    .eq('rider_id', riderId)
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .single();

  if (!riderShopLink) throw new AppError('Rider is not assigned to this shop', 400);

  // Generate a simple 4-digit OTP for delivery confirmation
  const deliveryOtp = String(Math.floor(1000 + Math.random() * 9000));

  // Deactivate any previous assignment for this sub_order
  await supabaseAdmin
    .from('delivery_assignments')
    .update({ is_active: false })
    .eq('sub_order_id', subOrderId);

  // Create new delivery_assignment
  const { data: assignment, error } = await supabaseAdmin
    .from('delivery_assignments')
    .insert({
      sub_order_id: subOrderId,
      rider_id: riderId,
      assigned_by: assignedBy,
      delivery_otp: deliveryOtp,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;

  // Update sub_order status → rider_assigned
  await supabaseAdmin
    .from('sub_orders')
    .update({ status: 'rider_assigned', updated_at: new Date().toISOString() })
    .eq('id', subOrderId);

  await supabaseAdmin.from('sub_order_status_history').insert({
    sub_order_id: subOrderId,
    from_status: 'ready_for_pickup',
    to_status: 'rider_assigned',
    changed_by: assignedBy,
  });

  // B1: Notify rider of new assignment (with OTP so they know it at a glance)
  // Resolve rider's profile_id for notification targeting
  const { data: riderProfile } = await supabaseAdmin
    .from('riders')
    .select('profile_id, orders:sub_orders!inner(orders!inner(order_number))')
    .eq('id', riderId)
    .single();

  if (riderProfile?.profile_id) {
    // Get order number via sub_order
    const { data: subOrderInfo } = await supabaseAdmin
      .from('sub_orders')
      .select('sub_order_number, orders!inner(order_number, delivery_address_snapshot)')
      .eq('id', subOrderId)
      .single();

    notificationService.notifyRiderNewAssignment(
      riderProfile.profile_id,
      subOrderInfo?.orders?.order_number || subOrderInfo?.sub_order_number || subOrderId,
      subOrderId,
      deliveryOtp
    );

    // P4-1C B-08: Geocode the delivery address once and cache on the assignment row.
    // Done after notifying the rider so the critical path isn't delayed.
    // Non-fatal: if geocoding fails, route.service.js will fall back to live geocoding.
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey && assignment?.id && subOrderInfo?.orders?.delivery_address_snapshot) {
      const snap = subOrderInfo.orders.delivery_address_snapshot;

      // Use pre-stored coordinates if available (set at order placement time)
      const cachedLat = snap.lat  ? parseFloat(snap.lat)  : null;
      const cachedLng = snap.lng  ? parseFloat(snap.lng)  : null;

      if (cachedLat && cachedLng) {
        // Already have coords from address snapshot — persist directly
        supabaseAdmin
          .from('delivery_assignments')
          .update({ dropoff_lat: cachedLat, dropoff_lng: cachedLng })
          .eq('id', assignment.id)
          .then(() => logger.debug('delivery-svc: dropoff coords cached from snapshot', { assignmentId: assignment.id }))
          .catch(e => logger.warn('delivery-svc: failed to cache coords from snapshot', { error: e.message }));
      } else {
        // No snapshot coords — geocode the text address
        const addrText = [
          snap.address_line1,
          snap.address_line2,
          snap.city || 'Patna',
          snap.pincode,
          'Bihar, India',
        ].filter(Boolean).join(', ');

        _mapsClient
          .geocode({ params: { address: addrText, key: apiKey } })
          .then(r => {
            const loc = r.data?.results?.[0]?.geometry?.location;
            if (!loc) return;
            return supabaseAdmin
              .from('delivery_assignments')
              .update({ dropoff_lat: loc.lat, dropoff_lng: loc.lng })
              .eq('id', assignment.id);
          })
          .then(() => logger.debug('delivery-svc: dropoff coords geocoded and cached', { assignmentId: assignment.id }))
          .catch(e => logger.warn('delivery-svc: background geocoding failed (non-fatal)', { error: e.message }));
      }
    }
  }

  return assignment;
}

/** Rider confirms pickup from shop. */
export async function confirmPickup(assignmentId, profileId) {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (!rider) throw new NotFoundError('Rider not found');

  const now = new Date().toISOString();
  // Update assignment
  const { data: assignment } = await supabaseAdmin
    .from('delivery_assignments')
    .update({ picked_up_at: now })
    .eq('id', assignmentId)
    .eq('rider_id', rider.id)
    .select('sub_order_id')
    .single();

  if (!assignment) throw new NotFoundError('Assignment not found');

  // Transition sub_order: rider_assigned → out_for_delivery
  assertTransition('rider_assigned', 'out_for_delivery', 'rider');
  await supabaseAdmin
    .from('sub_orders')
    .update({ status: 'out_for_delivery', picked_up_at: now, updated_at: now })
    .eq('id', assignment.sub_order_id);

  await supabaseAdmin.from('sub_order_status_history').insert({
    sub_order_id: assignment.sub_order_id,
    from_status: 'rider_assigned',
    to_status: 'out_for_delivery',
    changed_by: profileId,
  });

  // Update rider status to on_delivery
  await supabaseAdmin
    .from('riders')
    .update({ status: 'on_delivery', updated_at: now })
    .eq('id', rider.id);

  // B1: Notify customer that order is out for delivery
  const { data: subOrderInfo } = await supabaseAdmin
    .from('sub_orders')
    .select('orders!inner(customer_id, order_number, id)')
    .eq('id', assignment.sub_order_id)
    .single();

  if (subOrderInfo?.orders) {
    notificationService.notifyOutForDelivery(
      subOrderInfo.orders.customer_id,
      subOrderInfo.orders.order_number,
      subOrderInfo.orders.id,
      assignment.sub_order_id
    );
  }

  return { message: 'Pickup confirmed' };
}

/** Rider confirms delivery to customer (with optional OTP/photo proof). */
export async function confirmDelivery(assignmentId, profileId, { otp, proofUrl }) {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (!rider) throw new NotFoundError('Rider not found');

  // Fetch assignment to validate OTP
  const { data: assignment } = await supabaseAdmin
    .from('delivery_assignments')
    .select('id, delivery_otp, sub_order_id')
    .eq('id', assignmentId)
    .eq('rider_id', rider.id)
    .single();
  if (!assignment) throw new NotFoundError('Assignment not found');

  // Validate OTP if one was set
  if (assignment.delivery_otp && otp !== assignment.delivery_otp) {
    throw new AppError('Invalid delivery OTP', 400);
  }

  // Also fetch delivery_tier for earnings calculation (P2-B)
  const { data: subOrderTier } = await supabaseAdmin
    .from('sub_orders')
    .select('delivery_tier')
    .eq('id', assignment.sub_order_id)
    .single();

  const now = new Date().toISOString();
  await supabaseAdmin
    .from('delivery_assignments')
    .update({ delivered_at: now, delivery_proof_url: proofUrl })
    .eq('id', assignmentId);

  // Transition sub_order: out_for_delivery → delivered
  assertTransition('out_for_delivery', 'delivered', 'rider');
  await supabaseAdmin
    .from('sub_orders')
    .update({ status: 'delivered', delivered_at: now, actual_delivery_at: now, updated_at: now })
    .eq('id', assignment.sub_order_id);

  await supabaseAdmin.from('sub_order_status_history').insert({
    sub_order_id: assignment.sub_order_id,
    from_status: 'out_for_delivery',
    to_status: 'delivered',
    changed_by: profileId,
  });

  // Restore rider to available
  await supabaseAdmin
    .from('riders')
    .update({ status: 'available', updated_at: now })
    .eq('id', rider.id);

  // B1: Notify customer that order is delivered
  const { data: subOrderInfo } = await supabaseAdmin
    .from('sub_orders')
    .select('orders!inner(customer_id, order_number, id, total_amount, shop_id)')
    .eq('id', assignment.sub_order_id)
    .single();

  if (subOrderInfo?.orders) {
    notificationService.notifyDelivered(
      subOrderInfo.orders.customer_id,
      subOrderInfo.orders.order_number,
      subOrderInfo.orders.id
    );
  }

  // P2-B: Record earning for this delivery (non-blocking — never throws)
  recordDeliveryEarning(
    rider.id,
    assignmentId,
    subOrderTier?.delivery_tier || 'quick',
    new Date(now)
  );

  // P4-2B: Award cashback on delivery — non-blocking, idempotent via job queue
  if (subOrderInfo?.orders) {
    const ord = subOrderInfo.orders;
    import('../lib/jobQueue.js')
      .then(({ enqueueCashbackReward }) =>
        enqueueCashbackReward(
          ord.customer_id,
          ord.id,
          ord.order_number,
          ord.total_amount,   // already in paise (bigint stored as number in JS)
          ord.shop_id ?? null
        )
      )
      .catch(err => logger.warn('confirmDelivery: failed to enqueue cashback (non-fatal)', { error: err.message }));
  }

  return { message: 'Delivery confirmed' };
}

/** Rider cancels a delivery (returns sub-order to ready_for_pickup). */
export async function cancelDelivery(assignmentId, profileId, reason) {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (!rider) throw new NotFoundError('Rider not found');

  const { data: assignment } = await supabaseAdmin
    .from('delivery_assignments')
    .select('id, sub_order_id, sub_orders(status)')
    .eq('id', assignmentId)
    .eq('rider_id', rider.id)
    .single();
  if (!assignment) throw new NotFoundError('Assignment not found');

  const now = new Date().toISOString();
  // Deactivate assignment
  await supabaseAdmin
    .from('delivery_assignments')
    .update({ is_active: false, cancelled_at: now })
    .eq('id', assignmentId);

  // Revert sub_order back to ready_for_pickup
  await supabaseAdmin
    .from('sub_orders')
    .update({ status: 'ready_for_pickup', updated_at: now })
    .eq('id', assignment.sub_order_id);

  await supabaseAdmin.from('sub_order_status_history').insert({
    sub_order_id: assignment.sub_order_id,
    from_status: assignment.sub_orders.status,
    to_status: 'ready_for_pickup',
    changed_by: profileId,
    notes: `Rider cancelled: ${reason}`,
  });

  // Restore rider to available
  await supabaseAdmin
    .from('riders')
    .update({ status: 'available', updated_at: now })
    .eq('id', rider.id);

  return { message: 'Delivery cancelled, sub-order returned to ready_for_pickup' };
}

/** Rider accepts/acknowledges a delivery assignment. */
export async function acceptDelivery(assignmentId, profileId) {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (!rider) throw new NotFoundError('Rider not found');

  const now = new Date().toISOString();
  const { data: assignment, error } = await supabaseAdmin
    .from('delivery_assignments')
    .update({ accepted_at: now, updated_at: now })
    .eq('id', assignmentId)
    .eq('rider_id', rider.id)
    .eq('is_active', true)
    .select('id, sub_order_id')
    .single();

  if (error || !assignment) throw new NotFoundError('Active delivery assignment not found');
  return { message: 'Delivery accepted', assignmentId: assignment.id };
}
