// ────────────────────────────────────────────────────────────
// Rating Controller — B4
// ────────────────────────────────────────────────────────────
import * as ratingService from '../services/rating.service.js';

// ── Customer endpoints ────────────────────────────────────────

/** POST /customer/orders/:orderId/rate */
export async function rateOrder(req, res, next) {
  try {
    const { orderId }                               = req.params;
    const { delivery_rating, product_rating, review_text } = req.body;
    const customerId = req.user.id;   // set by authenticate middleware

    const result = await ratingService.rateOrder(orderId, customerId, {
      deliveryRating: delivery_rating != null ? +delivery_rating : null,
      productRating:  product_rating  != null ? +product_rating  : null,
      reviewText:     review_text,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/orders/:orderId/rating-status */
export async function getRatingStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const hasRated    = await ratingService.hasRatedOrder(orderId, req.user.id);
    res.json({ success: true, data: { hasRated } });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/shops/:shopId/ratings?page=&limit= (public — no auth) */
export async function getShopRatings(req, res, next) {
  try {
    const { shopId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const result = await ratingService.getShopRatings(shopId, {
      page:  +page,
      limit: Math.min(+limit, 50),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/shops/:shopId/ratings/summary (public — no auth) */
export async function getShopRatingSummary(req, res, next) {
  try {
    const { shopId } = req.params;
    const summary    = await ratingService.getShopRatingSummary(shopId);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    next(err);
  }
}

// ── Shop-owner endpoints (shop dashboard) ────────────────────

/** GET /shop/ratings?page=&limit= */
export async function getMyShopRatings(req, res, next) {
  try {
    const shopId = req.shopId;   // injected by shop auth middleware
    const { page = 1, limit = 20 } = req.query;
    const result = await ratingService.getShopRatings(shopId, {
      page:  +page,
      limit: Math.min(+limit, 50),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /shop/ratings/summary */
export async function getMyShopRatingSummary(req, res, next) {
  try {
    const summary = await ratingService.getShopRatingSummary(req.shopId);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /shop/ratings/:ratingId/flag */
export async function flagShopRating(req, res, next) {
  try {
    const { ratingId } = req.params;
    const { flagged = true } = req.body;
    const result = await ratingService.flagRating(ratingId, req.shopId, !!flagged);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
