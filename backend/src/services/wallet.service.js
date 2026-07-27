// ────────────────────────────────────────────────────────────
// Wallet Service — P3-C
//
// All balance mutations go through Postgres RPCs (credit_wallet,
// debit_wallet) which use FOR UPDATE locking to prevent race
// conditions. Never use JS arithmetic on the balance directly.
//
// Public API:
//   getWallet(userId)                    → { balance_paise, transactions }
//   creditWallet(userId, ...)            → void
//   debitWallet(userId, amount, orderId) → { new_balance_paise }
//   getApplicableWalletAmount(userId, totalPaise) → { applicable, max_usable_paise }
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Maximum fraction of an order that wallet can cover (100% allowed)
// You can lower this to e.g. 0.5 to force partial cash payment.
const MAX_WALLET_COVERAGE = 1.0;

// ── Read operations ───────────────────────────────────────────

/**
 * Get wallet balance + recent transaction history for a user.
 * Creates the wallet row if it doesn't exist yet (first-time visitor).
 *
 * @param {string} userId - user's profile UUID
 * @param {number} [limit=20] - max transactions to return
 * @returns {{ balance_paise, lifetime_earned_paise, lifetime_spent_paise, transactions: [] }}
 */
export async function getWallet(userId, limit = 20) {
  // Attempt to read wallet
  const { data: wallet, error } = await supabaseAdmin
    .from('customer_wallets')
    .select('id, balance_paise, lifetime_earned_paise, lifetime_spent_paise, updated_at')
    .eq('user_id', userId)
    .single();

  // If wallet doesn't exist yet (new customer), return zero balance — no row insert.
  // The wallet is lazily created on first credit_wallet() call.
  if (error && error.code === 'PGRST116') {
    return {
      balance_paise:         0,
      lifetime_earned_paise: 0,
      lifetime_spent_paise:  0,
      updated_at:            null,
      transactions:          [],
    };
  }
  if (error) throw error;

  // Fetch recent transactions
  const { data: txns, error: txnErr } = await supabaseAdmin
    .from('wallet_transactions')
    .select('id, type, amount_paise, balance_after_paise, description, reference_id, expires_at, created_at')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (txnErr) throw txnErr;

  // Flag transactions expiring in the next 7 days so the UI can warn the user
  const now       = new Date();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const transactions = (txns || []).map(t => ({
    ...t,
    expiring_soon: t.expires_at
      ? new Date(t.expires_at) - now < sevenDays && new Date(t.expires_at) > now
      : false,
    is_expired: t.expires_at ? new Date(t.expires_at) <= now : false,
  }));

  return {
    balance_paise:         wallet.balance_paise,
    lifetime_earned_paise: wallet.lifetime_earned_paise,
    lifetime_spent_paise:  wallet.lifetime_spent_paise,
    updated_at:            wallet.updated_at,
    transactions,
  };
}

/**
 * Get the maximum wallet amount applicable to a given order total.
 * Respects MAX_WALLET_COVERAGE and available balance.
 *
 * @param {string} userId
 * @param {number} totalPaise - server-confirmed order total
 * @returns {{ applicable: boolean, max_usable_paise: number, balance_paise: number }}
 */
export async function getApplicableWalletAmount(userId, totalPaise) {
  const { data: wallet } = await supabaseAdmin
    .from('customer_wallets')
    .select('balance_paise')
    .eq('user_id', userId)
    .single();

  const balance       = wallet?.balance_paise || 0;
  const maxCoverage   = Math.floor(totalPaise * MAX_WALLET_COVERAGE);
  const maxUsable     = Math.min(balance, maxCoverage);

  return {
    applicable:      maxUsable > 0,
    max_usable_paise: maxUsable,
    balance_paise:   balance,
  };
}

// ── Write operations (via Postgres RPCs) ──────────────────────

/**
 * Credit the wallet — atomic via credit_wallet RPC.
 * Creates the wallet on first credit if it doesn't exist.
 *
 * @param {string} userId
 * @param {number} amountPaise   - must be > 0
 * @param {string} type          - wallet_transaction_type value
 * @param {string} description   - human-readable label for transaction history
 * @param {string|null} referenceId - orderId or refundId for traceability
 * @param {string|null} expiresAt   - ISO timestamp for promo credits
 */
export async function creditWallet(
  userId,
  amountPaise,
  type,
  description,
  referenceId = null,
  expiresAt   = null
) {
  if (amountPaise <= 0) {
    throw new AppError('Credit amount must be positive', 400);
  }

  const { error } = await supabaseAdmin.rpc('credit_wallet', {
    p_user_id:      userId,
    p_amount:       amountPaise,
    p_type:         type,
    p_description:  description,
    p_reference_id: referenceId,
    p_expires_at:   expiresAt,
  });

  if (error) {
    logger.error('wallet.service: credit_wallet RPC failed', {
      userId, amountPaise, type, error: error.message,
    });
    throw new AppError(`Wallet credit failed: ${error.message}`, 500);
  }

  logger.info('wallet.service: credited', { userId, amountPaise, type });
}

/**
 * Debit the wallet — atomic via debit_wallet RPC.
 * Throws 422 if balance is insufficient (the RPC raises INSUFFICIENT_BALANCE).
 *
 * @param {string} userId
 * @param {number} amountPaise - must be > 0
 * @param {string} orderId     - reference for the ledger row
 * @returns {{ new_balance_paise: number }}
 */
export async function debitWallet(userId, amountPaise, orderId) {
  if (amountPaise <= 0) {
    throw new AppError('Debit amount must be positive', 400);
  }

  const { data: newBalance, error } = await supabaseAdmin.rpc('debit_wallet', {
    p_user_id:  userId,
    p_amount:   amountPaise,
    p_order_id: orderId,
  });

  if (error) {
    // RPC raises specific error codes we can surface to the user
    if (error.message?.includes('INSUFFICIENT_BALANCE')) {
      throw new AppError('Insufficient wallet balance', 422);
    }
    if (error.message?.includes('WALLET_NOT_FOUND')) {
      throw new AppError('Wallet not found — please add funds first', 422);
    }
    logger.error('wallet.service: debit_wallet RPC failed', {
      userId, amountPaise, orderId, error: error.message,
    });
    throw new AppError(`Wallet debit failed: ${error.message}`, 500);
  }

  logger.info('wallet.service: debited', { userId, amountPaise, orderId, newBalance });
  return { new_balance_paise: newBalance };
}

/**
 * Convenience: instant refund to wallet (called from cancellation flow).
 * This is an alternative to Razorpay refund — faster (instant) and keeps
 * the money inside TezzNirmaan's ecosystem.
 *
 * @param {string} userId
 * @param {number} amountPaise
 * @param {string} orderId
 * @param {string} orderNumber - for the description text
 */
export async function refundToWallet(userId, amountPaise, orderId, orderNumber) {
  await creditWallet(
    userId,
    amountPaise,
    'credit_refund',
    `Refund for order #${orderNumber}`,
    orderId,
    null   // refund credits don't expire
  );
  logger.info('wallet.service: instant refund to wallet', { userId, amountPaise, orderId });
}
