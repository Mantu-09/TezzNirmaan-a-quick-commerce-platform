// ────────────────────────────────────────────────────────────
// Promo Service — P1-C: Discount Engine
//
// Validates promo codes at checkout and applies discounts.
// All validation runs SERVER-SIDE — the client only submits
// the code string; we never trust a client-submitted discount.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Fetch a single active promo code by code string.
 * @param {string} code
 * @returns {Promise<object|null>}
 */
async function getActivePromo(code) {
  const { data } = await supabaseAdmin
    .from('promo_codes')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .single();
  return data || null;
}

/**
 * Count how many times a user has redeemed a specific promo.
 * @param {string} promoId
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function getUserRedemptionCount(promoId, userId) {
  const { count } = await supabaseAdmin
    .from('promo_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('promo_id', promoId)
    .eq('user_id', userId);
  return count || 0;
}

/**
 * Validate a promo code and compute the discount amount.
 * Throws AppError (with HTTP 422) for any validation failure.
 *
 * @param {string} code              — the promo code string from the client
 * @param {string} userId            — authenticated customer's user ID
 * @param {number} orderAmountPaise  — order subtotal before discount (paise)
 * @param {string|null} tier         — 'quick' | 'scheduled' | null
 * @returns {Promise<{valid, promo_id, type, discount_paise, message}>}
 */
export async function validatePromo(code, userId, orderAmountPaise, tier) {
  if (!code?.trim()) throw new AppError('Promo code is required', 400);

  // 1. Find promo by code
  const promo = await getActivePromo(code);
  if (!promo) throw new AppError('Invalid or expired promo code', 404);

  // 2. Check validity window
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    throw new AppError('This promo code is not yet active', 422);
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    throw new AppError('This promo code has expired', 422);
  }

  // 3. Check global usage limit
  if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) {
    throw new AppError('This promo code has reached its usage limit', 422);
  }

  // 4. Check per-user limit
  const userRedemptions = await getUserRedemptionCount(promo.id, userId);
  if (userRedemptions >= promo.per_user_limit) {
    throw new AppError('You have already used this promo code', 422);
  }

  // 5. Check minimum order amount
  if (orderAmountPaise < promo.min_order_amount_paise) {
    const minAmount = (promo.min_order_amount_paise / 100).toFixed(0);
    throw new AppError(`Minimum order ₹${minAmount} required for this code`, 422);
  }

  // 6. Check tier applicability
  if (promo.applicable_tier && promo.applicable_tier !== tier) {
    const tierLabel = promo.applicable_tier === 'quick' ? 'Quick Delivery' : 'Scheduled Delivery';
    throw new AppError(`This code applies only to ${tierLabel} orders`, 422);
  }

  // 7. Calculate discount amount
  let discountPaise = 0;

  if (promo.type === 'percentage') {
    discountPaise = Math.floor(orderAmountPaise * promo.value / 100);
    if (promo.max_discount_paise != null) {
      discountPaise = Math.min(discountPaise, promo.max_discount_paise);
    }
  } else if (promo.type === 'flat') {
    discountPaise = Math.min(promo.value, orderAmountPaise);
  } else if (promo.type === 'free_delivery') {
    // Delivery fee waiver — actual amount set at order placement time
    // Return 0 here; order.service.js will apply it to the delivery fee line
    discountPaise = 0;
  }

  const discountRupees = (discountPaise / 100).toFixed(2);
  const message = promo.type === 'free_delivery'
    ? 'Free delivery applied! 🎉'
    : `Promo applied! You save ₹${discountRupees} 🎉`;

  logger.info('promo.service: validatePromo success', {
    code: promo.code, promoId: promo.id, userId, discountPaise,
  });

  return {
    valid:          true,
    promo_id:       promo.id,
    code:           promo.code,
    type:           promo.type,
    value:          promo.value,
    discount_paise: discountPaise,
    message,
  };
}

/**
 * Record a promo redemption and atomically increment the usage counter.
 * Called by order.service.js AFTER place_order_atomic succeeds.
 *
 * @param {string} promoId
 * @param {string} userId
 * @param {string} orderId
 * @param {number} discountPaise
 */
export async function recordRedemption(promoId, userId, orderId, discountPaise) {
  // Insert redemption row — UNIQUE constraint prevents double-use on same order
  const { error: insertErr } = await supabaseAdmin
    .from('promo_redemptions')
    .insert({ promo_id: promoId, user_id: userId, order_id: orderId, discount_paise: discountPaise });

  if (insertErr) {
    logger.error('promo.service: failed to record redemption', {
      promoId, userId, orderId, error: insertErr.message,
    });
    throw insertErr;
  }

  // Atomically increment usage_count
  const { error: updateErr } = await supabaseAdmin.rpc('increment_promo_usage', {
    p_promo_id: promoId,
  });

  if (updateErr) {
    // Non-fatal — the redemption row is already inserted, so the code won't work again for this user.
    // The usage_count may drift but per-user limits still hold via promo_redemptions.
    logger.error('promo.service: failed to increment usage_count', {
      promoId, error: updateErr.message,
    });
  }

  logger.info('promo.service: redemption recorded', { promoId, userId, orderId, discountPaise });
}

/**
 * Admin: List all promo codes (including inactive).
 * @param {{ page?, limit?, activeOnly? }} opts
 */
export async function listPromos({ page = 1, limit = 50, activeOnly = false } = {}) {
  const from = (page - 1) * limit;
  let query = supabaseAdmin
    .from('promo_codes')
    .select('*, promo_redemptions(id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    promos: data.map(p => ({
      ...p,
      redemption_count: p.promo_redemptions?.length || 0,
      promo_redemptions: undefined, // strip raw join
    })),
    total: count,
  };
}

/**
 * Admin: Create a new promo code.
 */
export async function createPromo(payload, createdBy) {
  const { data, error } = await supabaseAdmin
    .from('promo_codes')
    .insert({
      code:                    payload.code.trim().toUpperCase(),
      type:                    payload.type,
      value:                   payload.value,
      min_order_amount_paise:  payload.min_order_amount_paise || 0,
      max_discount_paise:      payload.max_discount_paise || null,
      applicable_tier:         payload.applicable_tier || null,
      usage_limit:             payload.usage_limit || null,
      per_user_limit:          payload.per_user_limit || 1,
      valid_from:              payload.valid_from || new Date().toISOString(),
      valid_until:             payload.valid_until || null,
      is_active:               payload.is_active ?? true,
      shop_id:                 payload.shop_id || null,
      created_by:              createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Admin: Toggle a promo's active status.
 */
export async function togglePromoActive(promoId, isActive) {
  const { data, error } = await supabaseAdmin
    .from('promo_codes')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', promoId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
