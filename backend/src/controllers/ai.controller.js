// ────────────────────────────────────────────────────────────
// AI Controller — P5-2
//
// Thin HTTP layer over ai.service.js. Three endpoints:
//   GET  /customer/recommendations      → personalised product recs
//   GET  /shop/demand-forecast          → stock forecast for shop owner
//   POST /customer/search/ai            → NL search intent parsing
// ────────────────────────────────────────────────────────────
import * as aiService from '../services/ai.service.js';
import logger         from '../utils/logger.js';

// ── GET /customer/recommendations ─────────────────────────────
// Query params: shop_id (required), cart_items (optional JSON array of {id,name})
// Auth: required (customer)
export async function getRecommendations(req, res, next) {
  try {
    const userId  = req.user.id;
    const shopId  = req.query.shop_id;

    if (!shopId) {
      return res.status(400).json({ success: false, message: 'shop_id is required' });
    }

    // cart_items is optional — passed as JSON string in query
    let cartItems = [];
    if (req.query.cart_items) {
      try { cartItems = JSON.parse(req.query.cart_items); } catch { cartItems = []; }
    }

    const recommendations = await aiService.getPersonalizedRecommendations(userId, shopId, cartItems);
    res.json({ success: true, data: { recommendations } });
  } catch (err) {
    next(err);
  }
}

// ── GET /shop/demand-forecast ─────────────────────────────────
// Query params: days (default 7)
// Auth: shop_owner via requireShopAccess (req.shopId set by middleware)
export async function getDemandForecast(req, res, next) {
  try {
    const shopId   = req.shopId;
    const daysAhead = Math.min(parseInt(req.query.days || '7', 10), 30);

    const forecast = await aiService.getDemandForecast(shopId, daysAhead);
    res.json({ success: true, data: { forecast } });
  } catch (err) {
    next(err);
  }
}

// ── POST /customer/search/ai ──────────────────────────────────
// Body: { query: string, shop_id?: string }
// Auth: public (no auth required — search is public)
export async function aiSearch(req, res, next) {
  try {
    const { query, shop_id } = req.body;

    if (!query?.trim()) {
      return res.status(400).json({ success: false, message: 'query is required' });
    }

    const parsed = await aiService.parseNaturalLanguageSearch(query.trim(), shop_id || null);
    res.json({ success: true, data: { parsed } });
  } catch (err) {
    next(err);
  }
}
