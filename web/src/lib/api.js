// ─────────────────────────────────────────────────────────────
// web/src/lib/api.js — Server-side API helpers
// P9-5: TezzNirmaan web storefront
//
// All functions are server-side only (called from async page components
// or generateStaticParams). Never imported in client components.
// ─────────────────────────────────────────────────────────────
const BASE_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Shared fetch with timeout + error handling
async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `API ${res.status}: ${path}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error(`API timeout: ${path}`);
    throw err;
  }
}

// ── Public shop endpoints (P9-5) ─────────────────────────────

/**
 * Fetch shop metadata by slug.
 * Used by generateStaticParams and ISR revalidation.
 * @param {string} slug
 * @returns {Promise<object>} shop data
 */
export async function getShopBySlug(slug) {
  const json = await apiFetch(`/api/v1/public/shops/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 }, // ISR: revalidate every 60 seconds
  });
  return json.data;
}

/**
 * Fetch paginated products for a shop.
 * @param {string} slug
 * @param {{ category?: string, page?: number, limit?: number }} options
 * @returns {Promise<{ products: object[], pagination: object, shop: object }>}
 */
export async function getShopProducts(slug, { category, page = 1, limit = 24 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (category) params.set('category', category);

  const json = await apiFetch(`/api/v1/public/shops/${encodeURIComponent(slug)}/products?${params}`, {
    next: { revalidate: 60 },
  });
  return json.data;
}

/**
 * Fetch all active shop slugs for generateStaticParams.
 * Returns only slugs — no sensitive data.
 * @returns {Promise<string[]>}
 */
export async function getAllShopSlugs() {
  try {
    const json = await apiFetch('/api/v1/public/shops-list', {
      next: { revalidate: 3600 }, // Rebuild slug list once per hour
    });
    return (json.data?.shops || []).map(s => s.slug).filter(Boolean);
  } catch (_) {
    // If the shops list endpoint isn't available, return empty array
    // The site will still work — pages will be generated on-demand (ISR)
    return [];
  }
}

/**
 * Fetch a single product for the product detail page.
 * @param {string} shopSlug
 * @param {string} inventoryId
 * @returns {Promise<object>}
 */
export async function getProduct(shopSlug, inventoryId) {
  const { products } = await getShopProducts(shopSlug, { limit: 48 });
  return products?.find(p => p.inventory_id === inventoryId) || null;
}
