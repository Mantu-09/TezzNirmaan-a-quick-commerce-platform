// ────────────────────────────────────────────────────────────
// investor-analytics.service.js — P10-6
//
// Series A investor metrics: GMV growth, cohort retention,
// unit economics (CAC/LTV), city breakdown.
//
// Design principles:
//   • All DB queries run in parallel (Promise.all)
//   • Never throws — returns zero-safe defaults on DB error
//   • All money in PAISE internally
//   • Growth calculations done in JS after DB fetch
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../utils/logger.js';

// ── Helper: average MoM GMV growth ───────────────────────────
function calculateAvgGrowth(monthsWithGrowth) {
  const growths = monthsWithGrowth
    .map(m => parseFloat(m.gmv_growth_pct))
    .filter(g => !isNaN(g) && g !== null);
  if (growths.length === 0) return null;
  return (growths.reduce((s, g) => s + g, 0) / growths.length).toFixed(1);
}

// ── Helper: calculate LTV from monthly metrics ────────────────
// LTV proxy: avg order value × avg orders per customer
// Simple but honest at pre-Series-A stage.
function calculateLTV(months) {
  const totalOrders    = months.reduce((s, m) => s + (m.order_count   || 0), 0);
  const totalCustomers = months.reduce((s, m) => s + (m.new_customers  || 0), 0);
  const totalGMV       = months.reduce((s, m) => s + (m.gmv_paise     || 0), 0);

  if (totalCustomers === 0) return { ltv_paise: 0, avg_orders_per_customer: 0 };

  const avgOrdersPerCustomer = totalOrders / totalCustomers;
  const avgOrderValue        = totalOrders > 0 ? totalGMV / totalOrders : 0;
  const ltv                  = Math.round(avgOrderValue * avgOrdersPerCustomer);

  return {
    ltv_paise:               ltv,
    avg_orders_per_customer: parseFloat(avgOrdersPerCustomer.toFixed(1)),
    avg_order_value_paise:   Math.round(avgOrderValue),
  };
}

