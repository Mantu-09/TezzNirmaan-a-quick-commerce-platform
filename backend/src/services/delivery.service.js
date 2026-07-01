// ────────────────────────────────────────────────────────────
// Delivery Service
// Handles rider assignment and delivery lifecycle
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { assertTransition } from '../utils/stateMachine.js';
import { NotFoundError, AppError } from '../utils/errors.js';

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
