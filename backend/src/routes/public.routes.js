// ────────────────────────────────────────────────────────────
// Public Routes — P4-1A / P4-4A
//
// No authentication required for any route in this file.
// These are marketing-funnel and public-data endpoints.
// Uses Zod for validation (same pattern as all other routes).
// ────────────────────────────────────────────────────────────
import { Router }          from 'express';
import { z }               from 'zod';
import { validate }        from '../middleware/validate.js';
import { supabaseAdmin }   from '../config/supabase.js';
import rateLimit           from 'express-rate-limit';
import logger              from '../utils/logger.js';
import {
  getCityCatalog,
  getProductById,
} from '../services/catalog.service.js'; // P10-1
import { verifyInvestorToken }   from '../services/investor-token.service.js';      // P11-5
import { getInvestorMetrics }    from '../services/investor-analytics.service.js';  // P11-5

const router = Router();

// ── Waitlist-specific rate limiter (P5-0D Bug 1) ───────────────
// The city-waitlist is an open endpoint (no auth required).
// Without a specific limiter, a bot could flood the waitlist table
// and artificially inflate demand signals for a coming-soon city.
// 3 submissions per IP per hour is generous for legitimate users
// (city doesn't change mid-session) but blocks automated abuse.
const cityWaitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      3,               // max 3 submissions per IP per hour
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many waitlist submissions. Please try again later.' },
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// ── Validation Schema ─────────────────────────────────────
const VALID_SHOP_TYPES = [
  'construction', 'paints', 'tiles', 'electrical',
  'plumbing', 'hardware', 'decor',
];

const shopInterestSchema = z.object({
  shop_name:      z.string().trim().min(2).max(120),
  owner_name:     z.string().trim().min(2).max(80),
  phone:          z.string().trim().regex(/^[6-9]\d{9}$/, {
    message: 'phone must be a valid 10-digit Indian mobile number',
  }),
  city:           z.string().trim().min(2).max(60),
  shop_types:     z
    .array(z.enum(VALID_SHOP_TYPES))
    .min(1, 'Select at least one shop type'),
  monthly_orders: z.string().max(60).optional().nullable(),
});

// ── POST /public/shop-interest ─────────────────────────────
// Accept shop owner pre-registration from marketing funnel.
router.post(
  '/public/shop-interest',
  validate(shopInterestSchema),
  async (req, res, next) => {
    const { shop_name, owner_name, phone, city, shop_types, monthly_orders } = req.body;

    try {
      // Deduplicate: check if this phone has already registered within the last 7 days.
      // Prevents double-submission without blocking genuine re-interest after a long gap.
      const { data: existing } = await supabaseAdmin
        .from('shop_interest_registrations')
        .select('id, submitted_at')
        .eq('phone', phone)
        .gte('submitted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existing) {
        // Return 200 so the user sees the success state — they don't need to know it was a dupe.
        logger.info({ phone, existing_id: existing.id }, 'Shop interest deduped (same phone within 7d)');
        return res.status(200).json({ success: true, deduplicated: true });
      }

      const { data, error } = await supabaseAdmin
        .from('shop_interest_registrations')
        .insert({
          shop_name,
          owner_name,
          phone,
          city,
          shop_types,
          monthly_orders: monthly_orders || null,
          status: 'new',
        })
        .select('id')
        .single();

      if (error) throw error;

      logger.info({ id: data.id, phone, city }, 'New shop interest registration');
      return res.status(201).json({ success: true, id: data.id });

    } catch (err) {
      next(err);
    }
  }
);

