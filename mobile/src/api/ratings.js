// ────────────────────────────────────────────────────────────
// Rating API — mobile (B4)
// ────────────────────────────────────────────────────────────
import client from './client';

/**
 * Submit a rating for a delivered order.
 * @param {string} orderId
 * @param {{ deliveryRating?: number, productRating?: number, reviewText?: string }} payload
 */
export async function rateOrder(orderId, { deliveryRating, productRating, reviewText }) {
  return client.post(`/orders/${orderId}/rate`, {
    delivery_rating: deliveryRating ?? null,
    product_rating:  productRating  ?? null,
    review_text:     reviewText      ?? null,
  });
}

/**
 * Check if the current user has already rated an order.
 * @returns {{ hasRated: boolean }}
 */
export async function getRatingStatus(orderId) {
  return client.get(`/orders/${orderId}/rating-status`);
}

/**
 * Get paginated ratings for a shop (public).
 */
export async function getShopRatings(shopId, { page = 1, limit = 20 } = {}) {
  return client.get(`/shops/${shopId}/ratings`, { params: { page, limit } });
}

/**
 * Get the materialized rating summary for a shop (public).
 * Used by ProductDetailScreen and product cards.
 */
export async function getShopRatingSummary(shopId) {
  return client.get(`/shops/${shopId}/ratings/summary`);
}
