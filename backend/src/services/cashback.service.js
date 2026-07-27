// ────────────────────────────────────────────────────────────
// Cashback Service — P4-2B
//
// Implements a configurable cashback rules engine.
//
// Rules are loaded from the DB cashback_rules table and cached
// in-memory for 5 minutes to avoid a DB round-trip on every
// order delivery confirmation.
//
// Precedence (highest first):
//   1. Shop-specific rule (shop_id = order's shop_id)
//   2. Platform-wide rule (shop_id IS NULL)
//
// Reward flow:
//   confirmDelivery() → enqueueAwardCashback() → job worker
//     → calculateCashback() → creditWallet() credit_cashback type
//
// Cashback expires in 90 days to create return-purchase urgency.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }  from '../config/supabase.js';
import * as walletService from './wallet.service.js';
import { AppError }       from '../utils/errors.js';
import logger             from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────
export const CASHBACK_EXPIRY_DAYS = 90;  // expires in 90 days after award

// ── In-memory cache (avoids DB hit on every delivery) ─────────
let _rulesCache      = null;
let _rulesCacheExpiry = 0;
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────

/**
 * Load cashback rules from DB (with 5-min in-memory cache).
 * Returns all active, currently-valid rules, platform-wide first,
 * then shop-specific overrides.
 */
