// ────────────────────────────────────────────────────────────
// Search Service — B3 (Corrected Schema)
//
// Schema reality check:
//   shop_inventory.price     = bigint in PAISE
//   shop_inventory.mrp       = bigint in PAISE (nullable)
//   shop_inventory.is_in_stock = generated boolean (stock_quantity > 0)
//   shop_inventory.is_listed = boolean (visible to customer)
//   products.images          = jsonb (array of URLs)
//
// Search strategy:
//   1. ts_query + weighted tsvector (A=name, B=brand, C=category, D=desc)
//   2. ILIKE trigram fallback for partial/short queries
//   3. Unit-size parsing: "50kg" → filter unit='kg', size match
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { cacheGet, cacheSet } from '../config/redis.js'; // B7: Search result caching

// ── Query preprocessing ──────────────────────────────────────

const UNIT_MAP = {
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  litre: 'litre', ltr: 'litre', liter: 'litre', litres: 'litre', l: null,
  bag: 'bag', bags: 'bag',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  meter: 'meter', metre: 'meter', metres: 'meter', meters: 'meter',
  sqft: 'sq_ft', 'sq.ft': 'sq_ft', sft: 'sq_ft',
  cft: 'cft',
  ton: 'ton', tons: 'ton', tonne: 'ton',
  box: 'box', boxes: 'box',
  set: 'set', bundle: 'bundle',
};

/**
 * Parse "50kg" / "10 litre" queries. Extracts unit hint.
 */
function parseUnitQuery(raw) {
  const trimmed = raw.trim();
  const match   = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z.]+)$/);
  if (match) {
    const rawUnit = match[2].toLowerCase();
    const unit    = UNIT_MAP[rawUnit];
    if (unit) return { sizeHint: match[1], unitHint: unit, cleanQuery: match[1] };
  }
  return { sizeHint: null, unitHint: null, cleanQuery: trimmed };
}



// ── Main search ──────────────────────────────────────────────

/**
 * Search products in a shop's inventory.
 *
 * @param {string} query
 * @param {string|null} shopId   - null = search all shops (not recommended for prod)
 * @param {object} filters       - { category, tier, minPrice, maxPrice, inStock }
 * @param {string} sort          - 'relevance'|'price_asc'|'price_desc'|'newest'
 * @param {number} page          - 1-based
 * @param {number} limit
 */
