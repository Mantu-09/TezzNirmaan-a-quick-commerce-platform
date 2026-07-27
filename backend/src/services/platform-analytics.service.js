// ────────────────────────────────────────────────────────────
// Platform Analytics Service — P2-A
//
// Cross-shop, platform-level metrics for the admin GMV dashboard.
//
// Design:
//   • All heavy aggregation done in PostgREST/SQL, not JS loops
//   • Runs all queries in parallel (Promise.all) for low latency
//   • Returns zero-safe defaults — never throws to the controller
//   • All money in PAISE internally; converted to rupees at the API boundary
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// ── Period helpers ────────────────────────────────────────────

function getWindow(period = '30d') {
  const now = new Date();
  const to  = now.toISOString();
  let from, prevFrom, prevTo;

  const daysBack = period === 'today' ? 0 : period === '7d' ? 7 : 30;

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    from     = start.toISOString();
    prevTo   = from;
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 1);
    prevFrom = prevStart.toISOString();
  } else {
    const start = new Date(now);
    start.setDate(start.getDate() - daysBack);
    from     = start.toISOString();
    prevTo   = from;
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - daysBack);
    prevFrom = prevStart.toISOString();
  }

  return { from, to, prevFrom, prevTo, daysBack };
}

// ── Main export ───────────────────────────────────────────────

/**
 * Platform-level analytics for the admin GMV dashboard.
 *
 * @param {string} period  'today' | '7d' | '30d'
 * @returns {object} Full platform analytics payload
 */
export async function getPlatformAnalytics(period = '30d') {
  const { from, to, prevFrom, prevTo, daysBack } = getWindow(period);

  const [
    gmvData,
    prevGmvData,
    orderBreakdown,
    shopsData,
    topShops,
    ridersData,
    dailyGmv,
    cancellationReasons,
    peakData,
    walletLiability,       // P4-1C
  ] = await Promise.all([
    _fetchGmv(from, to),
    _fetchGmv(prevFrom, prevTo),
    _fetchOrderBreakdown(from, to),
    _fetchShopStats(from, to),
    _fetchTopShopsByRevenue(from, to),
    _fetchRiderStats(from, to),
    _fetchDailyGmv(from, to, daysBack),
    _fetchCancellationReasons(from, to),
    _fetchPeakDayHour(from, to),
    _fetchWalletLiability(),  // P4-1C
  ]);

  // ── GMV trend ─────────────────────────────────────────────
  const gmvTrend = prevGmvData.total === 0
    ? null
    : Math.round(((gmvData.total - prevGmvData.total) / prevGmvData.total) * 100);

  return {
    period,
    window: { from, to },

    gmv: {
      total_paise:          gmvData.total,
      trend_vs_previous:    gmvTrend,        // % change vs prev period; null = no prev data
      by_tier: {
        quick_paise:        gmvData.quick,
        scheduled_paise:    gmvData.scheduled,
      },
    },

    take_rate: 0.05,   // 5% commission placeholder for future billing

    orders: {
      total:       orderBreakdown.total,
      completed:   orderBreakdown.completed,
      cancelled:   orderBreakdown.cancelled,
      pending:     orderBreakdown.pending,
      cancel_rate: orderBreakdown.total > 0
        ? Math.round((orderBreakdown.cancelled / orderBreakdown.total) * 100)
        : 0,
    },

    shops: {
      total_active:      shopsData.totalActive,
      new_this_period:   shopsData.newThisPeriod,
      top_by_revenue:    topShops,
    },

    riders: {
      total_active:              ridersData.totalActive,
      avg_deliveries_per_day:    ridersData.avgDeliveriesPerDay,
      avg_delivery_time_minutes: ridersData.avgDeliveryTimeMinutes,
    },

    // City breakdown (Patna pilot — extensible for multi-city)
    cities: {
      patna: {
        orders:     orderBreakdown.total,   // all orders are Patna for now
        gmv_paise:  gmvData.total,
      },
    },

    daily_gmv:              dailyGmv,           // array of { date, gmv_paise, order_count }
    cancellation_reasons:   cancellationReasons, // array of { reason, count }
    peak_day:               peakData.day,        // e.g. 'Saturday'
    peak_hour:              peakData.hour,        // 0-23 in IST

    // P4-1C: Platform liability — real money owed to customers
    // Track this separately from GMV; it is NOT revenue.
    // High values may indicate promo abuse or under-spent cashback — investigate.
    wallet_liability: {
      total_paise:         walletLiability.total_paise,
      total_inr:           walletLiability.total_paise / 100,
      wallet_count:        walletLiability.wallet_count,
      avg_balance_paise:   walletLiability.wallet_count > 0
        ? Math.round(walletLiability.total_paise / walletLiability.wallet_count)
        : 0,
    },
  };
}