// ── Main: getInvestorMetrics ──────────────────────────────────
export async function getInvestorMetrics() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [monthlyResult, cohortResult, cityResult, spendResult] = await Promise.all([
      // Monthly GMV snapshots (from nightly materialized table)
      supabaseAdmin
        .from('monthly_metrics')
        .select('*')
        .order('month', { ascending: true }),

      // Cohort retention matrix
      supabaseAdmin
        .from('cohort_retention')
        .select('*')
        .order('cohort_month', { ascending: true }),

      // City GMV breakdown — live from orders (last 30 days)
      // orders has no city_id — must traverse orders → shops → cities
      // (shops.city_id was added in migration 034_cities.sql)
      supabaseAdmin
        .from('orders')
        .select(`
          total_amount,
          status,
          shops!orders_shop_id_fkey (
            city_id,
            cities ( name, slug )
          )
        `)
        .gte('created_at', thirtyDaysAgo)
        .not('status', 'in', '("cancelled","refunded")'),

      // P11-6: Marketing spend — last 12 months for CAC calculation
      supabaseAdmin
        .from('marketing_spend')
        .select('month, channel, amount_paise, new_customers_attributed')
        .order('month', { ascending: false })
        .limit(12),
    ]);

    const months = monthlyResult.data || [];
    if (monthlyResult.error) {
      logger.warn('[investor-analytics] monthly_metrics query error', { error: monthlyResult.error.message });
    }

    // ── Add MoM growth rate to each month ───────────────────
    const withGrowth = months.map((month, i) => {
      const prev = months[i - 1];
      return {
        ...month,
        gmv_growth_pct: prev && prev.gmv_paise > 0
          ? parseFloat(((month.gmv_paise - prev.gmv_paise) / prev.gmv_paise * 100).toFixed(1))
          : null,
      };
    });

    // ── Build cohort retention matrix ────────────────────────
    const cohortRows = cohortResult.data || [];
    // Group by cohort_month
    const cohortMatrix = {};
    cohortRows.forEach(row => {
      const key = row.cohort_month;
      if (!cohortMatrix[key]) cohortMatrix[key] = { total: row.total_cohort_size, months: {} };
      const monthIndex = Math.round(
        (new Date(row.active_month) - new Date(row.cohort_month)) /
        (30.44 * 24 * 60 * 60 * 1000)
      );
      const retentionPct = row.total_cohort_size > 0
        ? parseFloat(((row.active_users / row.total_cohort_size) * 100).toFixed(1))
        : 0;
      cohortMatrix[key].months[monthIndex] = {
        active_users:   row.active_users,
        retention_pct:  retentionPct,
        gmv_paise:      row.gmv_paise,
      };
    });

    // ── City breakdown from live orders ──────────────────────
    const cityOrders = cityResult.data || [];
    const cityMap    = {};
    cityOrders.forEach(order => {
      // Traverse: order -> shops -> cities
      const cityName = order.shops?.cities?.name || 'Unknown';
      if (!cityMap[cityName]) cityMap[cityName] = { name: cityName, gmv_paise: 0, order_count: 0 };
      cityMap[cityName].gmv_paise   += Math.round((order.total_amount || 0) * 100);
      cityMap[cityName].order_count += 1;
    });
    const cityBreakdown = Object.values(cityMap)
      .sort((a, b) => b.gmv_paise - a.gmv_paise);

    // ── Summary / unit economics ─────────────────────────────
    const totalNewCustomers = months.reduce((s, m) => s + (m.new_customers  || 0), 0);
    const totalGMV          = months.reduce((s, m) => s + (m.gmv_paise      || 0), 0);
    const totalOrders       = months.reduce((s, m) => s + (m.order_count    || 0), 0);
    const { ltv_paise, avg_orders_per_customer, avg_order_value_paise } = calculateLTV(months);
    const avgGrowth   = calculateAvgGrowth(withGrowth);
    const latestMonth = withGrowth[withGrowth.length - 1] || null;

    // ── P11-6: Marketing spend + real CAC ────────────────────
    const spendRows = spendResult?.data || [];
    if (spendResult?.error) {
      logger.warn('[investor-analytics] marketing_spend query error', { error: spendResult.error.message });
    }

    // Current month key: 'YYYY-MM-01'
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const thisMonthSpend = spendRows.filter(s => s.month === thisMonthKey || s.month?.startsWith(thisMonthKey.slice(0, 7)));
    const totalSpendPaise    = thisMonthSpend.reduce((s, r) => s + (r.amount_paise || 0), 0);
    const paidCustomers      = thisMonthSpend.reduce((s, r) => s + (r.new_customers_attributed || 0), 0);
    const totalSpendAllTime  = spendRows.reduce((s, r) => s + (r.amount_paise || 0), 0);
    const paidCustomersTotal = spendRows.reduce((s, r) => s + (r.new_customers_attributed || 0), 0);

    // Blended CAC: total all-time spend / total attributed customers
    const cac_paise = paidCustomersTotal > 0
      ? Math.floor(totalSpendAllTime / paidCustomersTotal)
      : 0;

    // CAC this month only
    const cac_this_month_paise = paidCustomers > 0
      ? Math.floor(totalSpendPaise / paidCustomers)
      : 0;

    const cac_note = totalSpendAllTime === 0
      ? 'CAC is ₹0 — all growth is 100% organic (referral + word-of-mouth). Update when paid campaigns begin.'
      : `Blended CAC: ${paidCustomersTotal} paid customers / ₹${Math.round(totalSpendAllTime / 100).toLocaleString('en-IN')} total spend.`;

    return {
      monthly_metrics:  withGrowth,
      cohort_matrix:    cohortMatrix,
      cohort_raw:       cohortRows,
      city_breakdown:   cityBreakdown,
      marketing_spend:  spendRows,           // P11-6: raw rows for dashboard table
      summary: {
        total_gmv_paise:             totalGMV,
        total_orders:                totalOrders,
        total_customers:             totalNewCustomers,
        latest_month_gmv_paise:      latestMonth?.gmv_paise      || 0,
        latest_month_growth_pct:     latestMonth?.gmv_growth_pct || null,
        avg_monthly_gmv_growth_pct:  avgGrowth,
        active_cities:               cityBreakdown.length,
        // Unit economics — P11-6: real CAC from marketing_spend
        cac_paise,
        cac_this_month_paise,
        total_spend_paise:           totalSpendAllTime,
        paid_customers_attributed:   paidCustomersTotal,
        ltv_paise,
        avg_orders_per_customer,
        avg_order_value_paise:       avg_order_value_paise || latestMonth?.avg_order_value_paise || 0,
        ltv_cac_ratio:               cac_paise > 0 ? parseFloat((ltv_paise / cac_paise).toFixed(1)) : null,
        cac_note,
      },
    };
  } catch (err) {
    logger.error('[investor-analytics] getInvestorMetrics error', { error: err.message });
    // Return empty-but-valid structure — never crash the endpoint
    return {
      monthly_metrics: [],
      cohort_matrix:   {},
      cohort_raw:      [],
      city_breakdown:  [],
      summary: {
        total_gmv_paise: 0, total_orders: 0, total_customers: 0,
        cac_paise: 0, ltv_paise: 0, avg_orders_per_customer: 0,
        avg_order_value_paise: 0, ltv_cac_ratio: null, active_cities: 0,
        cac_note: '',
      },
    };
  }
}

