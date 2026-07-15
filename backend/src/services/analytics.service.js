// ────────────────────────────────────────────────────────────
// Analytics Service — B5
//
// Schema reality:
//   orders:      id, shop_id, customer_id, total_amount (paise), placed_at
//   sub_orders:  id, order_id, delivery_tier, status, total_amount (paise),
//                confirmed_at, delivering_at, delivered_at, cancelled_at,
//                created_at
//   order_items: id, sub_order_id, product_id, product_name, quantity,
//                unit_price, total_price (paise)
//   shop_inventory: id, shop_id, product_id, stock_quantity,
//                   low_stock_threshold, is_in_stock,
//                   products!inner(name)
//
// All money is in PAISE. Divide by 100 for rupees.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// ── Period helpers ────────────────────────────────────────────

/**
 * Returns { from, to, prevFrom, prevTo } as ISO strings for the window.
 * prevFrom/prevTo = the identical-length window immediately before (for trend).
 */
function getWindow(period) {
  const now   = new Date();
  const to    = now.toISOString();
  let from, prevFrom, prevTo;

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    from     = start.toISOString();
    prevTo   = from;
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 1);
    prevFrom = prevStart.toISOString();
  } else if (period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    from     = start.toISOString();
    prevTo   = from;
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    prevFrom = prevStart.toISOString();
  } else {
    // 30d
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    from     = start.toISOString();
    prevTo   = from;
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 30);
    prevFrom = prevStart.toISOString();
  }

  return { from, to, prevFrom, prevTo };
}

// ── Main export ───────────────────────────────────────────────

export async function getShopAnalytics(shopId, { period = '7d' } = {}) {
  const { from, to, prevFrom, prevTo } = getWindow(period);

  // Run all queries in parallel for speed
  const [
    currentSubOrders,
    prevSubOrders,
    topProducts,
    peakHours,
    deliveryTimes,
    lowStock,
  ] = await Promise.all([
    fetchSubOrders(shopId, from, to),
    fetchSubOrders(shopId, prevFrom, prevTo),
    fetchTopProducts(shopId, from, to),
    fetchPeakHours(shopId, from, to),
    fetchDeliveryTimes(shopId, from, to),
    fetchLowStock(shopId),
  ]);

  // ── Revenue ──────────────────────────────────────────────
  const delivered    = currentSubOrders.filter(s => s.status === 'delivered');
  const prevDelivered = prevSubOrders.filter(s => s.status === 'delivered');

  const totalRevenue = delivered.reduce((s, r) => s + (r.total_amount || 0), 0);
  const prevRevenue  = prevDelivered.reduce((s, r) => s + (r.total_amount || 0), 0);

  const revenueQuick     = delivered.filter(s => s.delivery_tier === 'quick')
                                    .reduce((s, r) => s + (r.total_amount || 0), 0);
  const revenueScheduled = delivered.filter(s => s.delivery_tier === 'scheduled')
                                    .reduce((s, r) => s + (r.total_amount || 0), 0);

  const revenueTrend = prevRevenue === 0
    ? null
    : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100);

  // ── Orders ───────────────────────────────────────────────
  const total     = currentSubOrders.length;
  const confirmed = currentSubOrders.filter(s => !['pending', 'cancelled', 'rejected'].includes(s.status)).length;
  const cancelled = currentSubOrders.filter(s => s.status === 'cancelled' || s.status === 'rejected').length;
  const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  return {
    period,
    window: { from, to },

    revenue: {
      total:    totalRevenue,
      byTier:   { quick: revenueQuick, scheduled: revenueScheduled },
      trend:    revenueTrend,          // % change vs prev period; null if no prev data
      prev:     prevRevenue,
    },

    orders: {
      total,
      confirmed,
      delivered: delivered.length,
      cancelled,
      cancelRate,
    },

    topProducts,
    peakHours,
    avgDeliveryTime: deliveryTimes,
    lowStockAlerts: lowStock,
  };
}

// ── Sub-queries ───────────────────────────────────────────────

