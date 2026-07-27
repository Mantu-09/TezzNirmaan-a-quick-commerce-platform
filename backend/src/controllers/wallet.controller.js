// ────────────────────────────────────────────────────────────
// Wallet Controller — P3-C
//
// Routes:
//   GET  /customer/wallet              → balance + transaction history
//   POST /customer/wallet/applicable   → max usable amount for a given order total
// ────────────────────────────────────────────────────────────
import * as walletService from '../services/wallet.service.js';
import { AppError } from '../utils/errors.js';

/**
 * GET /customer/wallet
 * Returns the authenticated customer's wallet balance and transaction history.
 * Query params:
 *   limit (optional, default 20) — number of transactions to return
 */
export async function getWallet(req, res, next) {
  try {
    const userId = req.user.id;
    const limit  = req.query.limit ? Math.min(+req.query.limit, 100) : 20;

    const wallet = await walletService.getWallet(userId, limit);
    res.json({ success: true, data: wallet });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /customer/wallet/applicable
 * Body: { total_paise: number }
 *
 * Returns how much of the wallet balance can be applied to an order
 * of the given total. Used by the checkout screen to show the wallet
 * toggle without making a full order placement call.
 *
 * Response: { applicable: boolean, max_usable_paise: number, balance_paise: number }
 */
export async function getApplicableAmount(req, res, next) {
  try {
    const userId      = req.user.id;
    const totalPaise  = req.body.total_paise;

    if (typeof totalPaise !== 'number' || totalPaise <= 0) {
      throw new AppError('total_paise must be a positive number', 400);
    }

    const result = await walletService.getApplicableWalletAmount(userId, totalPaise);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
