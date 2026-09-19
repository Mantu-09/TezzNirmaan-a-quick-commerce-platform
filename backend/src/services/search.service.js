// ────────────────────────────────────────────────────────────
// Search Service — P6-5 (Typesense upgrade)
//
// Strategy:
//   1. If Typesense is configured AND available → use it (sub-50ms, typo-tolerant)
//   2. If Typesense is unavailable (outage / not configured) → fall back to
//      the existing PostgreSQL FTS path transparently
//
// The fallback is automatic — no config flag needed. Typesense unavailability
// is caught per-request and logged as a warning, not an error.
//
// Schema reality:
//   shop_inventory.price  = bigint PAISE  (Typesense: int32)
//   shop_inventory.mrp    = bigint PAISE  (Typesense: int32, optional)
//   shop_inventory.is_in_stock = generated boolean
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }     from '../config/supabase.js';
import logger                from '../utils/logger.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import * as aiService         from './ai.service.js';             // P5-2
import { typesenseClient, isTypesenseEnabled } from '../lib/typesense.js'; // P6-5

// ── Unit-query parser (kept from B3) ─────────────────────────

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

// ── Sort field mapping ────────────────────────────────────────

function typesenseSortBy(sort) {
  switch (sort) {
    case 'price_asc':  return 'price:asc';
    case 'price_desc': return 'price:desc';
    default:           return '_text_match:desc,price:asc'; // relevance → price
  }
}

function postgresSortOrder(sort, q) {
  switch (sort) {
    case 'price_asc':  return q.order('price', { ascending: true });
    case 'price_desc': return q.order('price', { ascending: false });
    case 'newest':     return q.order('created_at', { referencedTable: 'products', ascending: false });
    default:           return q.order('updated_at', { ascending: false });
  }
}

// ── AI pre-processing (P5-2) ──────────────────────────────────

async function applyAIPreprocessing(query, shopId, filters) {
  const isNaturalLanguage = query.split(' ').length > 2 || /[^\x00-\x7F]/.test(query);
  let processedQuery     = query;
  let aiDerivedFilters   = {};
  let aiInterpretedAs    = null;

  if (isNaturalLanguage && process.env.ANTHROPIC_API_KEY) {
    try {
      const parsed = await aiService.parseNaturalLanguageSearch(query, shopId);
      if (parsed.search_terms?.length) processedQuery = parsed.search_terms.join(' ');
      if (!filters.category && parsed.category)      aiDerivedFilters.categoryName = parsed.category;
      if (!filters.tier     && parsed.delivery_tier) aiDerivedFilters.tier         = parsed.delivery_tier;
      aiInterpretedAs = parsed.interpreted_as || null;
      logger.debug('AI search pre-processing', { original: query, processed: processedQuery });
    } catch (aiErr) {
      logger.warn('AI search pre-processing failed — using raw query', { error: aiErr.message });
    }
  }

  return { processedQuery, aiDerivedFilters, aiInterpretedAs };
}

// ════════════════════════════════════════════════════════════
// ── Typesense search path ────────────────────────────────────
// ════════════════════════════════════════════════════════════

async function searchWithTypesense(processedQuery, shopId, mergedFilters, sort, page, limit) {
  const { category, categoryName, tier, minPrice, maxPrice, inStock, city_id, unitHint } = mergedFilters;

  // Build filter_by string
  const filterParts = [];
  if (shopId)      filterParts.push(`shop_id:=${shopId}`);
  if (city_id)     filterParts.push(`city_id:=${city_id}`);
  if (categoryName) filterParts.push(`category_name:=${categoryName}`);
  if (tier)        filterParts.push(`delivery_tier:=${tier}`);
  if (unitHint)    filterParts.push(`unit:=${unitHint}`);
  if (inStock === true || inStock === 'true' || inStock === '1') {
    filterParts.push('is_in_stock:=true');
  }
  if (minPrice)    filterParts.push(`price:>=${Math.round(+minPrice * 100)}`);
  if (maxPrice)    filterParts.push(`price:<=${Math.round(+maxPrice * 100)}`);
  filterParts.push('is_listed:=true');

  const searchParams = {
    q:                    processedQuery || '*',
    query_by:             'name,brand_name,category_name,search_text',
    query_by_weights:     '4,2,2,1',
    filter_by:            filterParts.join(' && '),
    sort_by:              typesenseSortBy(sort),
    per_page:             limit,
    page,
    // Typo tolerance: allow up to 2 typos for queries longer than 4 chars
    num_typos:            2,
    typo_tokens_threshold: 1,
    // Facets for the filter UI (category + tier breakdowns)
    facet_by:             'category_name,delivery_tier',
    max_facet_values:     20,
    // Snippet highlighting for the search results UI
    highlight_full_fields: 'name',
    snippet_threshold:    30,
  };

  const result = await typesenseClient
    .collections('products')
    .documents()
    .search(searchParams);

  if (!result) throw new Error('Typesense returned null — not configured');

  const results = (result.hits || []).map(hit => ({
    inventoryId:  hit.document.id,
    shopId:       hit.document.shop_id,
    price:        hit.document.price,
    mrp:          hit.document.mrp || null,
    stockQty:     hit.document.stock_quantity,
    isInStock:    hit.document.is_in_stock,
    isListed:     hit.document.is_listed,
    productId:    hit.document.product_id,
    name:         hit.document.name,
    brandName:    hit.document.brand_name || null,
    categoryName: hit.document.category_name || null,
    deliveryTier: hit.document.delivery_tier || null,
    unit:         hit.document.unit || null,
    shopName:     hit.document.shop_name || null,
    // Highlighted name for the search results UI
    highlight:    hit.highlights?.find(h => h.field === 'name')?.snippet || null,
    _score:       hit.text_match,
  }));

  return {
    results,
    total:          result.found,
    page:           result.page,
    hasMore:        result.found > page * limit,
    facets:         result.facet_counts || [],
    queryTimeMs:    result.search_time_ms,
    searchEngine:   'typesense',
    // P19-6: Did you mean? — populated when Typesense applies typo correction
    did_you_mean:   result.request_params?.q !== processedQuery
                    ? result.request_params?.q || null
                    : null,
  };
}

