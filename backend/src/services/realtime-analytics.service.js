// ────────────────────────────────────────────────────────────
// realtime-analytics.service.js — P9-3
//
// Aggregates live platform metrics for the founder dashboard.
// Called by GET /admin/analytics/live (admin-only).
//
// All queries run in parallel via Promise.all for minimum latency.
// Target: < 500ms response on a warm Supabase instance.
//
// Money: all amounts are in PAISE internally.
//        The API boundary converts to rupees.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../utils/logger.js';

/**
 * getLiveStats()
 *
 * Returns a snapshot of the platform right now:
 *   - today's order count and GMV
 *   - count of currently in-flight (active) deliveries
 *   - per-city order breakdown
 *   - last 10 orders for the feed
 *   - hourly order chart data for the last 24 hours
 *
 * @returns {Promise<object>}
 */
export async function getLiveStats() {
  const now       = new Date();
  const todayStart = new Date(
    now.getFullYear(), now.getMonth(), now.getDate()
  ).toISOString();

  const [
    todayOrdersRes,
    activeOrdersRes,
    todayGmvRes,
    cityBreakdownRes,
    recentOrdersRes,
    hourlyOrdersRes,
  ] = await Promise.all([
    // ── Today's total order count ──────────────────────────
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart),

    // ── Currently in-flight deliveries ────────────────────
    supabaseAdmin
      .from('sub_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']),

    // ── Today's GMV via RPC (defined in 051_realtime_analytics_rpcs.sql) ──
    supabaseAdmin.rpc('get_today_gmv', { p_from: todayStart }),

    // ── Orders by city today via RPC ───────────────────────
    supabaseAdmin.rpc('get_city_breakdown', { p_from: todayStart }),

    // ── Last 10 orders for the live feed ──────────────────
    supabaseAdmin
      .from('orders')
      .select(`
        order_number,
        total_amount_paise,
        status,
        payment_status,
        created_at,
        shops ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(10),

    // ── Hourly order chart for last 24h ───────────────────
    supabaseAdmin.rpc('get_hourly_orders', { p_hours: 24 }),
  ]);

  // ── Log any errors (non-fatal — return partial data) ────
  const errors = [
    todayOrdersRes.error,
    activeOrdersRes.error,
    todayGmvRes.error,
    cityBreakdownRes.error,
    recentOrdersRes.error,
    hourlyOrdersRes.error,
  ].filter(Boolean);

  if (errors.length) {
    logger.warn('[realtime-analytics] Partial error in getLiveStats', {
      errors: errors.map(e => e.message),
    });
  }

  // ── Shape the response ────────────────────────────────────
  return {
    today: {
      orders:           todayOrdersRes.count  || 0,
      gmv_paise:        todayGmvRes.data?.[0]?.total || 0,
      active_deliveries: activeOrdersRes.count || 0,
    },
    cities:        cityBreakdownRes.data  || [],
    recent_orders: (recentOrdersRes.data  || []).map(o => ({
      order_number:       o.order_number,
      total_amount_paise: o.total_amount_paise,
      status:             o.status,
      payment_status:     o.payment_status,
      shop_name:          o.shops?.name || '—',
      created_at:         o.created_at,
    })),
    hourly_chart:  hourlyOrdersRes.data   || [],
    timestamp:     now.toISOString(),
  };
}