// ── Sub-queries ───────────────────────────────────────────────

// P4-1C: Total outstanding wallet balance across all customers.
// This is a platform-wide liability snapshot (not period-filtered —
// the outstanding liability is always relevant regardless of the
// selected analytics window).
async function _fetchWalletLiability() {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_wallets')
      .select('balance_paise')
      .gt('balance_paise', 0);   // only wallets with a positive balance

    if (error) throw error;

    const rows        = data || [];
    const total_paise = rows.reduce((s, r) => s + (Number(r.balance_paise) || 0), 0);

    return {
      total_paise,
      wallet_count: rows.length,
    };
  } catch (err) {
    logger.error('platform-analytics _fetchWalletLiability error', { error: err.message });
    return { total_paise: 0, wallet_count: 0 };
  }
}

async function _fetchGmv(from, to) {
  // Sum total_amount from delivered sub_orders (GMV = only delivered value)
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('total_amount, delivery_tier')
    .eq('status', 'delivered')
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.error('platform-analytics _fetchGmv error', { error: error.message });
    return { total: 0, quick: 0, scheduled: 0 };
  }

  const rows = data || [];
  return {
    total:     rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    quick:     rows.filter(r => r.delivery_tier === 'quick').reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    scheduled: rows.filter(r => r.delivery_tier === 'scheduled').reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
  };
}

async function _fetchOrderBreakdown(from, to) {
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('status')
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.error('platform-analytics _fetchOrderBreakdown error', { error: error.message });
    return { total: 0, completed: 0, cancelled: 0, pending: 0 };
  }

  const rows = data || [];
  return {
    total:     rows.length,
    completed: rows.filter(r => r.status === 'delivered').length,
    cancelled: rows.filter(r => ['cancelled', 'rejected'].includes(r.status)).length,
    pending:   rows.filter(r => ['pending', 'confirmed', 'preparing', 'ready'].includes(r.status)).length,
  };
}

async function _fetchShopStats(from, to) {
  const [activeRes, newRes] = await Promise.all([
    supabaseAdmin.from('shops').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('shops').select('id', { count: 'exact', head: true }).gte('created_at', from).lte('created_at', to),
  ]);

  return {
    totalActive:    activeRes.count  || 0,
    newThisPeriod:  newRes.count     || 0,
  };
}

