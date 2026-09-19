// ─────────────────────────────────────────────────────────────────────────────
// Catalog Service — P10-1
//
// Production-quality city-scoped catalog for the public storefront.
// Replaces the inline Supabase query in public.routes.js.
//
// Key features:
//   1. Materialized view fast path — queries city_catalog MV (~30ms)
//      with transparent fallback to live 4-table join if MV not yet created.
//   2. Product deduplication — same product from multiple shops shows once;
//      the cheapest in-stock option wins.
//   3. Geo-aware shop ranking — when lat/lng are provided, nearby shops
//      (via find_nearby_shops PostGIS RPC) are preferred over distant ones.
//   4. Consistent product shape — mapToProductShape() matches what ProductCard
//      and the frontend pages expect.
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError }      from '../utils/errors.js';
import logger            from '../utils/logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_SORTS = new Set(['popular', 'price_asc', 'price_desc', 'newest']);

// Fetch extra rows to absorb duplicates before JS dedup reduces the set.
// e.g. if limit=24 and worst-case every product has 3 shops, fetch 72 rows.
// In practice 2× is enough — most products appear in 1–2 shops.
const DEDUP_OVERSCAN = 2;

// ── City Resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a city slug/name to a cities row.
 * Uses ilike so 'patna', 'Patna', 'patna city' all match.
 * Returns null if not found or inactive.
 *
 * @param {string} citySlug — URL slug, e.g. 'muzaffarpur' or 'west-patna'
 * @returns {object|null}
 */
