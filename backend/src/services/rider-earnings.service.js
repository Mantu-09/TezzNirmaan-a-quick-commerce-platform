// ────────────────────────────────────────────────────────────
// Rider Earnings Service — P2-B
//
// Handles:
//   • Auto-inserting an earning record on delivery completion
//   • Fetching per-rider earnings summary (today, week, pending)
//   • Daily earnings time-series for the 7-day bar chart
//   • Payment history (past payout_batches)
//
// Earning logic:
//   base_earning_paise: ₹30 quick (3000p) | ₹50 scheduled (5000p)
//   bonus_paise:        ₹10 (1000p) during peak hours (7–10am, 5–9pm IST)
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────
const BASE_EARNING = {
  quick:     3000,   // ₹30 in paise
  scheduled: 5000,   // ₹50 in paise
  default:   3000,   // fallback
};
const PEAK_BONUS_PAISE = 1000; // ₹10

// IST offset
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * True if the given UTC Date (or now) is within IST peak hours.
 * Peak: 7am–10am or 5pm–9pm IST
 */
function isPeakHour(date = new Date()) {
  const istHour = new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();
  return (istHour >= 7 && istHour < 10) || (istHour >= 17 && istHour < 21);
}

/**
 * Returns base earning for a delivery based on the sub-order's delivery tier.
 * Called from delivery.service.js:confirmDelivery() after status update.
 */
export function calculateDeliveryEarning(deliveryTier) {
  return BASE_EARNING[deliveryTier] ?? BASE_EARNING.default;
}

// ── Auto-insert earning on delivery completion ─────────────────

/**
 * Creates a rider_earnings row after a successful delivery.
 * Called inside confirmDelivery() — non-blocking (fire and forget on error).
 *
 * @param {string} riderId              - riders.id (not profile_id)
 * @param {string} deliveryAssignmentId - delivery_assignments.id
 * @param {string} deliveryTier         - 'quick' | 'scheduled'
 * @param {Date}   [deliveredAt]        - defaults to now()
 */
export async function recordDeliveryEarning(riderId, deliveryAssignmentId, deliveryTier, deliveredAt = new Date()) {
  try {
    const basePaise  = calculateDeliveryEarning(deliveryTier);
    const bonusPaise = isPeakHour(deliveredAt) ? PEAK_BONUS_PAISE : 0;

    const { error } = await supabaseAdmin
      .from('rider_earnings')
      .insert({
        rider_id:               riderId,
        delivery_assignment_id: deliveryAssignmentId,
        base_earning_paise:     basePaise,
        bonus_paise:            bonusPaise,
        earned_at:              deliveredAt.toISOString(),
      });

    if (error) {
      // Idempotent: if the record already exists (unique constraint), that's fine
      if (!error.message?.includes('unique')) {
        logger.error('recordDeliveryEarning: insert failed', { riderId, deliveryAssignmentId, error: error.message });
      }
    } else {
      logger.info('Earning recorded', {
        riderId,
        total: (basePaise + bonusPaise) / 100,
        peak:  bonusPaise > 0,
      });
    }
  } catch (err) {
    // Never let earnings recording break the delivery flow
    logger.error('recordDeliveryEarning: unexpected error', { err: err.message });
  }
}

// ── Earnings Summary ──────────────────────────────────────────

/**
 * Full earnings summary for the rider mobile app:
 *   today's total, this week's deliveries, pending payout, payment history,
 *   daily bar chart (last 7 days).
 *
 * @param {string} profileId - req.user.id (profile_id, not rider.id)
 */
