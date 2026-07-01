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
