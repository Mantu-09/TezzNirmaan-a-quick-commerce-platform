// ────────────────────────────────────────────────────────────
// investor-analytics.controller.js — P10-6
//
// Admin endpoints for Series A investor metrics.
// All routes: authenticate + requireRole('platform_admin')
//
// Endpoints:
//   GET /admin/analytics/investor       — all-in-one metrics call
//   GET /admin/analytics/cohorts        — cohort retention matrix
//   GET /admin/analytics/unit-economics — CAC, LTV, payback
// ────────────────────────────────────────────────────────────
import {
  getInvestorMetrics,
  getCohortRetention,
  getUnitEconomics,
} from '../services/investor-analytics.service.js';
import logger from '../utils/logger.js';

// ── GET /admin/analytics/investor ────────────────────────────
// Main investor dashboard endpoint — all Series A metrics in one call.
// Cache-Control: 1-hour cache (data is nightly snapshots, not real-time)
export async function getInvestorDashboard(req, res, next) {
  try {
    const data = await getInvestorMetrics();

    res.set('Cache-Control', 'private, max-age=3600'); // 1-hour client cache
    res.json({
      success:    true,
      data,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('GET /admin/analytics/investor error', { error: err.message });
    next(err);
  }
}

// ── GET /admin/analytics/cohorts ─────────────────────────────
// Cohort retention matrix for the investor heatmap table.
export async function getCohortDashboard(req, res, next) {
  try {
    const data = await getCohortRetention();
    res.json({ success: true, data, generated_at: new Date().toISOString() });
  } catch (err) {
    logger.error('GET /admin/analytics/cohorts error', { error: err.message });
    next(err);
  }
}

// ── GET /admin/analytics/unit-economics ──────────────────────
// Unit economics: CAC, LTV, payback period, channel breakdown.
export async function getUnitEconomicsDashboard(req, res, next) {
  try {
    const data = await getUnitEconomics();
    res.json({ success: true, data, generated_at: new Date().toISOString() });
  } catch (err) {
    logger.error('GET /admin/analytics/unit-economics error', { error: err.message });
    next(err);
  }
}
