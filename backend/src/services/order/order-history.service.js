// ────────────────────────────────────────────────────────────
// order-history.service.js — P5-4A: Order Service Split
//
// Contains: getOrders, getOrder
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../../config/supabase.js';
import { NotFoundError } from '../../utils/errors.js';

// ────────────────────────────────────────────────────────────
// getOrders — order history for a customer (P8-6: search + filter)
// ────────────────────────────────────────────────────────────
export async function getOrders(userId, { page = 1, limit = 20, search, status } = {}) {
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, status, placed_at, total_amount, basket_id, created_at,
      shops(id, name),
      sub_orders(
        id, status, delivery_tier,
        estimated_delivery_at, delivered_at,
        order_items(
          id, inventory_id,
          product_name, quantity,
          unit_price, total_price,
          products(reminder_days)
        )
      )
    `, { count: 'exact' })
    .eq('customer_id', userId)
    .order('placed_at', { ascending: false })
    .range(from, from + limit - 1);

  // ── Optional filters (P8-6) ──────────────────────────────────

  // Status filter: applied at the orders level
  if (status) {
    query = query.eq('status', status);
  }

  // Full-text search: match order_number OR product names in order_items
  // We use ilike on order_number, and a separate sub-query for product names
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    // Supabase: use OR filter on order_number, or fall back to a raw textSearch
    query = query.or(
      `order_number.ilike.${s}`
    );
  }

  const { data, error, count } = await query;

  if (error) throw error;

  // Flatten reminder_days from nested products onto each order_item
  const orders = (data || []).map(order => ({
    ...order,
    sub_orders: (order.sub_orders || []).map(sub => ({
      ...sub,
      order_items: (sub.order_items || []).map(item => ({
        ...item,
        reminder_days: item.products?.reminder_days ?? null,
      })),
    })),
  }));

  return {
    orders,
    pagination: {
      page:    +page,
      limit:   +limit,
      total:   count,
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
