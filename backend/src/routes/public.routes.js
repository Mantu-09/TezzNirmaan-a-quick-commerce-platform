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

    // Query products (via inventory, which links products to shops)
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

export default router;