// ════════════════════════════════════════════════════════════
// ── PostgreSQL FTS fallback (original B3 implementation) ─────
// ════════════════════════════════════════════════════════════

function normaliseRow(row) {
  const p = row.products || {};
  return {
    inventoryId:  row.id,
    shopId:       row.shop_id,
    price:        row.price,
    mrp:          row.mrp,
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
    brandName:    p.brands?.name || null,
    categoryName: p.categories?.name || null,
    categoryId:   p.categories?.id || null,
    categorySlug: p.categories?.slug || null,
    searchEngine: 'postgres',
  };
}

async function searchWithPostgres(processedQuery, shopId, mergedFilters, sort, page, limit) {
  const { category, categoryName, tier, minPrice, maxPrice, inStock, unitHint, cleanQuery } =
    { ...mergedFilters, cleanQuery: mergedFilters._cleanQuery || processedQuery };

  const offset = (page - 1) * limit;

  let q = supabaseAdmin
    .from('shop_inventory')
    .select(`
      id, price, mrp, stock_quantity, is_in_stock, is_listed, shop_id, product_id,
      products!inner(
        id, name, slug, description, images,
        delivery_tier, unit, weight_kg, is_bulk,
        gst_percent,
        categories!category_id(id, name, slug),
        brands!brand_id(id, name)
      )
    `, { count: 'exact' })
    .eq('products.is_active', true)
    .eq('is_listed', true)
    .range(offset, offset + limit - 1);

  if (shopId)  q = q.eq('shop_id', shopId);
  if (inStock === true || inStock === 'true' || inStock === '1') q = q.eq('is_in_stock', true);
  if (minPrice) q = q.gte('price', Math.round(+minPrice * 100));
  if (maxPrice) q = q.lte('price', Math.round(+maxPrice * 100));
  if (category)     q = q.eq('products.category_id',   category);
  // categoryName filter: match via categories join — note: Supabase filters on joined tables use FK syntax
  if (categoryName) q = q.eq('categories.name', categoryName);
  if (tier)     q = q.eq('products.delivery_tier', tier);
  if (unitHint) q = q.eq('products.unit', unitHint);

  if ((cleanQuery || '').length >= 3) {
    q = q.textSearch('products.search_vector', cleanQuery, { type: 'websearch', config: 'english' });
  } else if ((cleanQuery || '').length > 0) {
    q = q.ilike('products.name', `${cleanQuery}%`);
  }

  q = postgresSortOrder(sort, q);

  const { data, error, count } = await q;

  if (error) {
    if (error.message?.includes('search_vector') || error.code === '42703') {
      // FTS index not ready → ILIKE fallback
      logger.warn('FTS not available, using ILIKE fallback', { error: error.message });
      return ilikeFallback(processedQuery, shopId, mergedFilters, sort, page, limit);
    }
    throw error;
  }

  const results = (data || []).map(normaliseRow);
  return {
    results,
    total:   count || 0,
    page:    +page,
    hasMore: offset + results.length < (count || 0),
    searchEngine: 'postgres',
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
        is_bulk, gst_percent,
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
  return { results, total: count || 0, page: +page, hasMore: offset + results.length < (count || 0), searchEngine: 'ilike' };
}

// ════════════════════════════════════════════════════════════
// ── Public API ───────────────────────────────────────────────
// ════════════════════════════════════════════════════════════

/**
 * Search products with automatic Typesense → Postgres → ILIKE fallback.
 *
 * @param {string}      query
 * @param {string|null} shopId   — null = search all shops
 * @param {object}      filters  — { category, tier, minPrice, maxPrice, inStock, city_id }
 * @param {string}      sort     — 'relevance'|'price_asc'|'price_desc'|'newest'
 * @param {number}      page     — 1-based
 * @param {number}      limit
 */
export async function searchProducts(
  query,
  shopId  = null,
  filters = {},
  sort    = 'relevance',
  page    = 1,
  limit   = 20
) {
  let processedQuery   = query || '';
  let aiDerivedFilters = {};
  let aiInterpretedAs  = null;

  // P5-2: AI pre-processing (Hinglish / natural language)
  if (processedQuery) {
    ({ processedQuery, aiDerivedFilters, aiInterpretedAs } =
      await applyAIPreprocessing(processedQuery, shopId, filters));
  }

  const mergedFilters = { ...aiDerivedFilters, ...filters };

  // Unit parsing (e.g. "50kg" → unitHint='kg')
  const { unitHint, cleanQuery } = parseUnitQuery(processedQuery);
  mergedFilters.unitHint   = unitHint;
  mergedFilters._cleanQuery = cleanQuery;

  // B7: Redis cache key (post-AI so NL queries share cache with clean equivalents)
  const cacheKey = `search:v2:${shopId}:${processedQuery}:${JSON.stringify(mergedFilters)}:${sort}:${page}:${limit}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through */ }
  }

  let payload;

  // ── Typesense path ────────────────────────────────────────
  if (isTypesenseEnabled()) {
    try {
      payload = await searchWithTypesense(processedQuery, shopId, mergedFilters, sort, page, limit);
    } catch (tsErr) {
      logger.warn('Typesense search failed — falling back to Postgres FTS', { error: tsErr.message });
      payload = await searchWithPostgres(processedQuery, shopId, mergedFilters, sort, page, limit);
    }
  } else {
    // ── Postgres FTS path ──────────────────────────────────
    payload = await searchWithPostgres(processedQuery, shopId, mergedFilters, sort, page, limit);
  }

  // Attach AI metadata
  payload.interpretedAs = aiInterpretedAs || null;
  payload.isAiSearch    = !!aiInterpretedAs;

  // Cache for 60 seconds
  await cacheSet(cacheKey, JSON.stringify(payload), 60);

  // M1: Log search query for analytics (fire-and-forget — never blocks search response)
  if (query?.trim()) {
    (async () => {
      try {
        await supabaseAdmin
          .from('search_logs')
          .insert({
            query:         processedQuery || query,
            results_count: payload.total || 0,
            city_id:       filters.city_id || null,
            profile_id:    filters.profile_id || null,
          });
      } catch { /* non-fatal */ }
    })();
  }

  return payload;
}

// ── Autocomplete suggestions (unchanged from B3) ─────────────

export async function getSuggestions(query, shopId = null, limit = 5) {
  if (!query || query.trim().length < 1) return [];
  const q = query.trim();

  // If Typesense available: use it for instant suggestions with typo tolerance
  if (isTypesenseEnabled()) {
    try {
      const result = await typesenseClient
        .collections('products')
        .documents()
        .search({
          q,
          query_by:     'name,brand_name',
          query_by_weights: '4,1',
          filter_by:    shopId ? `shop_id:=${shopId} && is_listed:=true` : 'is_listed:=true',
          per_page:     limit,
          page:         1,
          num_typos:    1,
        });

      if (result) {
        return (result.hits || []).map(hit => ({
          id:           hit.document.product_id,
          name:         hit.document.name,
          unit:         hit.document.unit || null,
          brand:        hit.document.brand_name || null,
          deliveryTier: hit.document.delivery_tier || null,
          thumbnail:    null, // Typesense doesn't store image URLs; caller can enrich if needed
        }));
      }
    } catch (tsErr) {
      logger.warn('Typesense suggestion failed — using Postgres ILIKE', { error: tsErr.message });
    }
  }

  // Postgres fallback
  const buildBase = () =>
    supabaseAdmin
      .from('products')
      .select('id, name, unit, delivery_tier, images, brands!brand_id(name)')
      .eq('is_active', true);

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
      brand:        row.brands?.name || null,
      deliveryTier: row.delivery_tier,
      thumbnail:    Array.isArray(row.images) ? row.images[0] : null,
    });
  }
  return items;
}

// ── Popular categories ────────────────────────────────────────

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
