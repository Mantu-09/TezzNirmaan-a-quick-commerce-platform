// ────────────────────────────────────────────────────────────
// Settlement Controller — P4-4B
//
// Shop endpoints:
//   GET  /shop/settlements           — list batches (paginated)
//   GET  /shop/settlements/:batchId  — batch detail + items
//
// Admin endpoints:
//   GET  /admin/settlements/pending              — all pending batches
//   PATCH /admin/settlements/:batchId/paid       — mark paid
//   POST  /admin/settlements/generate            — manual trigger
// ────────────────────────────────────────────────────────────
import * as settlementService from '../services/settlement.service.js';
import { ValidationError } from '../utils/errors.js';

// ── Shop-Facing ───────────────────────────────────────────────

/**
 * GET /shop/settlements
 * Returns paginated settlement history for the authenticated shop owner.
 */
export async function getMySettlements(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));

    const result = await settlementService.getSettlementsForShop(req.shopId, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shop/settlements/:batchId
 * Returns a single settlement batch with its line items.
 */
export async function getSettlementDetail(req, res, next) {
  try {
    const { batchId } = req.params;
    const result = await settlementService.getSettlementDetail(batchId, req.shopId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── Admin-Facing ──────────────────────────────────────────────

/**
 * GET /admin/settlements/pending
 * Returns all pending/processing settlement batches across all shops.
 * Includes total outstanding payout amount for cash flow visibility.
 */
export async function listPendingSettlements(req, res, next) {
  try {
    const result = await settlementService.getPendingSettlements();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /admin/settlements/:batchId/paid
 * Mark a settlement as paid.
 *
 * Body: { payment_method: 'upi'|'bank_transfer', payment_reference: string, notes?: string }
 */
export async function markPaid(req, res, next) {
  try {
    const { batchId } = req.params;
    const { payment_method, payment_reference, notes } = req.body;

    if (!payment_method || !['upi', 'bank_transfer'].includes(payment_method)) {
      throw new ValidationError('payment_method must be "upi" or "bank_transfer"');
    }
    if (!payment_reference?.trim()) {
      throw new ValidationError('payment_reference is required');
    }

    const batch = await settlementService.markSettlementPaid(
      batchId,
      payment_method,
      payment_reference.trim(),
      notes
    );

    res.json({ success: true, batch });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/settlements/generate
 * Manually trigger a settlement run. Useful for:
 *   - Testing in development
 *   - Re-running if the cron missed a week
 *   - One-off off-cycle payouts
 *
 * Body: { period_start?: ISO string, period_end?: ISO string }
 * Omit both to use default (past 7 days).
 */
export async function triggerSettlement(req, res, next) {
  try {
    const { period_start, period_end } = req.body || {};

    const periodEnd   = period_end   ? new Date(period_end)   : new Date();
    const periodStart = period_start ? new Date(period_start) : undefined;

    if (period_start && isNaN(periodStart.getTime())) {
      throw new ValidationError('period_start must be a valid ISO date string');
    }
    if (isNaN(periodEnd.getTime())) {
      throw new ValidationError('period_end must be a valid ISO date string');
    }

    const result = await settlementService.generateWeeklySettlements(periodEnd, periodStart);

    res.json({
      success: true,
      message: `Settlement run complete: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}
