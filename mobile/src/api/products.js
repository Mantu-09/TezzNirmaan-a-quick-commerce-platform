import client from './client';

// ── Shops ─────────────────────────────────────────────────────

export async function getNearbyShops(lat, lng) {
  return client.get('/shops/nearby', { params: { lat, lng } });
}

export async function getShop(shopId) {
  return client.get(`/shops/${shopId}`);
}

// ── Categories ───────────────────────────────────────────────

export async function getCategories() {
  return client.get('/categories');
}

// ── Products ─────────────────────────────────────────────────

/**
 * @param {string} shopId
 * @param {{ category?, search?, tier?, page?, limit? }} filters
 */
export async function getProducts(shopId, filters = {}) {
  return client.get(`/shops/${shopId}/products`, { params: filters });
}

export async function getProduct(shopId, productId) {
  return client.get(`/shops/${shopId}/products/${productId}`);
}

// ── Search (B3) ───────────────────────────────────────────────

/**
 * Full-text product search.
 * @param {{ q, shopId?, category?, tier?, min_price?, max_price?, in_stock?, sort?, page?, limit? }} params
 * @returns {{ results, total, page, hasMore }}
 */
export async function searchProducts(params = {}) {
  return client.get('/search', { params });
}

/**
 * Autocomplete suggestions (target < 50ms).
 * @param {string} q
 * @param {string} [shopId]
 * @returns {{ suggestions: [{ id, name, unit, brand, deliveryTier, thumbnail }] }}
 */
export async function getSearchSuggestions(q, shopId = null) {
  return client.get('/search/suggestions', { params: { q, shopId } });
}
