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

export default router;
