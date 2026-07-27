// ────────────────────────────────────────────────────────────
// AI Service — P5-2: Claude Intelligence Layer
//
// All Claude API calls go through this service — single place
// to manage prompts, tokens, caching, and fallback behaviour.
//
// Design principles:
//   1. NEVER block a page load — every function catches all
//      errors and returns a safe empty default.
//   2. Cache aggressively — Claude calls cost money.
//      Recommendations: 5 min, Forecast: 30 min, Search: 30s.
//   3. One model config — change CLAUDE_MODEL env var to
//      upgrade all features at once.
//   4. Uses existing cacheGet/cacheSet (redis.js) — no new deps.
//   5. supabaseAdmin queries match real schema columns.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }       from '../config/supabase.js';
import { cacheGet, cacheSet }  from '../config/redis.js';
import logger                  from '../utils/logger.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// claude-sonnet-4-5 = fast, affordable, strong reasoning.
// Override via CLAUDE_MODEL env var when a newer model is available.
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

// ── Core Claude caller ────────────────────────────────────────

/**
 * Call Claude with a system prompt + user message.
 * Returns the raw text response. Caller handles JSON parsing.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} maxTokens
 * @returns {Promise<string>}
 */
async function callClaude(systemPrompt, userMessage, maxTokens = 500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Claude API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── JSON helper — Claude sometimes wraps output in ```json fences ──
// Strip them before JSON.parse so we never crash on a well-meaning fence.
function safeParseJSON(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// ── FEATURE 1: Personalised Product Recommendations ──────────
// Cache key:  ai:rec:{userId}:{shopId}:{cartHash}
// TTL:        300s (5 min — matches server-side in-memory freshness)
// Fallback:   [] (empty — section simply won't render)

/**
 * Returns up to 5 inventory items recommended for this user+shop.
 *
 * @param {string}   userId
 * @param {string}   shopId
 * @param {Array}    currentCartItems  [{ id, name }]
 * @returns {Promise<Array>}  normalised shop_inventory rows
 */
export async function getPersonalizedRecommendations(userId, shopId, currentCartItems = []) {
  const cartHash  = currentCartItems.map(i => i.id || i.inventoryId).sort().join(',');
  const cacheKey  = `ai:rec:${userId}:${shopId}:${cartHash}`;

  try {
    // ── Cache check ──────────────────────────────────────────
    const cached = await cacheGet(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    // ── 1. Order history ──────────────────────────────────────
    // order_items stores product data as denormalized columns (product_name)
    // and links to user via: orders.customer_id -> sub_orders -> order_items.
    // We fetch the last 10 orders for the user, then flatten their items.
    const { data: recentOrders } = await supabaseAdmin
      .from('orders')
      .select(`
        sub_orders(
          order_items(product_name, quantity)
        )
      `)
      .eq('customer_id', userId)
      .order('placed_at', { ascending: false })
      .limit(10);

    // Flatten nested orders → sub_orders → order_items
    const historyItems = recentOrders?.flatMap(o =>
      o.sub_orders?.flatMap(s => s.order_items || []) || []
    ) || [];

    // ── 2. Available inventory for this shop ─────────────────
    const { data: inventory } = await supabaseAdmin
      .from('shop_inventory')
      .select(`
        id, price, stock_quantity, is_in_stock,
        products(id, name, category_name, delivery_tier, unit, images)
      `)
      .eq('shop_id', shopId)
      .eq('is_listed', true)
      .eq('is_in_stock', true)
      .limit(120);

    if (!inventory?.length) return [];

    // ── 3. Build prompt context ───────────────────────────────
    const historyText = historyItems.length
      ? historyItems.slice(0, 50).map(i => `${i.product_name} × ${i.quantity}`).join(', ')
      : 'No previous orders';

    const cartText = currentCartItems.length
      ? currentCartItems.map(i => i.name).join(', ')
      : 'Empty cart';

    const availableText = inventory
      .map(i => `${i.products?.name} | ₹${Math.round(i.price / 100)} | ${i.products?.delivery_tier}`)
      .join('\n');

    const systemPrompt = `You are a product recommendation engine for TezzNirmaan, a hardware and construction materials delivery platform in Patna, Bihar, India. You recommend products that construction workers, homeowners, and contractors actually need together. Cement buyers need sand, rebar, concrete additives. Paint buyers need brushes, rollers, putty, primer. Tile buyers need tile adhesive, grout, spacers. Respond ONLY with a JSON array of product names — no preamble, no markdown, no explanation.`;

    const userMessage = `Order history: ${historyText}
Current cart: ${cartText}
Available products:\n${availableText}

Return a JSON array of exactly 5 product names from the available list that this user is most likely to need next. Format: ["Product Name 1", "Product Name 2", ...]`;

    // ── 4. Claude call ───────────────────────────────────────
    const raw   = await callClaude(systemPrompt, userMessage, 200);
    const names = safeParseJSON(raw); // strips ```json fences if present

    if (!Array.isArray(names)) throw new Error('Non-array response from Claude');

    // ── 5. Map names → full inventory objects ────────────────
    const nameSet     = new Set(names.map(n => n.toLowerCase()));
    const recommended = inventory
      .filter(i => nameSet.has((i.products?.name || '').toLowerCase()))
      .slice(0, 5)
      .map(row => ({
        inventoryId:  row.id,
        shopId,
        price:        row.price,
        stockQty:     row.stock_quantity,
        isInStock:    row.is_in_stock,
        productId:    row.products?.id,
        name:         row.products?.name,
        category:     row.products?.category_name,
        deliveryTier: row.products?.delivery_tier,
        unit:         row.products?.unit,
        thumbnail:    Array.isArray(row.products?.images) ? row.products.images[0] : null,
      }));

    await cacheSet(cacheKey, JSON.stringify(recommended), 300);
    logger.info('AI recommendations generated', { userId, shopId, count: recommended.length });
    return recommended;

  } catch (err) {
    // Always fail gracefully — never block page load
    logger.warn('AI recommendations failed', { userId, shopId, error: err.message });
    return [];
  }
}