export async function getCityBySlug(citySlug) {
  const nameQuery = citySlug.replace(/-/g, ' ');

  const { data, error } = await supabaseAdmin
    .from('cities')
    .select('id, name, state, center_lat, center_lng, delivery_radius_km, is_active')
    .ilike('name', `%${nameQuery}%`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ── Product Shape ─────────────────────────────────────────────────────────────

/**
 * Map a raw catalog row (from MV or live join) to the ProductCard-compatible shape.
 * Handles both MV flat columns and live-join nested objects.
 *
 * @param {object} item
 * @returns {object}
 */
export function mapToProductShape(item) {
  // MV path: flat columns (product_name, shop_slug, etc.)
  // Live join path: nested objects (item.products.name, item.shops.slug, etc.)
  const isMVRow = 'product_name' in item;

  return {
    inventory_id:     item.inventory_id ?? item.id,
    product_id:       isMVRow ? item.product_id       : item.products?.id,
    name:             isMVRow ? item.product_name      : item.products?.name,
    description:      isMVRow ? item.product_description : item.products?.description,
    category:         isMVRow ? item.product_category  : item.products?.category,
    image_url:        isMVRow ? item.product_image_url : (item.products?.image_url || item.products?.primary_image_url),
    brand:            isMVRow ? item.product_brand     : item.products?.brand,
    delivery_tier:    isMVRow ? item.delivery_tier     : item.products?.delivery_tier,
    price:            item.price,
    discounted_price: item.discounted_price ?? null,
    price_paise:      item.price,  // legacy alias — ProductCard supports both
    unit:             isMVRow ? (item.inv_unit || item.product_unit) : (item.unit || item.products?.unit),
    in_stock:         isMVRow ? (item.stock_count > 0) : (item.stock_count > 0),
    shop: {
      id:   isMVRow ? item.shop_id   : item.shops?.id,
      name: isMVRow ? item.shop_name : item.shops?.name,
      slug: isMVRow ? item.shop_slug : item.shops?.slug,
    },
  };
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplicate raw catalog rows by product_id, keeping the cheapest option.
 * When prices are equal, prefer the item that appeared first (shop ranking).
 *
 * @param {Array} rows — raw rows from MV or live join
 * @returns {Array} — one entry per unique product_id
 */
export function deduplicateByProduct(rows) {
  const byProduct = new Map();

  for (const item of rows) {
    const productId = 'product_id' in item ? item.product_id : item.products?.id;
    if (!productId) continue;

    if (!byProduct.has(productId)) {
      byProduct.set(productId, item);
    } else {
      const existing = byProduct.get(productId);
      // Keep the cheaper option (lower price wins)
      if (item.price < existing.price) {
        byProduct.set(productId, item);
      }
    }
  }

  return Array.from(byProduct.values());
}

// ── Materialized View Query (fast path) ───────────────────────────────────────

/**
 * Query the city_catalog materialized view.
 * Returns null if the view doesn't exist yet (migration not run).
 *
 * @param {object} params
 * @returns {object|null} — { rows, count } or null on MV-missing error
 */
async function queryMaterializedView({ cityId, category, q, sort, page, limit }) {
  const offset     = (page - 1) * limit;
  const fetchLimit = limit * DEDUP_OVERSCAN; // overscan for dedup

  let query = supabaseAdmin
    .from('city_catalog')
    .select('*', { count: 'exact' })
    .eq('city_id', cityId);

  if (category) {
    query = query.ilike('product_category', `%${category}%`);
  }
  if (q) {
    query = query.ilike('product_name', `%${q}%`);
  }

  if (sort === 'price_asc') {
    query = query.order('price', { ascending: true });
  } else if (sort === 'price_desc') {
    query = query.order('price', { ascending: false });
  } else {
    // popular / newest — most recently listed first
    query = query.order('listed_at', { ascending: false });
  }

  query = query.range(offset, offset + fetchLimit - 1);

  const { data, count, error } = await query;

  // If MV doesn't exist, error.code will be '42P01' (undefined_table)
  if (error) {
    if (error.code === '42P01' || /city_catalog/.test(error.message)) {
      logger.warn('city_catalog MV not found — falling back to live join');
      return null;
    }
    throw error;
  }

  return { rows: data || [], count: count || 0 };
}

// ── Live Join Query (fallback) ────────────────────────────────────────────────

/**
 * Fallback: 4-table join on the live inventory table.
 * Used when city_catalog MV hasn't been created yet.
 * Matches the query shape from P10-0.
 *
 * DEPRECATED: uses `inventory` VIEW (remapped columns: stock_count, is_active).
 * New code should use `shop_inventory` with original columns (stock_quantity, is_listed).
 *
 * @param {object} params
 * @returns {{ rows: Array, count: number }}
 */
async function queryLiveInventory({ shopIds, category, q, sort, page, limit }) {
  const offset     = (page - 1) * limit;
  const fetchLimit = limit * DEDUP_OVERSCAN;

  let query = supabaseAdmin
    .from('inventory')
    .select(`
      id,
      price,
      discounted_price,
      stock_count,
      unit,
      shop_id,
      created_at,
      shops!inner ( id, name, slug ),
      products!inner (
        id, name, brand, category,
        description, image_url, primary_image_url,
        delivery_tier, unit, reminder_days
      )
    `, { count: 'exact' })
    .in('shop_id', shopIds)
    .eq('is_active', true)
    .gt('stock_count', 0);

  if (category) {
    query = query.ilike('products.category', `%${category}%`);
  }
  if (q) {
    query = query.ilike('products.name', `%${q}%`);
  }

  if (sort === 'price_asc') {
    query = query.order('price', { ascending: true });
  } else if (sort === 'price_desc') {
    query = query.order('price', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + fetchLimit - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  // Rename to match MV row shape so mapToProductShape works for both
  return {
    rows:  (data || []).map(item => ({ ...item, inventory_id: item.id })),
    count: count || 0,
  };
}

// ── Geo-aware Shop Filter ─────────────────────────────────────────────────────

/**
 * When the user's lat/lng is known, fetch shops near them and return their IDs
 * sorted by distance (nearest first). Used to prefer nearby shop inventory.
 *
 * Uses the existing find_nearby_shops PostGIS RPC (migration 011).
 * Param names: customer_lat / customer_lng (as defined in the DB function).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} cityId — filter results to this city
 * @returns {string[]} — shop IDs sorted nearest-first, filtered to the city
 */
async function getNearbyShopIds(lat, lng, cityId) {
  const { data, error } = await supabaseAdmin.rpc('find_nearby_shops', {
    customer_lat: parseFloat(lat),
    customer_lng: parseFloat(lng),
  });

  if (error) {
    // Non-fatal — if geo lookup fails, fall back to no geo preference
    logger.warn('getCityCatalog: find_nearby_shops RPC failed', { error: error.message });
    return null;
  }

  // Filter to the requested city only (the RPC returns all cities)
  const nearbyInCity = (data || []).filter(s => s.city_id === cityId);

  // Return shop IDs in distance-ascending order (nearest first)
  return nearbyInCity
    .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
    .map(s => s.id);
}

// ── Main: getCityCatalog ──────────────────────────────────────────────────────

/**
 * Get the paginated, deduplicated city catalog.
 *
 * @param {object} params
 * @param {string}  params.citySlug  — e.g. 'patna', 'muzaffarpur'
 * @param {string}  [params.category] — filter by product category
 * @param {string}  [params.q]        — free-text search
 * @param {string}  [params.sort]     — 'popular'|'price_asc'|'price_desc'|'newest'
 * @param {number}  [params.page]     — 1-indexed
 * @param {number}  [params.limit]    — items per page (capped at 48)
 * @param {number}  [params.lat]      — customer latitude (optional)
 * @param {number}  [params.lng]      — customer longitude (optional)
 * @returns {object} — { products, city, total, page, hasMore }
 */
export async function getCityCatalog({
  citySlug,
  category = null,
  q        = null,
  sort     = 'popular',
  page     = 1,
  limit    = 20,
  lat      = null,
  lng      = null,
}) {
  // ── Input normalisation ──────────────────────────────────────────────────
  const safeSort  = VALID_SORTS.has(sort) ? sort : 'popular';
  const safePage  = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(48, Math.max(1, parseInt(limit, 10) || 20));
  const safeCity  = (citySlug || 'patna').trim().toLowerCase();

  // ── 1. Resolve city ───────────────────────────────────────────────────────
  const city = await getCityBySlug(safeCity);
  if (!city) {
    throw new AppError('City not found or not available', 404, 'CITY_NOT_FOUND');
  }

  // ── 2. Resolve shops (geo-aware or plain city filter) ─────────────────────
  let shopIds = null; // null = "all shops in city" (MV path handles this via city_id)

  if (lat && lng) {
    // Geo path: get nearby shop IDs sorted by proximity
    const nearbyIds = await getNearbyShopIds(lat, lng, city.id);
    if (nearbyIds && nearbyIds.length > 0) {
      shopIds = nearbyIds;
    }
    // If geo lookup returns nothing, fall through to full city catalog
  }

  // ── 3. Query catalog (MV fast path → live join fallback) ──────────────────
  let rawResult;

  if (shopIds) {
    // Geo path: must use live join because MV doesn't support shop_id ordering
    rawResult = await queryLiveInventory({
      shopIds,
      category: category?.trim() || null,
      q: q?.trim() || null,
      sort: safeSort,
      page: safePage,
      limit: safeLimit,
    });
  } else {
    // Standard path: try MV first, fallback to live join
    const mvResult = await queryMaterializedView({
      cityId: city.id,
      category: category?.trim() || null,
      q: q?.trim() || null,
      sort: safeSort,
      page: safePage,
      limit: safeLimit,
    });

    if (mvResult) {
      rawResult = mvResult;
    } else {
      // MV not available — fetch all shop IDs for this city and use live join
      const { data: shops, error: shopErr } = await supabaseAdmin
        .from('shops')
        .select('id')
        .eq('city_id', city.id)
        .eq('is_active', true);

      if (shopErr) throw shopErr;

      const allShopIds = (shops || []).map(s => s.id);
      if (allShopIds.length === 0) {
        return { products: [], city: { name: city.name, slug: safeCity }, total: 0, page: safePage, hasMore: false };
      }

      rawResult = await queryLiveInventory({
        shopIds: allShopIds,
        category: category?.trim() || null,
        q: q?.trim() || null,
        sort: safeSort,
        page: safePage,
        limit: safeLimit,
      });
    }
  }

  // ── 4. Deduplicate by product (cheapest option wins) ──────────────────────
  const deduped = deduplicateByProduct(rawResult.rows);

  // Trim to requested page size after dedup
  const products = deduped.slice(0, safeLimit).map(mapToProductShape);

  // ── 5. Return clean response ───────────────────────────────────────────────
  const offset = (safePage - 1) * safeLimit;
  return {
    products,
    city: {
      id:   city.id,
      name: city.name,
      slug: safeCity,
    },
    total:   rawResult.count,
    page:    safePage,
    limit:   safeLimit,
    hasMore: rawResult.count > offset + products.length,
  };
}

// ── getProductById ────────────────────────────────────────────────────────────

/**
 * Fetch a single product by product_id — cheapest active inventory entry wins.
 * Used by the product detail page.
 *
 * DEPRECATED: uses `inventory` VIEW (remapped columns). See migration 081 notes.
 *
 * @param {string} productId
 * @returns {object} — ProductCard-compatible shape with shop info
 */
export async function getProductById(productId) {
  const { data: rows, error } = await supabaseAdmin
    .from('inventory')
    .select(`
      id,
      price,
      discounted_price,
      stock_count,
      unit,
      shop_id,
      shops!inner ( id, name, slug, city_id ),
      products!inner (
        id, name, brand, category,
        description, image_url, primary_image_url,
        delivery_tier, unit, reminder_days, specifications
      )
    `)
    .eq('products.id', productId)
    .eq('is_active', true)
    .gt('stock_count', 0)
    .order('price', { ascending: true }) // cheapest first
    .limit(1);

  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  const item = rows[0];
  return {
    inventory_id:     item.id,
    product_id:       item.products?.id,
    name:             item.products?.name,
    brand:            item.products?.brand,
    category:         item.products?.category,
    description:      item.products?.description,
    image_url:        item.products?.image_url || item.products?.primary_image_url,
    delivery_tier:    item.products?.delivery_tier,
    unit:             item.unit || item.products?.unit,
    specifications:   item.products?.specifications,
    price:            item.price,
    discounted_price: item.discounted_price,
    stock_count:      item.stock_count,
    shop: {
      id:   item.shops?.id,
      name: item.shops?.name,
      slug: item.shops?.slug,
    },
  };
}
