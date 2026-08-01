// ────────────────────────────────────────────────────────────
// Payout Controller — Razorpay Route (P8-2)
//
// Admin endpoints:
//   POST  /admin/shops/:shopId/route/setup       — create linked account
//   GET   /admin/route/transfers                  — list all transfers
//   GET   /admin/route/transfers/summary          — dashboard widget
//   GET   /admin/route/transfers/shop/:shopId     — per-shop history
//   POST  /admin/route/transfers/:id/reverse      — reverse a transfer
//
// Shop endpoints:
//   POST  /shop/bank-account                      — submit/update bank details
//   GET   /shop/bank-account                      — view account + verification status
//   GET   /shop/route/transfers                   — transfer history
// ────────────────────────────────────────────────────────────
import * as payoutService from '../services/payout.service.js';
import { ValidationError } from '../utils/errors.js';

// ── Admin: Linked Account Setup ───────────────────────────────

/**
 * POST /admin/shops/:shopId/route/setup
 * Creates or retrieves a Razorpay Route linked account for the shop.
 * The shop must have submitted bank details first via POST /shop/bank-account.
 */
export async function setupLinkedAccount(req, res, next) {
  try {
    const { shopId } = req.params;
    const result = await payoutService.createLinkedAccount(shopId);
    res.status(result.already_linked ? 200 : 201).json({
      success:  true,
      message:  result.already_linked
        ? 'Shop already has a Razorpay linked account'
        : 'Razorpay linked account created successfully',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

// ── Admin: Transfer Monitoring ────────────────────────────────

/**
 * GET /admin/route/transfers
 * List all Route transfers with optional filters.
 * Query params: shopId, status, page, limit
 */
export async function listAllTransfers(req, res, next) {
  try {
    const { shopId, status, page, limit } = req.query;
    const result = await payoutService.getRouteTransfers({
      shopId: shopId || undefined,
      status: status || undefined,
      page:   page   ? parseInt(page, 10)  : 1,
      limit:  limit  ? Math.min(100, parseInt(limit, 10)) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/route/transfers/summary
 * Dashboard widget — today's totals + shops on/off Route.
 */
export async function getTransferSummary(req, res, next) {
  try {
    const summary = await payoutService.getRouteSummary();
    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/route/transfers/shop/:shopId
 * Per-shop Route transfer history (admin view — unmasked).
 */
export async function listShopTransfersAdmin(req, res, next) {
  try {
    const { shopId } = req.params;
    const { page, limit } = req.query;
    const result = await payoutService.getShopRouteTransfers(shopId, {
      page:  page  ? parseInt(page, 10)  : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/route/transfers/:id/reverse
 * Reverse a processed transfer.
 * Body: { notes?: string }
 */
export async function reverseTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};
    const result = await payoutService.reverseTransfer(id, { notes });
    res.json({
      success: true,
      message: `Transfer reversed. Razorpay reversal ID: ${result.reversal_id}`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

// ── Shop: Bank Account Management ────────────────────────────

/**
 * POST /shop/bank-account
 * Submit or update bank account details.
 * Body: { account_name, account_number, ifsc_code, bank_name?, account_type?, pan_number? }
 */
export async function saveBankAccount(req, res, next) {
  try {
    const {
      account_name,
      account_number,
      ifsc_code,
      bank_name,
      account_type,
      pan_number,
    } = req.body;

    if (!account_name?.trim() || !account_number?.trim() || !ifsc_code?.trim()) {
      throw new ValidationError('account_name, account_number, and ifsc_code are required');
    }

    const result = await payoutService.saveBankAccount(req.shopId, {
      account_name,
      account_number,
      ifsc_code,
      bank_name,
      account_type,
      pan_number,
    });

    res.status(201).json({
      success: true,
      message: 'Bank account saved. Contact admin to activate Razorpay Route transfers.',
      bank_account: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shop/bank-account
 * View the shop's bank account with masked account number and Route status.
 */
export async function getBankAccount(req, res, next) {
  try {
    const account = await payoutService.getBankAccount(req.shopId);
    res.json({
      success: true,
      bank_account: account,
      has_account:  !!account,
      on_route:     !!(account?.razorpay_account_id),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shop/route/transfers
 * Shop owner's Route transfer history.
 * Query params: page, limit
 */
export async function getMyRouteTransfers(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await payoutService.getShopRouteTransfers(req.shopId, {
      page:  page  ? parseInt(page, 10)  : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