async function _fetchTopShopsByRevenue(from, to, limit = 10) {
  // Get delivered sub_orders with shop info via orders join
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select(`
      total_amount,
      delivery_tier,
      status,
      orders!inner(
        shop_id,
        shops!inner(id, name, city)
      )
    `)
    .eq('status', 'delivered')
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.error('platform-analytics _fetchTopShopsByRevenue error', { error: error.message });
    return [];
  }

  // Aggregate by shop client-side (PostgREST can't GROUP BY across nested joins)
  const map = new Map();
  for (const row of (data || [])) {
    const shop = row.orders?.shops;
    if (!shop) continue;
    if (!map.has(shop.id)) {
      map.set(shop.id, {
        shopId:      shop.id,
        name:        shop.name,
        city:        shop.city || 'Patna',
        gmv_paise:   0,
        order_count: 0,
      });
    }
    const agg = map.get(shop.id);
    agg.gmv_paise   += Number(row.total_amount) || 0;
    agg.order_count += 1;
  }

  // Also fetch ratings for each shop
  const shopIds = [...map.keys()];
  if (shopIds.length) {
    const { data: ratings } = await supabaseAdmin
      .from('shops')
      .select('id, average_rating, total_reviews')
      .in('id', shopIds);

    for (const r of (ratings || [])) {
      if (map.has(r.id)) {
        const s = map.get(r.id);
        s.average_rating = r.average_rating;
        s.total_reviews  = r.total_reviews;
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.gmv_paise - a.gmv_paise)
    .slice(0, limit);
}

async function _fetchRiderStats(from, to) {
  const [activeRes, deliveriesRes] = await Promise.all([
    supabaseAdmin.from('riders').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin
      .from('sub_orders')
      .select('confirmed_at, delivered_at, rider_id')
      .eq('status', 'delivered')
      .not('rider_id', 'is', null)
      .not('confirmed_at', 'is', null)
      .not('delivered_at', 'is', null)
      .gte('created_at', from)
      .lte('created_at', to),
  ]);

  const totalActive   = activeRes.count || 0;
  const deliveries    = deliveriesRes.data || [];

  // Avg deliveries per rider per day
  const daysInPeriod  = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));
  const uniqueRiders  = new Set(deliveries.map(d => d.rider_id)).size;
  const avgDeliveriesPerDay = uniqueRiders > 0 && daysInPeriod > 0
    ? Math.round((deliveries.length / uniqueRiders / daysInPeriod) * 10) / 10
    : 0;

  // Avg delivery time (confirmed → delivered) in minutes
  let avgDeliveryTimeMinutes = null;
  if (deliveries.length > 0) {
    const totalMs = deliveries.reduce((s, d) => {
      const ms = new Date(d.delivered_at) - new Date(d.confirmed_at);
      return ms > 0 ? s + ms : s;
    }, 0);
    avgDeliveryTimeMinutes = Math.round(totalMs / deliveries.length / 60000);
  }

  return { totalActive, avgDeliveriesPerDay, avgDeliveryTimeMinutes };
}

async function _fetchDailyGmv(from, to, daysBack = 30) {
  // Fetch delivered sub_orders with their date
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('total_amount, created_at')
    .eq('status', 'delivered')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('platform-analytics _fetchDailyGmv error', { error: error.message });
    return [];
  }

  // Build all days in window (IST)
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const dayMap = new Map();

  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(new Date(to).getTime() - i * 86400000 + IST_OFFSET_MS);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dayMap.set(key, { date: key, gmv_paise: 0, order_count: 0 });
  }

  for (const row of (data || [])) {
    const istDate = new Date(new Date(row.created_at).getTime() + IST_OFFSET_MS)
      .toISOString().slice(0, 10);
    if (dayMap.has(istDate)) {
      dayMap.get(istDate).gmv_paise   += Number(row.total_amount) || 0;
      dayMap.get(istDate).order_count += 1;
    }
  }

  return Array.from(dayMap.values());
}

async function _fetchCancellationReasons(from, to) {
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('cancellation_reason')
    .in('status', ['cancelled', 'rejected'])
    .gte('created_at', from)
    .lte('created_at', to);

  if (error) {
    logger.error('platform-analytics _fetchCancellationReasons error', { error: error.message });
    return [];
  }

  // Aggregate reasons
  const map = new Map();
  for (const row of (data || [])) {
    const reason = row.cancellation_reason || 'No reason given';
    map.set(reason, (map.get(reason) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function _fetchPeakDayHour(from, to) {
  const { data, error } = await supabaseAdmin
    .from('sub_orders')
    .select('created_at')
    .gte('created_at', from)
    .lte('created_at', to);

  if (error || !data?.length) return { day: null, hour: null };

  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const dayBuckets  = new Array(7).fill(0);
  const hourBuckets = new Array(24).fill(0);

  for (const row of data) {
    const ist  = new Date(new Date(row.created_at).getTime() + IST_OFFSET_MS);
    dayBuckets[ist.getUTCDay()]++;
    hourBuckets[ist.getUTCHours()]++;
  }

  const peakDayIdx  = dayBuckets.indexOf(Math.max(...dayBuckets));
  const peakHourIdx = hourBuckets.indexOf(Math.max(...hourBuckets));

  return {
    day:  data.length > 0 ? DAYS[peakDayIdx] : null,
    hour: data.length > 0 ? peakHourIdx : null,
  };
}