// ── FEATURE 2: Demand Forecasting for Shop Owners ────────────
// Cache key:  ai:forecast:{shopId}:{daysAhead}
// TTL:        1800s (30 min — expensive call, slow-moving data)
// Fallback:   empty forecast object

/**
 * Returns a demand forecast for the shop for the next N days.
 *
 * @param {string} shopId
 * @param {number} daysAhead
 * @returns {Promise<{restock_urgently, restock_soon, demand_trend, seasonal_note}>}
 */
export async function getDemandForecast(shopId, daysAhead = 7) {
  const cacheKey = `ai:forecast:${shopId}:${daysAhead}`;

  const EMPTY_FORECAST = {
    restock_urgently: [],
    restock_soon:     [],
    demand_trend:     '',
    seasonal_note:    '',
  };

  try {
    // ── Cache check ──────────────────────────────────────────
    const cached = await cacheGet(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    // ── 1. Last 30 days of sales ─────────────────────────────
    // order_items stores product_name as a denormalized column.
    // Join through sub_orders (which has shop_id and created_at).
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: salesData } = await supabaseAdmin
      .from('order_items')
      .select(`
        product_name, quantity,
        sub_orders!inner(shop_id, created_at)
      `)
      .eq('sub_orders.shop_id', shopId)
      .gte('sub_orders.created_at', since);

    // ── 2. Current stock ─────────────────────────────────────
    const { data: stock } = await supabaseAdmin
      .from('shop_inventory')
      .select(`
        stock_quantity, low_stock_threshold,
        products(name, category_name)
      `)
      .eq('shop_id', shopId)
      .eq('is_listed', true)
      .limit(200);

    // ── 3. Aggregate sales by product ────────────────────────
    const salesByProduct = {};
    salesData?.forEach(item => {
      const name = item.product_name; // denormalized — always present
      if (name) salesByProduct[name] = (salesByProduct[name] || 0) + item.quantity;
    });

    const salesText = Object.entries(salesByProduct)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, qty]) => `${name}: ${qty} units in 30 days`)
      .join('\n') || 'No sales data yet';

    const stockText = stock
      ?.map(i => `${i.products?.name}: ${i.stock_quantity} in stock (threshold: ${i.low_stock_threshold ?? 10})`)
      .join('\n') || 'No inventory data';

    const month = new Date().toLocaleString('en-IN', { month: 'long' });

    const systemPrompt = `You are an inventory forecasting assistant for a hardware and construction materials shop in Patna, Bihar, India. You understand seasonal construction patterns: monsoon (July–September) slows exterior work but increases paint and waterproofing demand. Winter (November–February) is peak construction season. Construction projects create cascading demand — foundation materials buyers need structural materials in 2–3 weeks. Respond ONLY with valid JSON, no markdown.`;

    const userMessage = `Month: ${month}
Sales last 30 days:\n${salesText}

Current stock:\n${stockText}

For the next ${daysAhead} days, return:
{
  "restock_urgently": ["product names likely to run out in 3 days"],
  "restock_soon":     ["product names likely to run out in 7 days"],
  "demand_trend":     "one sentence on expected demand this week",
  "seasonal_note":    "one sentence on seasonal factors right now"
}`;

    // ── 4. Claude call ───────────────────────────────────────
    const raw      = await callClaude(systemPrompt, userMessage, 400);
    const forecast = safeParseJSON(raw); // strips ```json fences if present

    await cacheSet(cacheKey, JSON.stringify(forecast), 1800);
    logger.info('AI demand forecast generated', { shopId, daysAhead });
    return forecast;

  } catch (err) {
    logger.warn('Demand forecast failed', { shopId, error: err.message });
    return EMPTY_FORECAST;
  }
}