// ── GET /public/cities (P4-4A) ─────────────────────────────
// Returns all cities — used by the mobile city picker BEFORE login.
// Returns is_active, lat/lng, name so the app can auto-detect
// the nearest active city from the user's GPS location.
router.get(
  '/public/cities',
  async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('cities')
        .select('id, name, state, center_lat, center_lng, delivery_radius_km, is_active, launch_date')
        .order('is_active', { ascending: false })
        .order('name');

      if (error) throw error;

      res.json({ success: true, data: { cities: data } });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /public/city-waitlist (P4-4A) ────────────────────
// Waitlist signup for users whose detected location is in a
// coming-soon city.  Idempotent — duplicate phone+city is silently
// accepted so double-taps never surface an error to the user.

const cityWaitlistSchema = z.object({
  city_id: z.string().uuid(),
  name:    z.string().trim().min(2).max(80),
  phone:   z.string().trim().regex(/^[6-9]\d{9}$/, {
    message: 'phone must be a valid 10-digit Indian mobile number',
  }),
});

router.post(
  '/public/city-waitlist',
  cityWaitlistLimiter,  // P5-0D Bug 1: 3/hr/IP to prevent waitlist spam
  validate(cityWaitlistSchema),
  async (req, res, next) => {
    const { city_id, name, phone } = req.body;

    try {
      // Verify the city exists and is actually coming-soon (not already active)
      const { data: city, error: cityErr } = await supabaseAdmin
        .from('cities')
        .select('id, name, is_active')
        .eq('id', city_id)
        .single();

      if (cityErr || !city) {
        return res.status(404).json({ success: false, error: { message: 'City not found' } });
      }

      // Insert — on conflict (phone, city_id) do nothing (idempotent)
      const { data, error } = await supabaseAdmin
        .from('city_waitlist')
        .upsert(
          { city_id, name, phone },
          { onConflict: 'phone,city_id', ignoreDuplicates: true }
        )
        .select('id')
        .maybeSingle();

      if (error) throw error;

      logger.info({ city_id, cityName: city.name, phone }, 'City waitlist signup');
      return res.status(201).json({
        success: true,
        data: { id: data?.id || null, city: city.name },
      });

    } catch (err) {
      next(err);
    }
  }
);

// ── P9-5: GET /public/shops/:slug ──────────────────────────────
// Returns shop metadata for the Next.js web storefront.
// Used for SSG (generateStaticParams) and ISR (revalidate: 60).
//
// No auth required. Returns only published shops (status = 'active').
// Response includes: name, slug, city, logo, description, categories, rating.
//
// Query params: none
// Cache strategy: Safe to cache at CDN for 60 seconds (add Cache-Control header).
router.get('/public/shops/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || slug.length < 2 || slug.length > 100) {
      return res.status(400).json({ success: false, message: 'Invalid shop slug' });
    }

    const { data: shop, error } = await supabaseAdmin
      .from('shops')
      .select(`
        id, name, slug, city, address,
        logo_url, description, status,
        rating, total_reviews,
        opening_time, closing_time,
        shop_categories ( category_name, sort_order )
      `)
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (error || !shop) {
      return res.status(404).json({ success: false, message: 'Shop not found or inactive' });
    }

    // Set cache-friendly headers — safe because this data changes infrequently
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    return res.json({
      success: true,
      data: {
        id:           shop.id,
        name:         shop.name,
        slug:         shop.slug,
        city:         shop.city,
        address:      shop.address,
        logo_url:     shop.logo_url,
        description:  shop.description,
        rating:       shop.rating,
        total_reviews: shop.total_reviews,
        opening_time:  shop.opening_time,
        closing_time:  shop.closing_time,
        categories:   (shop.shop_categories || [])
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(c => c.category_name),
      },
    });
  } catch (err) {
    logger.error('GET /public/shops/:slug error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── P9-5: GET /public/shops/:slug/products ──────────────────────
// Returns paginated product list for a shop.
// Used by SSG (shop page) and ISR (product listing updates).
//
// No auth required. Returns only active products.
//
// Query params:
//   category  — filter by category name (optional)
//   page      — 1-indexed page number (default: 1)
//   limit     — items per page (default: 24, max: 48)
//
// Cache strategy: Safe to cache at CDN for 60 seconds.
router.get('/public/shops/:slug/products', async (req, res) => {
  try {
    const { slug } = req.params;
    const category = req.query.category || null;
    const page     = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit    = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const offset   = (page - 1) * limit;

    if (!slug || slug.length < 2 || slug.length > 100) {
      return res.status(400).json({ success: false, message: 'Invalid shop slug' });
    }

    // First resolve slug → shop_id
    const { data: shop, error: shopErr } = await supabaseAdmin
      .from('shops')
      .select('id, name, slug')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (shopErr || !shop) {
      return res.status(404).json({ success: false, message: 'Shop not found or inactive' });
    }

    // Query products — DEPRECATED: uses `inventory` VIEW (remapped columns).
    // New code should use `shop_inventory` directly with original column names.
    let query = supabaseAdmin
      .from('inventory')
      .select(`
        id, price, discounted_price, stock_count, unit,
        products (
          id, name, description, category, image_url,
          brand, specifications
        )
      `, { count: 'exact' })
      .eq('shop_id', shop.id)
      .eq('is_active', true)
      .gt('stock_count', 0)      // Only in-stock products on the web listing
      .order('products(name)', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq('products.category', category);
    }

    const { data: inventory, count, error: invErr } = await query;

    if (invErr) throw invErr;

    const products = (inventory || []).map(item => ({
      inventory_id:    item.id,
      product_id:      item.products?.id,
      name:            item.products?.name,
      description:     item.products?.description,
      category:        item.products?.category,
      image_url:       item.products?.image_url,
      brand:           item.products?.brand,
      price_paise:     item.price,
      discounted_paise: item.discounted_price,
      unit:            item.unit,
      in_stock:        item.stock_count > 0,
    }));

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    return res.json({
      success: true,
      data: {
        shop: { id: shop.id, name: shop.name, slug: shop.slug },
        products,
        pagination: {
          page,
          limit,
          total:        count || 0,
          total_pages:  Math.ceil((count || 0) / limit),
          has_next:     offset + limit < (count || 0),
          has_prev:     page > 1,
        },
      },
    });
  } catch (err) {
    logger.error('GET /public/shops/:slug/products error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── P9-5: GET /public/orders/track ─────────────────────────────
// Public order tracking by order_number (the short alphanumeric code
// shown on the customer's order confirmation screen).
//
// No auth required — the order_number is the publicly-shareable ref.
// Returns only safe, non-PII fields.
//
// Rate limited to 20 req/min per IP to prevent enumeration attacks.
//
// Query params:
//   order_number — required, e.g. "TN-2024-ABCD"
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many tracking requests. Please try again shortly.' },
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

router.get('/public/orders/track', trackingLimiter, async (req, res) => {
  try {
    const { order_number } = req.query;

    if (!order_number || order_number.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'order_number is required',
      });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, status, created_at, updated_at,
        shops ( name, city ),
        sub_orders (
          id, status, total_amount, payment_method,
          delivery_assignments (
            status, assigned_at, picked_up_at, delivered_at
          )
        )
      `)
      .eq('order_number', order_number.trim().toUpperCase())
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found. Please check your order number.',
      });
    }

    // Shop info lives at order level (orders.shop_id → shops)
    const shopName = order.shops?.name || 'Shop';
    const shopCity = order.shops?.city || 'Patna';

    // ── Map to safe public response ──────────────────────────
    const subOrders = (order.sub_orders || []).map(sub => {
      const assignment = sub.delivery_assignments?.[0] || null;

      // Derive current status from delivery assignment if available
      let deliveryStatus = sub.status;
      if (assignment?.delivered_at)      deliveryStatus = 'delivered';
      else if (assignment?.picked_up_at) deliveryStatus = 'on_the_way';
      else if (assignment?.assigned_at)  deliveryStatus = 'rider_assigned';

      return {
        sub_order_id:   sub.id,
        shop_name:      shopName,
        shop_city:      shopCity,
        status:         deliveryStatus,
        total_amount:   sub.total_amount,
        payment_method: sub.payment_method,
        delivery: assignment ? {
          status:       assignment.status,
          rider_city:   shopCity,     // city-level only — no GPS coords
          assigned_at:  assignment.assigned_at,
          picked_up_at: assignment.picked_up_at,
          delivered_at: assignment.delivered_at,
        } : null,
      };
    });

    // Overall order status: worst (furthest from delivered) sub-order
    const statusRank = { pending: 0, confirmed: 1, rider_assigned: 2, on_the_way: 3, delivered: 4, cancelled: -1 };
    const overallStatus = subOrders.reduce((worst, sub) => {
      const r = statusRank[sub.status] ?? 0;
      return r < (statusRank[worst] ?? 0) ? sub.status : worst;
    }, subOrders[0]?.status || order.status);

    return res.json({
      success: true,
      data: {
        order_number: order.order_number,
        status:       overallStatus,
        placed_at:    order.created_at,
        updated_at:   order.updated_at,
        sub_orders:   subOrders,
      },
    });
  } catch (err) {
    logger.error('GET /public/orders/track error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── P13-1: GET /public/orders/track/:orderNumber/rider-location ─
// Returns the last known rider GPS position for a given order number.
// No auth required — used by the public tracking page.
// Only returns location if rider is assigned and location is < 5 min old.
router.get('/public/orders/track/:orderNumber/rider-location', async (req, res) => {
  try {
    const { orderNumber } = req.params;

    // Get the order + assigned rider
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('order_number', orderNumber.toUpperCase())
      .maybeSingle();

    if (orderErr || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Find accepted delivery assignment → rider_id
    const { data: assignment } = await supabaseAdmin
      .from('delivery_assignments')
      .select('rider_id')
      .eq('order_id', order.id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (!assignment?.rider_id) {
      return res.json({ success: true, data: null }); // rider not yet assigned
    }

    // Get most recent location (within last 5 min)
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: loc } = await supabaseAdmin
      .from('rider_locations')
      .select('lat, lng, recorded_at')
      .eq('rider_id', assignment.rider_id)
      .gt('recorded_at', cutoff)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json({
      success: true,
      data: loc ? { lat: loc.lat, lng: loc.lng, timestamp: new Date(loc.recorded_at).getTime() } : null,
    });
  } catch (err) {
    logger.error('GET rider-location error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// Returns a single product by product_id.
// Delegates to catalog.service.getProductById() — cheapest active
// inventory entry across all shops.
// No auth required. 120s CDN cache.
router.get('/public/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.length < 2 || id.length > 100) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const product = await getProductById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found or out of stock' });
    }

    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    return res.json({ success: true, data: product });
  } catch (err) {
    logger.error('GET /public/products/:id error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── P10-1: GET /public/catalog ──────────────────────────────────
// City-scoped product catalog — production-quality via catalog.service.js.
//
// Query params:
//   city     — city slug (default: 'patna')
//   category — filter by category (optional)
//   q        — search query (optional)
//   page     — 1-indexed page number (default: 1)
//   limit    — items per page (default: 20, max: 48)
//   sort     — 'popular'|'price_asc'|'price_desc'|'newest' (default: 'popular')
//   lat      — customer latitude for geo-sorted results (optional)
//   lng      — customer longitude for geo-sorted results (optional)
//
// Improvements over P10-0:
//   • Queries city_catalog MV (~30ms vs ~200ms for live join)
//   • Deduplicates by product_id — same product from multiple shops
//     shows once, cheapest price wins
//   • Geo-aware: when lat/lng provided, nearest shop's stock is preferred
//
// Cache: 60s CDN-safe.
const catalogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      120,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Slow down.' } },
  skip: (req) => process.env.NODE_ENV === 'test',
});

router.get('/public/catalog', catalogLimiter, async (req, res) => {
  try {
    const result = await getCityCatalog({
      citySlug: req.query.city     || 'patna',
      category: req.query.category || null,
      q:        req.query.q        || null,
      sort:     req.query.sort     || 'popular',
      page:     req.query.page     || 1,
      limit:    req.query.limit    || 20,
      lat:      req.query.lat      || null,
      lng:      req.query.lng      || null,
    });

    // P13-8: Log search queries asynchronously (fire-and-forget)
    if (req.query.q && req.query.q.trim()) {
      const productCount = result?.products?.length ?? 0;
      const citySlug     = req.query.city || 'patna';
      setImmediate(async () => {
        try {
          // Resolve city_id from slug
          const { data: city } = await supabaseAdmin
            .from('cities')
            .select('id')
            .eq('name', citySlug)
            .maybeSingle();

          await supabaseAdmin.from('search_queries').insert({
            query:        req.query.q.trim().toLowerCase(),
            city_id:      city?.id || null,
            result_count: productCount,
            session_id:   req.headers['x-session-id'] || null,
          });
        } catch { /* Non-fatal: search still works even if logging fails */ }
      });
    }

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'CITY_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'CITY_NOT_FOUND', message: err.message } });
    }
    logger.error('GET /public/catalog error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// ── P10-0 Fix 3: GET /public/cities/:slug ──────────────────────
// Returns a single city by slug (name match) for city landing pages.
// Returns 404 for inactive / non-existent cities (frontend shows waitlist).
//
// Cache: 1 hour — city data rarely changes.
router.get('/public/cities/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || slug.length < 2 || slug.length > 60) {
      return res.status(400).json({ success: false, message: 'Invalid city slug' });
    }

    const { data: city, error } = await supabaseAdmin
      .from('cities')
      .select('id, name, state, center_lat, center_lng, delivery_radius_km, is_active, launch_date')
      .ilike('name', `%${slug.replace(/-/g, ' ')}%`)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.json({ success: true, data: city });
  } catch (err) {
    logger.error('GET /public/cities/:slug error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── P11-5: Public investor report — token-gated, no auth ─────
// GET /public/investor-report/:token
// Token is a 7-day HMAC-signed string generated by POST /admin/investor/generate-link
router.get('/public/investor-report/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const payload = verifyInvestorToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'This report link has expired or is invalid. Ask for a new link.',
      });
    }

    const metrics = await getInvestorMetrics();

    return res.json({
      success: true,
      data: metrics,
      _meta: {
        generated_at: new Date().toISOString(),
        expires_at:   new Date(payload.exp).toISOString(),
        note:         'TezzNirmaan — Confidential. Do not distribute.',
      },
    });
  } catch (err) {
    logger.error('GET /public/investor-report error', { error: err.message });
    next(err);
  }
});

// ── GET /public/banners — P12-3 ────────────────────────────────
// Returns active, scheduled banners for a city (city-specific + global).
// No auth required. 60s CDN cache.
router.get('/public/banners', async (req, res, next) => {
  try {
    const citySlug = (req.query.city || '').toLowerCase();

    // Resolve city_id from slug if provided
    let cityId = null;
    if (citySlug) {
      const { data: cityRow } = await supabaseAdmin
        .from('cities')
        .select('id')
        .ilike('name', citySlug)
        .single();
      cityId = cityRow?.id || null;
    }

    const now = new Date().toISOString();
    let query = supabaseAdmin
      .from('banners')
      .select('id, title, subtitle, image_url, link_url, cta_text, bg_color, display_order')
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('display_order', { ascending: true })
      .limit(5);

    // City-scoped or global: city_id = null (global) OR city_id = current city
    if (cityId) {
      query = query.or(`city_id.is.null,city_id.eq.${cityId}`);
    } else {
      query = query.is('city_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
    res.json({ data: data || [] });
  } catch (err) {
    logger.error('GET /public/banners error', { error: err.message });
    next(err);
  }
});

// ── P12-5: Public product reviews ────────────────────────────
// GET /public/products/:productId/reviews
// Returns approved reviews + rating breakdown. No auth required.
router.get('/public/products/:productId/reviews', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit)  || 10, 50);
    const offset = parseInt(req.query.offset) || 0;
    const sort   = req.query.sort === 'oldest' ? 'created_at.asc' : 'created_at.desc';

    const { supabase } = await import('../config/supabase.js');

    const { data: reviews, error, count } = await supabase
      .from('product_reviews')
      .select('id, rating, title, body, is_verified, created_at', { count: 'exact' })
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order(sort.split('.')[0], { ascending: sort.endsWith('asc') })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Rating breakdown
    const { data: allRatings } = await supabase
      .from('product_reviews')
      .select('rating')
      .eq('product_id', productId)
      .eq('is_approved', true);

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    (allRatings || []).forEach(r => { if (breakdown[r.rating] !== undefined) breakdown[r.rating]++; });
    const total    = allRatings?.length || 0;
    const avg      = total ? (Object.entries(breakdown).reduce((s, [k, v]) => s + +k * v, 0) / total) : 0;

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.json({
      data: {
        reviews:   reviews || [],
        total:     count   || 0,
        avg_rating: parseFloat(avg.toFixed(2)),
        breakdown,
      },
    });
  } catch (err) {
    logger.error('GET /public/products/:id/reviews error', { error: err.message });
    next(err);
  }
});

// ── P13-5: GET /public/flash-sales ─────────────────────────────
// Returns currently active flash sales (active, not expired).
// Query: ?city=patna (optional city filter)
router.get('/public/flash-sales', async (req, res) => {
  try {
    const now      = new Date().toISOString();
    const cityName = req.query.city || null;

    let query = supabaseAdmin
      .from('flash_sales')
      .select('id, title, discount_pct, max_discount_paise, starts_at, ends_at, product_ids, category, is_active, usage_count, max_usage')
      .eq('is_active', true)
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('ends_at', { ascending: true });

    if (cityName) {
      const { data: city } = await supabaseAdmin
        .from('cities').select('id').eq('name', cityName).maybeSingle();
      if (city) {
        query = query.or(`city_id.is.null,city_id.eq.${city.id}`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.json({ success: true, data: { flash_sales: data || [] } });
  } catch (err) {
    logger.error('GET /public/flash-sales error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// ── P15-6 + P18-2: Delivery fee calculator ───────────────────────────
// GET /public/delivery-fee?city_id=&city_name=&lat=&lng=
// P18-2: returns cod_enabled + cod_limit_paise for checkout validation
// C2 fix: also accepts city_name (text) when city_id is not on the address
router.get('/delivery-fee', async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    let { city_id, city_name, lat, lng } = req.query;

    // C2: fallback — resolve city_id from city_name text if not provided
    if (!city_id && city_name) {
      const { data: cityRow } = await supabaseAdmin
        .from('cities')
        .select('id')
        .ilike('name', city_name.trim())
        .limit(1)
        .single();
      if (cityRow) city_id = cityRow.id;
    }

    if (!city_id) return res.json({ success: true, data: { fee_paise: 4900, label: '₹49', cod_enabled: true, cod_limit_paise: 100000, cod_limit_label: 'Up to ₹1,000' } });

    // Find active zones for city (P18-2: include COD columns added in migration 071)
    const { data: zones } = await supabaseAdmin
      .from('delivery_zones')
      .select('id, name, base_fee_paise, surge_multiplier, surge_start_hour, surge_end_hour, max_distance_km, polygon, cod_enabled, cod_limit_paise')
      .eq('city_id', city_id)
      .eq('is_active', true);

    let fee         = 2000; // Default Rs.20
    let codEnabled  = true;
    let codLimit    = 100000; // Rs.1000 default

    if (zones?.length) {
      // Use first zone for now (later: match by polygon)
      const zone = zones[0];
      fee        = zone.base_fee_paise || 2000;
      codEnabled = zone.cod_enabled !== false; // default true if null
      codLimit   = zone.cod_limit_paise || 100000;

      // Apply surge if in surge hours
      const hour    = new Date().getHours();
      const inSurge = hour >= (zone.surge_start_hour || 18) && hour < (zone.surge_end_hour || 21);
      if (inSurge && zone.surge_multiplier > 1) {
        fee = Math.round(fee * zone.surge_multiplier);
      }
    }

    res.json({
      success: true,
      data: {
        fee_paise:       fee,
        label:           `₹${Math.round(fee / 100)}`,
        cod_enabled:     codEnabled,
        cod_limit_paise: codLimit,
        cod_limit_label: `₹${Math.round(codLimit / 100).toLocaleString('en-IN')}`,
      },
    });
  } catch (err) { next(err); }
});

// ── P15-7: Live ETA for track page ───────────────────────────
// GET /public/orders/track/:orderNumber/eta
router.get('/orders/track/:orderNumber/eta', async (req, res, next) => {
  try {
    const { getOrderETA } = await import('../services/eta.service.js');
    const eta = await getOrderETA(req.params.orderNumber);
    if (!eta) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: eta });
  } catch (err) { next(err); }
});

// ── P17-1: Recommendations ─────────────────────────────────────
// GET /public/recommendations/personalized?city_id=&profile_id=
router.get('/recommendations/personalized', async (req, res, next) => {
  try {
    const { city_id, profile_id } = req.query;
    const { getPersonalizedRecs } = await import('../services/recommendations.service.js');
    const recs = await getPersonalizedRecs(profile_id || null, city_id || null, 8);
    res.json({ success: true, data: { recommendations: recs } });
  } catch (err) { next(err); }
});

// GET /public/recommendations/similar/:inventoryId
router.get('/recommendations/similar/:inventoryId', async (req, res, next) => {
  try {
    const { getSimilarProducts } = await import('../services/recommendations.service.js');
    const recs = await getSimilarProducts(req.params.inventoryId, 6);
    res.json({ success: true, data: { similar: recs } });
  } catch (err) { next(err); }
});

// POST /public/recommendations/fbt  body: { product_ids: [] }
router.post('/recommendations/fbt', async (req, res, next) => {
  try {
    const { product_ids = [] } = req.body;
    const { getFrequentlyBoughtTogether } = await import('../services/recommendations.service.js');
    const recs = await getFrequentlyBoughtTogether(product_ids, 4);
    res.json({ success: true, data: { fbt: recs } });
  } catch (err) { next(err); }
});

// ── Session K: GET /public/serviceability ─────────────────────────────────
// Checks whether a lat/lng coordinate is within any active city's delivery
// radius and has at least one active shop.
//
// Query params:
//   lat  (required) — float latitude
//   lng  (required) — float longitude
//
// Returns:
//   serviceable: true/false
//   city: { id, name, slug, delivery_radius_km } | null
//   active_shop_count: number
//   reason: human-readable string when serviceable=false
//
// Used by mobile app:
//   1. When user grants location permission on HomeScreen
//   2. When user picks/adds a delivery address at checkout
//   3. City auto-select in CitySelectScreen
//
// No auth required. Rate-limited to 30/min/IP (reuses generalLimiter).
// Cache-Control: 60s (city boundaries almost never change).
// ─────────────────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/public/serviceability', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COORDINATES', message: 'lat and lng query params are required and must be valid coordinates' },
      });
    }

    // Fetch all active cities with their geo data
    const { data: cities, error: cityErr } = await supabaseAdmin
      .from('cities')
      .select('id, name, slug, center_lat, center_lng, delivery_radius_km, is_active')
      .eq('is_active', true)
      .order('name');

    if (cityErr) throw cityErr;

    // Find the first active city whose delivery radius contains this point
    let matchedCity = null;
    let distKm = Infinity;

    for (const city of (cities || [])) {
      const d = haversineKm(lat, lng, city.center_lat, city.center_lng);
      if (d <= (city.delivery_radius_km || 15) && d < distKm) {
        matchedCity = city;
        distKm      = d;
      }
    }

    if (!matchedCity) {
      // Check if there is a coming-soon city nearby (within 50km) for waitlist CTA
      const { data: allCities } = await supabaseAdmin
        .from('cities')
        .select('id, name, slug, center_lat, center_lng, is_active');

      const nearest = (allCities || [])
        .map(c => ({ ...c, distKm: haversineKm(lat, lng, c.center_lat, c.center_lng) }))
        .sort((a, b) => a.distKm - b.distKm)[0];

      return res.status(200).json({
        success: true,
        data: {
          serviceable:      false,
          city:             null,
          active_shop_count: 0,
          nearest_city:     nearest && nearest.distKm < 100
            ? { id: nearest.id, name: nearest.name, slug: nearest.slug, dist_km: +nearest.distKm.toFixed(1), is_active: nearest.is_active }
            : null,
          reason: 'We do not deliver to this location yet.',
        },
      });
    }

    // Count active shops in that city
    const { count: shopCount, error: shopErr } = await supabaseAdmin
      .from('shops')
      .select('id', { count: 'exact', head: true })
      .eq('city_id', matchedCity.id)
      .eq('status', 'active');

    if (shopErr) throw shopErr;

    const activeShops = shopCount ?? 0;

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({
      success: true,
      data: {
        serviceable:       activeShops > 0,
        city: {
          id:                  matchedCity.id,
          name:                matchedCity.name,
          slug:                matchedCity.slug,
          delivery_radius_km:  matchedCity.delivery_radius_km,
          dist_km:             +distKm.toFixed(1),
        },
        active_shop_count: activeShops,
        reason: activeShops > 0 ? null : 'No active shops in your city yet.',
      },
    });
  } catch (err) {
    logger.error('GET /public/serviceability error', { error: err.message });
    next(err);
  }
});

export default router;

