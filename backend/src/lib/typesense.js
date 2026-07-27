// ────────────────────────────────────────────────────────────
// Typesense Client — P6-5
//
// Lazy-initialised: when TYPESENSE_HOST is absent (local dev without
// a Typesense server), all methods return gracefully so the rest of
// the app keeps working. Every call site already has a try/catch.
// ────────────────────────────────────────────────────────────
import Typesense from 'typesense';
import logger from '../utils/logger.js';

// ── Schema ────────────────────────────────────────────────────
// One document per shop_inventory row (not per product), so that
// per-shop price, stock, and listing status can differ.
export const PRODUCTS_SCHEMA = {
  name: 'products',
  fields: [
    // Identity
    { name: 'id',               type: 'string' },        // shop_inventory.id
    { name: 'product_id',       type: 'string' },
    { name: 'shop_id',          type: 'string',  facet: true },
    { name: 'city_id',          type: 'string',  facet: true, optional: true },
    // Searchable text
    { name: 'name',             type: 'string' },
    { name: 'brand_name',       type: 'string',  optional: true },
    { name: 'category_name',    type: 'string',  facet: true, optional: true },
    { name: 'description',      type: 'string',  optional: true, index: false }, // stored not indexed for perf
    { name: 'search_text',      type: 'string' },        // combined bag-of-words for recall
    // Structured
    { name: 'delivery_tier',    type: 'string',  facet: true, optional: true },
    { name: 'unit',             type: 'string',  optional: true },
    { name: 'shop_name',        type: 'string',  optional: true },
    // Numerics (filterable)
    { name: 'price',            type: 'int32' },          // paise (matches shop_inventory.price)
    { name: 'mrp',              type: 'int32',   optional: true },
    { name: 'stock_quantity',   type: 'int32' },
    // Booleans (filterable)
    { name: 'is_listed',        type: 'bool' },
    { name: 'is_in_stock',      type: 'bool' },
  ],
  default_sorting_field: 'price',
};

// ── Client factory ─────────────────────────────────────────────

let _client = null;

function getClient() {
  if (_client) return _client;

  const host   = process.env.TYPESENSE_HOST;
  const apiKey = process.env.TYPESENSE_ADMIN_API_KEY;

  if (!host || !apiKey) {
    logger.warn('typesense: TYPESENSE_HOST or TYPESENSE_ADMIN_API_KEY not set — Typesense disabled');
    return null;
  }

  _client = new Typesense.Client({
    nodes: [{
      host,
      port:     443,
      protocol: 'https',
    }],
    apiKey,
    connectionTimeoutSeconds: 5,
    retryIntervalSeconds:     0.1,
    numRetries:               2,
  });

  return _client;
}

// Export a Proxy so callers can always call typesenseClient.xyz()
// — if Typesense is not configured it returns a no-op that resolves null.
export const typesenseClient = new Proxy({}, {
  get(_, prop) {
    const client = getClient();
    if (!client) {
      // Return a function that always resolves null so callers don't crash
      return () => Promise.resolve(null);
    }
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

// ── Enabled check ─────────────────────────────────────────────

export function isTypesenseEnabled() {
  return !!(process.env.TYPESENSE_HOST && process.env.TYPESENSE_ADMIN_API_KEY);
}

// ── Sync helpers (called from inventory.service) ───────────────

/**
 * Upsert a single shop_inventory row into Typesense.
 * Pass the full row with products + shops relations.
 * Non-fatal — never throws, only logs warnings.
 *
 * @param {object} item  — shop_inventory row with .products and .shops joined
 */
export async function syncInventoryItem(item) {
  if (!isTypesenseEnabled()) return;
  try {
    const p = item.products || {};
    const s = item.shops    || {};

    const doc = {
      id:            item.id,
      product_id:    p.id            || '',
      shop_id:       item.shop_id,
      city_id:       s.city_id       || '',
      name:          p.name          || '',
      brand_name:    p.brand_name    || '',
      category_name: p.category_name || '',
      description:   p.description   || '',
      search_text:   [p.name, p.brand_name, p.category_name, p.description]
                       .filter(Boolean).join(' '),
      delivery_tier: p.delivery_tier || '',
      unit:          p.unit          || '',
      shop_name:     s.name          || '',
      price:         item.price      || 0,
      mrp:           item.mrp        || 0,
      stock_quantity: item.stock_quantity || 0,
      is_listed:     Boolean(item.is_listed),
      is_in_stock:   Boolean(item.is_in_stock),
    };

    await typesenseClient.collections('products').documents().upsert(doc);
  } catch (err) {
    logger.warn('typesense.syncInventoryItem: failed (non-fatal)', { id: item.id, error: err.message });
  }
}

/**
 * Remove a shop_inventory row from Typesense.
 * Non-fatal — never throws.
 *
 * @param {string} inventoryId — shop_inventory.id
 */
export async function deleteInventoryItem(inventoryId) {
  if (!isTypesenseEnabled()) return;
  try {
    await typesenseClient.collections('products').documents(inventoryId).delete();
  } catch (err) {
    // 404 is fine — item may not have been indexed yet
    if (!err.message?.includes('Not Found') && !err.message?.includes('404')) {
      logger.warn('typesense.deleteInventoryItem: failed (non-fatal)', { inventoryId, error: err.message });
    }
  }
}

