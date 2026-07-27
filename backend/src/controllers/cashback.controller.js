// ────────────────────────────────────────────────────────────
// Cashback Controller — P4-2B
//
// Admin-only endpoints for cashback rule management.
// All routes require platform_admin role (enforced in admin.routes.js).
//
// Routes:
//   GET    /admin/cashback/rules          — list all rules
//   POST   /admin/cashback/rules          — create rule
//   PATCH  /admin/cashback/rules/:ruleId  — update rule (%, active, expiry)
//   DELETE /admin/cashback/rules/:ruleId  — soft-delete (set is_active=false)
//
// Also exposes:
//   GET  /admin/cashback/preview?amount=<paise>&shop_id=<uuid>
//      — preview cashback for a given order amount (for admin testing)
// ────────────────────────────────────────────────────────────
import {
  listRules,
  createRule,
  updateRule,
  calculateCashback,
  invalidateCashbackCache,
} from '../services/cashback.service.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/** GET /admin/cashback/rules */
export async function getCashbackRules(req, res, next) {
  try {
    const rules = await listRules();
    res.json({ success: true, data: { rules } });
  } catch (err) {
    next(err);
  }
}

/** POST /admin/cashback/rules */
export async function createCashbackRule(req, res, next) {
  try {
    const { min_order_paise, max_order_paise, cashback_percent, shop_id, valid_until } = req.body;

    if (cashback_percent == null) throw new ValidationError('cashback_percent is required');
    if (isNaN(Number(cashback_percent)) || Number(cashback_percent) < 0 || Number(cashback_percent) > 100) {
      throw new ValidationError('cashback_percent must be between 0 and 100');
    }

    const rule = await createRule(
      { min_order_paise, max_order_paise, cashback_percent, shop_id, valid_until },
      req.user.id,
    );

    logger.info('admin: cashback rule created', { ruleId: rule.id, adminId: req.user.id });
    res.status(201).json({ success: true, data: { rule } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /admin/cashback/rules/:ruleId */
export async function updateCashbackRule(req, res, next) {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    if (updates.cashback_percent != null) {
      const pct = Number(updates.cashback_percent);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        throw new ValidationError('cashback_percent must be between 0 and 100');
      }
    }

    const rule = await updateRule(ruleId, updates);
    logger.info('admin: cashback rule updated', { ruleId, adminId: req.user.id, updates });
    res.json({ success: true, data: { rule } });
  } catch (err) {
    next(err);
  }
}

/** DELETE /admin/cashback/rules/:ruleId — soft delete (is_active = false) */
export async function deleteCashbackRule(req, res, next) {
  try {
    const { ruleId } = req.params;
    const rule = await updateRule(ruleId, { is_active: false });
    logger.info('admin: cashback rule deactivated', { ruleId, adminId: req.user.id });
    res.json({ success: true, data: { rule } });
  } catch (err) {
    next(err);
  }
}

/** GET /admin/cashback/preview?amount=150000&shop_id=... */
export async function previewCashback(req, res, next) {
  try {
    const amount = parseInt(req.query.amount, 10);
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new ValidationError('amount query param must be a positive integer (paise)');
    }
    const shopId = req.query.shop_id || null;

    const result = await calculateCashback(amount, shopId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /admin/cashback/cache/invalidate — force-refresh the in-memory rule cache */
export async function invalidateCache(req, res, next) {
  try {
    invalidateCashbackCache();
    res.json({ success: true, data: { message: 'Cashback rule cache invalidated' } });
  } catch (err) {
    next(err);
  }
}
