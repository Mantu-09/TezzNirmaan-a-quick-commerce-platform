// ────────────────────────────────────────────────────────────
// Rating Service — B4 (Corrected Schema)
//
// Schema reality:
//   orders.customer_id → profiles(id)
//   status lives on sub_orders.status
//   can_rate_order RPC checks sub_orders for 'delivered'
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function rateOrder(orderId, customerId, { deliveryRating, productRating, reviewText }) {
  // 1. Validate via RPC (atomic)
  const { data: check, error: rpcErr } = await supabaseAdmin
    .rpc('can_rate_order', { p_order_id: orderId, p_customer_id: customerId });

  if (rpcErr) {
    logger.error('can_rate_order RPC error', { rpcErr });
    throw new AppError('Could not validate order for rating', 500);
  }

  if (!check?.allowed) {
    const msg = {
      order_not_found:    'Order not found',
      not_your_order:     'You can only rate your own orders',
      order_not_delivered:'Order must be delivered before rating (at least one sub-order)',
      already_rated:      'You have already rated this order',
    }[check?.reason] || 'Cannot rate this order';
    throw new AppError(msg, 400, check?.reason);
  }

  const shopId = check.shop_id;

  // 2. Insert rating
  const { data: rating, error: insertErr } = await supabaseAdmin
    .from('order_ratings')
    .insert({
      order_id:        orderId,
      customer_id:     customerId,
      shop_id:         shopId,
      delivery_rating: deliveryRating || null,
      product_rating:  productRating  || null,
      review_text:     reviewText?.trim() || null,
    })
    .select('id, delivery_rating, product_rating, review_text, created_at')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') throw new AppError('Already rated this order', 400, 'already_rated');
    logger.error('Insert rating error', { insertErr, orderId });
    throw new AppError('Failed to save rating', 500);
  }

  return { rating };
}

export async function getShopRatings(shopId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('order_ratings')
    .select(`
      id,
      delivery_rating,
      product_rating,
      review_text,
      is_flagged,
      created_at,
      profiles!customer_id(id, full_name)
    `, { count: 'exact' })
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error('getShopRatings error', { error: error.message, shopId });
    throw error;
  }

  return {
    ratings: (data || []).map(r => ({
      id:             r.id,
      deliveryRating: r.delivery_rating,
      productRating:  r.product_rating,
      reviewText:     r.review_text,
      isFlagged:      r.is_flagged,
      createdAt:      r.created_at,
      // Partial name for privacy: "Ramesh K."
      reviewer:       formatReviewerName(r.profiles?.full_name),
    })),
    total:   count || 0,
    page:    +page,
    hasMore: offset + (data?.length || 0) < (count || 0),
  };
}

export async function getShopRatingSummary(shopId) {
  const { data, error } = await supabaseAdmin
    .from('shop_rating_summary')
    .select('avg_delivery_rating, avg_product_rating, avg_overall_rating, total_ratings, total_reviews')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) {
    logger.warn('getShopRatingSummary error (non-fatal)', { error: error.message, shopId });
    return null;
  }
  return data;
}

export async function hasRatedOrder(orderId, customerId) {
  const { count, error } = await supabaseAdmin
    .from('order_ratings')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('customer_id', customerId);

  if (error) return false;
  return (count || 0) > 0;
}

export async function flagRating(ratingId, shopId, flagged = true) {
  const { data, error } = await supabaseAdmin
    .from('order_ratings')
    .update({ is_flagged: flagged })
    .eq('id', ratingId)
    .eq('shop_id', shopId)
    .select('id, is_flagged')
    .single();

  if (error) throw new AppError('Failed to flag rating', 500);
  return data;
}

// ── Helpers ──────────────────────────────────────────────────
function formatReviewerName(fullName) {
  if (!fullName) return 'Customer';
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1
    ? `${parts[0]} ${parts[parts.length - 1][0]}.`
    : parts[0];
}