// ── getCohortRetention ────────────────────────────────────────
// Returns cohort retention as both raw rows and matrix for
// the heatmap table in the investor dashboard.
export async function getCohortRetention() {
  try {
    const { data, error } = await supabaseAdmin
      .from('cohort_retention')
      .select('*')
      .order('cohort_month', { ascending: true })
      .order('active_month',  { ascending: true });

    if (error) throw error;

    // Distinct cohort months
    const cohortMonths = [...new Set((data || []).map(r => r.cohort_month))];

    // Build matrix: cohortMonths × month-index (0..N)
    const matrix = cohortMonths.map(cm => {
      const rows = (data || []).filter(r => r.cohort_month === cm);
      const totalSize = rows[0]?.total_cohort_size || 0;
      const cells = rows.map(r => {
        const monthIdx = Math.round(
          (new Date(r.active_month) - new Date(cm)) / (30.44 * 24 * 60 * 60 * 1000)
        );
        return {
          month_index:    monthIdx,
          active_users:   r.active_users,
          retention_pct:  totalSize > 0
            ? parseFloat(((r.active_users / totalSize) * 100).toFixed(1))
            : 0,
          gmv_paise:      r.gmv_paise,
        };
      });
      return { cohort_month: cm, total_size: totalSize, cells };
    });

    return { raw: data || [], matrix, cohort_months: cohortMonths };
  } catch (err) {
    logger.error('[investor-analytics] getCohortRetention error', { error: err.message });
    return { raw: [], matrix: [], cohort_months: [] };
  }
}

// ── getUnitEconomics ──────────────────────────────────────────
// Detailed unit economics breakdown.
export async function getUnitEconomics() {
  try {
    // Last 6 months of monthly_metrics
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const fromDate = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), 1)
      .toISOString().split('T')[0];

    const [monthlyRes, cohortRes] = await Promise.all([
      supabaseAdmin
        .from('monthly_metrics')
        .select('*')
        .gte('month', fromDate)
        .order('month', { ascending: true }),
      supabaseAdmin
        .from('customer_cohorts')
        .select('acquisition_channel, city_id, cities ( name )')
        .gte('acquisition_month', fromDate),
    ]);

    const months    = monthlyRes.data  || [];
    const cohorts   = cohortRes.data   || [];

    // Channel breakdown
    const channelMap = { organic: 0, referral: 0, campaign: 0 };
    cohorts.forEach(c => {
      const ch = c.acquisition_channel || 'organic';
      channelMap[ch] = (channelMap[ch] || 0) + 1;
    });

    const { ltv_paise, avg_orders_per_customer, avg_order_value_paise } = calculateLTV(months);

    // CAC payback table: months needed to recover CAC from avg order margin
    // At ₹0 CAC → payback is 0 months (immediate)
    const paybackMonths = 0;

    return {
      cac_paise:                0,
      ltv_paise,
      ltv_cac_ratio:            null,   // ∞
      payback_months:           paybackMonths,
      avg_order_value_paise,
      avg_orders_per_customer,
      acquisition_channels:     channelMap,
      monthly_new_customers:    months.map(m => ({
        month:         m.month,
        new_customers: m.new_customers || 0,
      })),
      cac_note: 'All customer acquisition is organic. Update CAC when paid campaigns begin.',
    };
  } catch (err) {
    logger.error('[investor-analytics] getUnitEconomics error', { error: err.message });
    return {
      cac_paise: 0, ltv_paise: 0, ltv_cac_ratio: null,
      payback_months: 0, avg_order_value_paise: 0,
      avg_orders_per_customer: 0, acquisition_channels: {},
      monthly_new_customers: [], cac_note: '',
    };
  }
}