export async function getRiderEarningsSummary(profileId) {
  // Resolve profile_id → rider.id
  const { data: rider, error: riderErr } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (riderErr || !rider) {
    throw new Error('Rider record not found for this profile');
  }

  const riderId = rider.id;
  const now     = new Date();
  const IST_now = new Date(now.getTime() + IST_OFFSET_MS);

  // ── Date boundaries in IST ─────────────────────────────
  const todayIST = new Date(IST_now);
  todayIST.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(todayIST.getTime() - IST_OFFSET_MS); // back to UTC

  const weekStart = new Date(todayIST);
  weekStart.setDate(weekStart.getDate() - 6);  // 7 days incl. today
  const weekStartUTC = new Date(weekStart.getTime() - IST_OFFSET_MS);

  // ── Parallel queries ───────────────────────────────────
  const [todayRes, weekRes, pendingRes, historyRes] = await Promise.all([
    // Today's earnings
    supabaseAdmin
      .from('rider_earnings')
      .select('total_paise, bonus_paise, earned_at, payment_status, delivery_assignment_id')
      .eq('rider_id', riderId)
      .gte('earned_at', todayStart.toISOString())
      .order('earned_at', { ascending: false }),

    // This week's detailed list (for per-delivery breakdown)
    supabaseAdmin
      .from('rider_earnings')
      .select(`
        id,
        base_earning_paise,
        bonus_paise,
        total_paise,
        payment_status,
        earned_at,
        delivery_assignment_id,
        delivery_assignments!inner(
          picked_up_at,
          delivered_at,
          sub_orders!inner(
            sub_order_number,
            delivery_tier,
            orders!inner(delivery_address_snapshot)
          )
        )
      `)
      .eq('rider_id', riderId)
      .gte('earned_at', weekStartUTC.toISOString())
      .order('earned_at', { ascending: false }),

    // All unpaid earnings (pending payout)
    supabaseAdmin
      .from('rider_earnings')
      .select('total_paise')
      .eq('rider_id', riderId)
      .eq('payment_status', 'pending'),

    // Past payout batches (payment history)
    supabaseAdmin
      .from('payout_batches')
      .select('id, total_paise, period_start, period_end, status, payment_reference, paid_at, created_at')
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // ── Today summary ────────────────────────────────────────
  const todayDeliveries = todayRes.data || [];
  const todayTotal      = todayDeliveries.reduce((s, r) => s + (r.total_paise || 0), 0);
  const todayBonuses    = todayDeliveries.reduce((s, r) => s + (r.bonus_paise || 0), 0);

  // ── Week per-delivery list ───────────────────────────────
  const weekDeliveries = (weekRes.data || []).map(r => {
    const assignment = r.delivery_assignment_id;
    const subOrder   = r.delivery_assignments?.sub_orders;
    const addr       = subOrder?.orders?.delivery_address_snapshot;
    return {
      id:              r.id,
      earnedAt:        r.earned_at,
      basePaise:       r.base_earning_paise,
      bonusPaise:      r.bonus_paise,
      totalPaise:      r.total_paise,
      status:          r.payment_status,
      deliveryTier:    subOrder?.delivery_tier,
      subOrderNumber:  subOrder?.sub_order_number,
      deliveryAddress: addr
        ? [addr.line1, addr.city].filter(Boolean).join(', ')
        : 'Address unavailable',
      isPeakBonus:     (r.bonus_paise || 0) > 0,
    };
  });

  // ── Pending payout total ─────────────────────────────────
  const pendingTotal = (pendingRes.data || []).reduce((s, r) => s + (r.total_paise || 0), 0);

  // ── Daily bar chart (last 7 days) ────────────────────────
  // Build day buckets from weekDeliveries already fetched
  const dailyMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(todayIST);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD (IST)
    dailyMap.set(key, { date: key, totalPaise: 0, deliveryCount: 0 });
  }

  for (const w of weekDeliveries) {
    const istDate = new Date(new Date(w.earnedAt).getTime() + IST_OFFSET_MS)
      .toISOString().slice(0, 10);
    if (dailyMap.has(istDate)) {
      dailyMap.get(istDate).totalPaise    += w.totalPaise;
      dailyMap.get(istDate).deliveryCount += 1;
    }
  }

  const dailyChart = Array.from(dailyMap.values());

  // ── Week totals ──────────────────────────────────────────
  const weekTotal     = weekDeliveries.reduce((s, r) => s + r.totalPaise, 0);
  const weekDelivCount = weekDeliveries.length;

  return {
    today: {
      totalPaise:      todayTotal,
      deliveryCount:   todayDeliveries.length,
      bonusPaise:      todayBonuses,
      peakDeliveries:  todayDeliveries.filter(r => r.bonus_paise > 0).length,
    },
    week: {
      totalPaise:    weekTotal,
      deliveryCount: weekDelivCount,
      deliveries:    weekDeliveries,
    },
    pending: {
      totalPaise:    pendingTotal,
    },
    dailyChart,
    paymentHistory: historyRes.data || [],
  };
}

// ── Paginated payout history (P6-4) ───────────────────────────

/**
 * Paginated list of payout_batches for a rider.
 * Used by GET /rider/earnings/history for infinite-scroll in the mobile app.
 *
 * @param {string} profileId
 * @param {{ page?: number, limit?: number }} opts
 */
export async function getPaginatedPayoutHistory(profileId, { page = 1, limit = 10 } = {}) {
  const { data: rider, error: riderErr } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (riderErr || !rider) throw new Error('Rider record not found for this profile');

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabaseAdmin
    .from('payout_batches')
    .select('id, total_paise, period_start, period_end, status, payment_reference, paid_at, created_at', { count: 'exact' })
    .eq('rider_id', rider.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    batches:  data || [],
    total:    count || 0,
    page,
    limit,
    hasMore:  from + (data?.length || 0) < (count || 0),
  };
}
