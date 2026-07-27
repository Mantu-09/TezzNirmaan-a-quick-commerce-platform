// ────────────────────────────────────────────────────────────
// order-history.service.js — P5-4A: Order Service Split
//
// Contains: getOrders, getOrder
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../../config/supabase.js';
import { NotFoundError } from '../../utils/errors.js';

// ────────────────────────────────────────────────────────────
// getOrders — order history for a customer
// ────────────────────────────────────────────────────────────
export async function getOrders(userId, { page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, status, placed_at, total_amount,
      sub_orders(
        id, status, delivery_tier,
        estimated_delivery_at, delivered_at,
        order_items(
          id, inventory_id,
          product_name, quantity,
          unit_price, total_price
        )
      )
    `, { count: 'exact' })
    .eq('customer_id', userId)
    .order('placed_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;
  return {
    orders: data,
    pagination: {
      page:    +page,
      limit:   +limit,
      total:   count,
      // hasMore is checked by useInfiniteQuery in OrderHistoryScreen
      hasMore: count > (+page) * (+limit),
    },
  };
}

// ────────────────────────────────────────────────────────────
// getOrder — full detail of a single order
// ────────────────────────────────────────────────────────────
export async function getOrder(orderId, userId) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      sub_orders(
        *,
        order_items(*),
        delivery_assignments(
          id, accepted_at, picked_up_at, delivered_at,
          riders(profile_id, vehicle_type, profiles!profile_id(full_name, phone))
        )
      ),
      payments(id, method, status, amount, razorpay_order_id, razorpay_payment_id)
    `)
    .eq('id', orderId)
    .eq('customer_id', userId)
    .single();

  if (error || !data) throw new NotFoundError('Order not found');
  return data;
}