async function _loadRules() {
  if (_rulesCache && Date.now() < _rulesCacheExpiry) {
    return _rulesCache;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('cashback_rules')
    .select('id, min_order_paise, max_order_paise, cashback_percent, shop_id')
    .eq('is_active', true)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
    .lte('valid_from', now)
    .order('shop_id', { ascending: false, nullsFirst: false }) // shop-specific first
    .order('min_order_paise', { ascending: true });

  if (error) {
    logger.warn('cashback: DB load failed, using empty rules', { error: error.message });
    return [];
  }

  _rulesCache       = data || [];
  _rulesCacheExpiry = Date.now() + CACHE_TTL_MS;

  logger.debug('cashback: rules refreshed', { count: _rulesCache.length });
  return _rulesCache;
}

/** Invalidate the rules cache (called after admin CRUD operations). */
export function invalidateCashbackCache() {
  _rulesCache       = null;
  _rulesCacheExpiry = 0;
  logger.debug('cashback: rules cache invalidated');
}

/**
 * Find the applicable rule for an order.
 * Shop-specific rules are checked first (higher precedence).
 *
 * @param {object[]} rules  - sorted rules array from _loadRules()
 * @param {number}   amountPaise
 * @param {string|null} shopId
 * @returns {object|null}  the matching rule, or null
 */
function _findRule(rules, amountPaise, shopId) {
  // 1. Check shop-specific rules first
  if (shopId) {
    const shopRule = rules.find(r =>
      r.shop_id === shopId &&
      amountPaise >= r.min_order_paise &&
      (r.max_order_paise === null || amountPaise <= r.max_order_paise)
    );
    if (shopRule) return shopRule;
  }

  // 2. Fall through to platform-wide rules
  return rules.find(r =>
    r.shop_id === null &&
    amountPaise >= r.min_order_paise &&
    (r.max_order_paise === null || amountPaise <= r.max_order_paise)
  ) || null;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Calculate cashback for an order amount.
 * Returns 0 if no rule applies (never throws).
 *
 * @param {number} orderAmountPaise
 * @param {string|null} shopId  - for shop-specific rule lookup
 * @returns {{ paise: number, percent: number, ruleId: string|null }}
 */
export async function calculateCashback(orderAmountPaise, shopId = null) {
  try {
    const rules = await _loadRules();
    const rule  = _findRule(rules, orderAmountPaise, shopId);

    if (!rule) return { paise: 0, percent: 0, ruleId: null };

    const paise = Math.floor(orderAmountPaise * Number(rule.cashback_percent) / 100);
    return { paise, percent: Number(rule.cashback_percent), ruleId: rule.id };
  } catch (err) {
    logger.error('cashback: calculateCashback failed', { error: err.message });
    return { paise: 0, percent: 0, ruleId: null };  // fail silently — never block a delivery
  }
}

/**
 * Award cashback to a customer after delivery.
 * Idempotent — checks for existing cashback wallet transaction
 * for the same orderId before crediting again.
 *
 * Called by the job worker; should never throw.
 *
 * @param {string} userId
 * @param {string} orderId
 * @param {string} orderNumber  - for the wallet description
 * @param {number} orderAmountPaise
 * @param {string|null} shopId
 */
export async function awardCashback(userId, orderId, orderNumber, orderAmountPaise, shopId = null) {
  try {
    // ── Idempotency guard ──────────────────────────────────────
    // Prevent double-credit if the job is retried after a partial failure.
    const { data: existingCredit } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id')
      .eq('reference_id', orderId)
      .eq('type', 'credit_cashback')
      .maybeSingle();

    if (existingCredit) {
      logger.info('cashback: already awarded for this order (idempotency check passed)', { orderId });
      return { paise: 0, alreadyAwarded: true };
    }

    // ── Calculate ──────────────────────────────────────────────
    const { paise, percent } = await calculateCashback(orderAmountPaise, shopId);

    if (paise === 0) {
      logger.debug('cashback: no cashback applicable', { orderId, orderAmountPaise, shopId });
      return { paise: 0 };
    }

    // ── Credit wallet ──────────────────────────────────────────
    const expiresAt = new Date(Date.now() + CASHBACK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const description = `${percent}% cashback — Order #${orderNumber}`;

    await walletService.creditWallet(
      userId,
      paise,
      'credit_cashback',
      description,
      orderId,
      expiresAt,
    );

    logger.info('cashback: awarded', { userId, orderId, paise, percent });
    return { paise, percent };

  } catch (err) {
    // Never throw — a cashback failure must never block delivery confirmation.
    logger.error('cashback: awardCashback failed', {
      userId, orderId, orderAmountPaise, error: err.message,
    });
    return { paise: 0, error: err.message };
  }
}

// ── Admin CRUD ────────────────────────────────────────────────

/** List all cashback rules (for admin UI). */
export async function listRules() {
  const { data, error } = await supabaseAdmin
    .from('cashback_rules')
    .select(`
      id, min_order_paise, max_order_paise, cashback_percent,
      shop_id, is_active, valid_from, valid_until, created_at, updated_at,
      shops:shop_id (name)
    `)
    .order('shop_id', { ascending: true, nullsFirst: true })
    .order('min_order_paise', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Create a cashback rule.
 * @param {object} ruleData - { min_order_paise, max_order_paise, cashback_percent, shop_id, valid_until }
 * @param {string} adminUserId
 */
export async function createRule(ruleData, adminUserId) {
  const { data, error } = await supabaseAdmin
    .from('cashback_rules')
    .insert({
      min_order_paise:  ruleData.min_order_paise  ?? 0,
      max_order_paise:  ruleData.max_order_paise  ?? null,
      cashback_percent: ruleData.cashback_percent,
      shop_id:          ruleData.shop_id          ?? null,
      valid_until:      ruleData.valid_until       ?? null,
      created_by:       adminUserId,
    })
    .select()
    .single();

  if (error) throw error;
  invalidateCashbackCache();
  return data;
}

/**
 * Update a cashback rule (percentage, active status, or expiry).
 * @param {string} ruleId
 * @param {object} updates - { cashback_percent?, is_active?, valid_until?, max_order_paise? }
 */
export async function updateRule(ruleId, updates) {
  const allowed = ['cashback_percent', 'is_active', 'valid_until', 'min_order_paise', 'max_order_paise'];
  const patch = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  if (Object.keys(patch).length === 0) throw new AppError('No valid fields to update', 400);

  const { data, error } = await supabaseAdmin
    .from('cashback_rules')
    .update(patch)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) throw error;
  invalidateCashbackCache();
  return data;
}
