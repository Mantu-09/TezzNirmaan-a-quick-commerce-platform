// ────────────────────────────────────────────────────────────
// Promo Controller — P1-C
//
// Customer: POST /promos/validate
// Admin:    GET/POST/PATCH /admin/promos
// ────────────────────────────────────────────────────────────
import * as promoService from '../services/promo.service.js';

// ── Customer ────────────────────────────────────────────────

/**
 * POST /customer/promos/validate
 * Body: { code, order_amount_paise, tier? }
 * Returns: { valid, discount_paise, message }
 */
export async function validatePromo(req, res, next) {
  try {
    const userId = req.user.id;
    const { code, order_amount_paise, tier } = req.body;
    const result = await promoService.validatePromo(code, userId, order_amount_paise, tier || null);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Admin ────────────────────────────────────────────────────

/**
 * GET /admin/promos
 * Returns paginated list of all promo codes with redemption counts.
 */
export async function listPromos(req, res, next) {
  try {
    const { page = 1, limit = 50, active_only } = req.query;
    const result = await promoService.listPromos({
      page:       +page,
      limit:      +limit,
      activeOnly: active_only === 'true',
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/promos
 * Create a new promo code.
 */
export async function createPromo(req, res, next) {
  try {
    const createdBy = req.user.id;
    const promo = await promoService.createPromo(req.body, createdBy);
    res.status(201).json({ success: true, data: { promo } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /admin/promos/:promoId/toggle
 * Toggle active/inactive for a promo code.
 */
export async function togglePromo(req, res, next) {
  try {
    const { promoId } = req.params;
    const { is_active } = req.body;
    const promo = await promoService.togglePromoActive(promoId, is_active);
    res.json({ success: true, data: { promo } });
  } catch (err) {
    next(err);
  }
}