// ── FEATURE 3: Natural-Language / Hinglish Search Parsing ────
// Cache key:  ai:search:{hash of query}
// TTL:        30s (short — queries are unique but repeated typing)
// Fallback:   { search_terms: [rawQuery], category: null, delivery_tier: null }

/**
 * Parses a natural-language or Hinglish query into structured search filters.
 * Examples:
 *   "kya cement milega 10 bag" → { search_terms: ["cement"], quantity_hint: "10", unit_hint: "bag" }
 *   "waterproof paint for terrace" → { search_terms: ["waterproof paint"], category: "paints" }
 *
 * @param {string} query
 * @param {string} [shopId]  — used only to fetch category list; optional
 * @returns {Promise<{search_terms, category, delivery_tier, quantity_hint, unit_hint, language_detected, interpreted_as}>}
 */
export async function parseNaturalLanguageSearch(query, shopId = null) {
  const cacheKey = `ai:search:${Buffer.from(query).toString('base64').slice(0, 40)}`;

  const FALLBACK = {
    search_terms:    [query],
    category:        null,
    delivery_tier:   null,
    quantity_hint:   null,
    unit_hint:       null,
    language_detected: 'unknown',
    interpreted_as:  query,
  };

  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    // Fetch category names so Claude can map to real categories
    const { data: cats } = await supabaseAdmin
      .from('categories')
      .select('name')
      .eq('is_active', true)
      .limit(30);

    const categoryList = cats?.map(c => c.name).join(', ') || 'Cement, Paints, Tiles, Electrical, Plumbing, Hardware, Safety & PPE, Decor';

    const systemPrompt = `You are a search assistant for TezzNirmaan, a hardware/construction materials platform in Patna, Bihar. Users search in Hindi-English mix (Hinglish). Extract structured search intent. Respond ONLY with valid JSON.`;

    const userMessage = `Available categories: ${categoryList}
User query: "${query}"

Return JSON:
{
  "search_terms":      ["cleaned English search terms, 1-3 words"],
  "category":          "best matching category name from the list, or null",
  "delivery_tier":     "quick or scheduled or null",
  "quantity_hint":     "number if mentioned like '10 bags', else null",
  "unit_hint":         "bag/litre/piece/kg/sqft/meter or null",
  "language_detected": "hindi/english/hinglish",
  "interpreted_as":    "short English phrase of what the user is looking for"
}`;

    const raw    = await callClaude(systemPrompt, userMessage, 200);
    const parsed = safeParseJSON(raw); // strips ```json fences if present

    await cacheSet(cacheKey, JSON.stringify(parsed), 30);
    return parsed;

  } catch (err) {
    logger.warn('NL search parse failed', { query, error: err.message });
    return FALLBACK;
  }
}

// ── Health check ──────────────────────────────────────────────
/**
 * Returns true if ANTHROPIC_API_KEY is set and Claude responds to a ping.
 * Used by health check endpoint.
 */
export async function pingClaude() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: 'key_missing' };
    await callClaude('Reply with the word OK only.', 'ping', 20);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
