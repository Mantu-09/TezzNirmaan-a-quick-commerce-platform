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

// ── AI Features (P5-2) ───────────────────────────────────────

/**
 * Personalised product recommendations for the logged-in user.
 * @param {string} shopId
 * @param {Array}  cartItems  [{ id, name }]
 * @returns {{ recommendations: Array }}
 */
export async function getRecommendations(shopId, cartItems = []) {
  const cartParam = cartItems.length
    ? JSON.stringify(cartItems.map(i => ({ id: i.inventoryId || i.id, name: i.name })))
    : undefined;
  return client.get('/recommendations', {
    params: { shop_id: shopId, ...(cartParam ? { cart_items: cartParam } : {}) },
  });
}

/**
 * Parse a natural-language / Hinglish query via Claude.
 * Returns { parsed: { search_terms, category, delivery_tier, interpreted_as, ... } }
 * @param {string} query
 * @param {string} [shopId]
 */
export async function aiSearchParse(query, shopId = null) {
  return client.post('/search/ai', { query, shop_id: shopId });
}

/**
 * Fetch active promotional banners for the home screen carousel.
 * Public endpoint — no auth required.
 * @param {string} [citySlug] — e.g. 'patna'. Pass undefined for global banners.
 * @returns {{ id, title, subtitle, image_url, link_url, cta_text, bg_color, display_order }[]}
 */
export async function fetchBanners(citySlug) {
  return client.get('/public/banners', {
    params: citySlug ? { city: citySlug } : {},
  });
}

/**
 * Fetch currently active flash sales for the home screen deals section.
 * Public endpoint — no auth required. Sorted by ends_at ascending.
 * @param {string} [citySlug] — e.g. 'patna'. Pass undefined for global deals.
 * @returns {{ flash_sales: { id, title, discount_pct, max_discount_paise, starts_at, ends_at, product_ids, category }[] }}
 */
export async function fetchFlashSales(citySlug) {
  return client.get('/public/flash-sales', {
    params: citySlug ? { city: citySlug } : {},
  });
}
