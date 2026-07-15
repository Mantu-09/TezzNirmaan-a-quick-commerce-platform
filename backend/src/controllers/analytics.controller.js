// ────────────────────────────────────────────────────────────
// Analytics Controller — B5
// ────────────────────────────────────────────────────────────
import * as analyticsService from '../services/analytics.service.js';

/**
 * GET /shop/analytics?period=today|7d|30d
 * Requires shop_owner or shop_staff (via shopAccess middleware).
 * req.shopId injected by requireShopAccess.
 */
export async function getShopAnalytics(req, res, next) {
  try {
    const { period = '7d' } = req.query;

    if (!['today', '7d', '30d'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "period must be 'today', '7d', or '30d'",
      });
    }

    const data = await analyticsService.getShopAnalytics(req.shopId, { period });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