export async function searchProducts(
  query,
  shopId  = null,
  filters = {},
  sort    = 'relevance',
  page    = 1,
  limit   = 20
) {
  const { category, tier, minPrice, maxPrice, inStock } = filters;
  const offset = (page - 1) * limit;

  // B7: Cache key — deterministic hash of all search params
  // 60s TTL: short enough for inventory changes, long enough to absorb
  // users rapidly re-submitting the same search.
  const cacheKey = `search:${shopId}:${query}:${JSON.stringify(filters)}:${sort}:${page}:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through to live query */ }
  }

  const { sizeHint, unitHint, cleanQuery } = parseUnitQuery(query || '');

  let q = supabaseAdmin
    .from('shop_inventory')
    .select(`
      id,
      price,
      mrp,
      stock_quantity,
      is_in_stock,
      is_listed,
      shop_id,
      product_id,
      products!inner(
        id, name, slug, description, images,
        delivery_tier, unit, weight_kg, is_bulk,
        gst_percent, brand_name, category_name,
        categories!category_id(id, name, slug),
        brands!brand_id(id, name)
      )
    `, { count: 'exact' })
    .eq('products.is_active', true)
    .eq('is_listed', true)
    .range(offset, offset + limit - 1);

  // Shop scope
  if (shopId) q = q.eq('shop_id', shopId);

  // In-stock filter — use generated column
  if (inStock === true || inStock === 'true' || inStock === '1') {
    q = q.eq('is_in_stock', true);
  }

  // Price range (paise)
  if (minPrice) q = q.gte('price', Math.round(+minPrice * 100));
  if (maxPrice) q = q.lte('price', Math.round(+maxPrice * 100));

  // Category filter
  if (category) q = q.eq('products.category_id', category);

  // Delivery tier filter
  if (tier) q = q.eq('products.delivery_tier', tier);

  // Unit filter from parsed query
  if (unitHint) q = q.eq('products.unit', unitHint);

  // ── Text search strategy ─────────────────────────────────
  if (cleanQuery.length >= 3) {
    // websearch type: PostgREST converts user query → tsquery automatically
    // Supports partial words, phrases, negation. Safe for user input.
    q = q.textSearch('products.search_vector', cleanQuery, { type: 'websearch', config: 'english' });
  } else if (cleanQuery.length > 0) {
    // Short query (1-2 chars) → ILIKE prefix on name (FTS is ineffective this short)
    q = q.ilike('products.name', `${cleanQuery}%`);
  }


  // ── Sorting ──────────────────────────────────────────────
  switch (sort) {
    case 'price_asc':  q = q.order('price', { ascending: true });  break;
    case 'price_desc': q = q.order('price', { ascending: false }); break;
    case 'newest':     q = q.order('created_at', { referencedTable: 'products', ascending: false }); break;
    default:           q = q.order('updated_at', { ascending: false }); break; // proxy for relevance
  }

  const { data, error, count } = await q;

  if (error) {
    // FTS index not ready yet → fall back to ILIKE
    if (error.message?.includes('search_vector') || error.code === '42703') {
      logger.warn('FTS not available, using ILIKE fallback', { query, error: error.message });
      return ilikeFallback(query, shopId, filters, sort, page, limit);
    }
    logger.error('searchProducts error', { error: error.message, query });
    throw error;
  }

  const results = (data || []).map(row => normaliseRow(row));

  return {
    results,
    total:   count || 0,
    page:    +page,
    hasMore: offset + results.length < (count || 0),
  };
}

// ── Autocomplete suggestions ─────────────────────────────────

/**
 * Return up to `limit` product name suggestions for autocomplete.
 * Priorities: exact prefix first, then contains-match.
 * Target latency: < 50ms (uses b-tree index on name + LIMIT).
 */
export async function getSuggestions(query, shopId = null, limit = 5) {
  if (!query || query.trim().length < 1) return [];
  const q = query.trim();

  // Run prefix + contains in parallel
  const buildBase = () => {
    let base = supabaseAdmin
      .from('products')
      .select('id, name, unit, brand_name, delivery_tier, images')
      .eq('is_active', true);
    return base;
  };

  const [prefix, contains] = await Promise.all([
    buildBase().ilike('name', `${q}%`).limit(limit),
    buildBase().ilike('name', `%${q}%`).not('name', 'ilike', `${q}%`).limit(limit),
  ]);

  const seen  = new Set();
  const items = [];
  for (const row of [...(prefix.data || []), ...(contains.data || [])]) {
    if (seen.has(row.id) || items.length >= limit) continue;
    seen.add(row.id);
    items.push({
      id:           row.id,
      name:         row.name,
      unit:         row.unit,
      brand:        row.brand_name || null,
      deliveryTier: row.delivery_tier,
      thumbnail:    Array.isArray(row.images) ? row.images[0] : (row.images?.[0] || null),
    });
  }
  return items;
}

// ── Popular categories (empty state fallback) ────────────────

export async function getPopularCategories(limit = 8) {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id, name, slug, icon_url')
    .eq('is_active', true)
    .is('parent_id', null)
    .order('sort_order', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── Helpers ──────────────────────────────────────────────────

function normaliseRow(row) {
  const p = row.products || {};
  return {
    inventoryId:  row.id,
    shopId:       row.shop_id,
    price:        row.price,       // paise
    mrp:          row.mrp,         // paise, may be null
    stockQty:     row.stock_quantity,
    isInStock:    row.is_in_stock,
    isListed:     row.is_listed,
    productId:    p.id,
    name:         p.name,
    slug:         p.slug,
    description:  p.description,
    images:       Array.isArray(p.images) ? p.images : [],
    thumbnail:    Array.isArray(p.images) ? p.images[0] : null,
    deliveryTier: p.delivery_tier,
    unit:         p.unit,
    weightKg:     p.weight_kg,
    isBulk:       p.is_bulk,
    gstPercent:   p.gst_percent,
    brandName:    p.brand_name || p.brands?.name || null,
    categoryName: p.category_name || p.categories?.name || null,
    categoryId:   p.categories?.id || null,
    categorySlug: p.categories?.slug || null,
  };
}

async function ilikeFallback(query, shopId, filters, sort, page, limit) {
  const { category, tier, minPrice, maxPrice, inStock } = filters;
  const offset = (page - 1) * limit;
  let q = supabaseAdmin
    .from('shop_inventory')
    .select(`
      id, price, mrp, stock_quantity, is_in_stock, is_listed, shop_id, product_id,
      products!inner(
        id, name, slug, description, images, delivery_tier, unit, weight_kg,
        is_bulk, gst_percent, brand_name, category_name,
        categories!category_id(id, name, slug), brands!brand_id(id, name)
      )
    `, { count: 'exact' })
    .ilike('products.name', `%${query}%`)
    .eq('products.is_active', true)
    .eq('is_listed', true)
    .range(offset, offset + limit - 1);

  if (shopId)  q = q.eq('shop_id', shopId);
  if (inStock) q = q.eq('is_in_stock', true);
  if (minPrice) q = q.gte('price', Math.round(+minPrice * 100));
  if (maxPrice) q = q.lte('price', Math.round(+maxPrice * 100));
  if (category) q = q.eq('products.category_id', category);
  if (tier)     q = q.eq('products.delivery_tier', tier);
  q = q.order('updated_at', { ascending: false });

  const { data, error, count } = await q;
  if (error) throw error;
  const results = (data || []).map(normaliseRow);
  const result  = { results, total: count || 0, page: +page, hasMore: offset + results.length < (count || 0) };

  // B7: Cache result for 60 seconds (TTL is intentionally short — inventory changes frequently)
  await cacheSet(cacheKey, result, 60);

  return result;
}