async function fetchSubOrders(shopId, from, to) {
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('id, delivery_tier, status, total_amount, confirmed_at, delivered_at, created_at, orders!inner(shop_id)')
    .eq('orders.shop_id', shopId)
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.error('analytics fetchSubOrders error', { error: error.message });
    return [];
  }
  return data || [];
}

async function fetchTopProducts(shopId, from, to) {
  // Aggregate order_items through sub_orders → orders for the shop in this window
  const { data, error } = await supabaseAdmin
    .from('order_items')
    .select(`
      product_id,
      product_name,
      quantity,
      total_price,
      sub_orders!inner(
        orders!inner(shop_id),
        status,
        created_at
      )
    `)
    .eq('sub_orders.orders.shop_id', shopId)
    .eq('sub_orders.status', 'delivered')
    .gte('sub_orders.created_at', from)
    .lte('sub_orders.created_at', to);

  if (error) {
    logger.warn('analytics fetchTopProducts error', { error: error.message });
    return [];
  }

  // Aggregate client-side (PostgREST can't GROUP BY across nested joins)
  const map = new Map();
  for (const item of (data || [])) {
    const key = item.product_id;
    if (!map.has(key)) {
      map.set(key, { productId: key, name: item.product_name, unitsSold: 0, revenue: 0 });
    }
    const agg = map.get(key);
    agg.unitsSold += Number(item.quantity)   || 0;
    agg.revenue   += Number(item.total_price) || 0;
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

async function fetchPeakHours(shopId, from, to) {
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('created_at, orders!inner(shop_id)')
    .eq('orders.shop_id', shopId)
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.warn('analytics fetchPeakHours error', { error: error.message });
    return [];
  }

  // Bucket by hour (0–23) in IST (UTC+5:30)
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const buckets = new Array(24).fill(0);
  for (const row of (data || [])) {
    const istHour = new Date(new Date(row.created_at).getTime() + IST_OFFSET_MS)
      .getUTCHours();
    buckets[istHour]++;
  }

  return buckets.map((orderCount, hour) => ({ hour, orderCount }));
}

async function fetchDeliveryTimes(shopId, from, to) {
  // Only rows that have both confirmed_at and delivered_at (fully measured)
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('delivery_tier, confirmed_at, delivered_at, orders!inner(shop_id)')
    .eq('orders.shop_id', shopId)
    .eq('status', 'delivered')
    .not('confirmed_at', 'is', null)
    .not('delivered_at', 'is', null)
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.warn('analytics fetchDeliveryTimes error', { error: error.message });
    return { quick: null, scheduled: null };
  }

  const rows = data || [];
  function avgMinutes(tier) {
    const subset = rows.filter(r => r.delivery_tier === tier);
    if (!subset.length) return null;
    const totalMs = subset.reduce((s, r) => {
      return s + (new Date(r.delivered_at) - new Date(r.confirmed_at));
    }, 0);
    return Math.round(totalMs / subset.length / 60000); // ms → minutes
  }

  return {
    quick:     avgMinutes('quick'),
    scheduled: avgMinutes('scheduled'),
  };
}

async function fetchLowStock(shopId) {
  // PostgREST cannot compare two columns in the same row (stock_quantity <= low_stock_threshold).
  // Fetch all listed items ordered by stock ascending, filter client-side.
  const { data, error } = await supabaseAdmin
    .from('shop_inventory')
    .select('id, stock_quantity, low_stock_threshold, products!inner(id, name)')
    .eq('shop_id', shopId)
    .eq('is_listed', true)
    .order('stock_quantity', { ascending: true })
    .limit(200);

  if (error) {
    logger.warn('analytics fetchLowStock error', { error: error.message });
    return [];
  }

  return (data || [])
    .filter(r => Number(r.stock_quantity) <= Number(r.low_stock_threshold))
    .slice(0, 10)
    .map(r => ({
      inventoryId:  r.id,
      productId:    r.products?.id,
      product:      r.products?.name || 'Unknown',
      currentStock: Number(r.stock_quantity),
      threshold:    Number(r.low_stock_threshold),
    }));
}

