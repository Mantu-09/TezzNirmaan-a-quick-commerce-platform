// ────────────────────────────────────────────────────────────
// City Controller — P4-4A
//
// Admin-facing city management endpoints:
//   GET    /admin/cities              — list all cities with metrics
//   GET    /admin/cities/:cityId      — per-city analytics
//   PATCH  /admin/cities/:cityId/status — toggle active/inactive
//   POST   /admin/cities/:cityId/activate — activate + notify
//
// All routes require authenticate + requireRole('platform_admin').
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { notifyCityActivation, notifyWaitlist } from '../services/city-notification.service.js'; // P5-6: added notifyWaitlist
import logger from '../utils/logger.js';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Resolve and validate a city by ID.
 * Throws NotFoundError if missing.
 */
async function getCity(cityId) {
  const { data, error } = await supabaseAdmin
    .from('cities')
    .select('*')
    .eq('id', cityId)
    .single();

  if (error || !data) throw new NotFoundError(`City ${cityId} not found`);
  return data;
}

// ── List Cities ───────────────────────────────────────────────

/**
 * GET /admin/cities
 *
 * Returns all cities with:
 *   - shop_count: number of shops linked to this city
 *   - order_count: number of orders placed from shops in this city
 *   - gmv_paise: total GMV (gross merchandise value) in paise
 */
export async function listCities(req, res, next) {
  try {
    // Fetch cities
    const { data: cities, error } = await supabaseAdmin
      .from('cities')
      .select('*')
      .order('is_active', { ascending: false })
      .order('name');

    if (error) throw error;

    // Aggregate shop counts per city
    const { data: shopAgg } = await supabaseAdmin
      .from('shops')
      .select('city_id')
      .not('city_id', 'is', null);

    const shopCountMap = {};
    for (const row of shopAgg || []) {
      shopCountMap[row.city_id] = (shopCountMap[row.city_id] || 0) + 1;
    }

    // Aggregate order counts and GMV per city via sub_orders → shops
    // orders → sub_orders → shops (city_id)
    const { data: orderAgg } = await supabaseAdmin
      .from('sub_orders')
      .select(`
        shop_id,
        total_amount,
        shops!inner(city_id)
      `)
      .eq('status', 'delivered');

    const orderCountMap = {};
    const gmvMap = {};
    for (const row of orderAgg || []) {
      const cid = row.shops?.city_id;
      if (!cid) continue;
      orderCountMap[cid] = (orderCountMap[cid] || 0) + 1;
      gmvMap[cid] = (gmvMap[cid] || 0) + (row.total_amount || 0);
    }

    // Waitlist counts
    const { data: waitlistAgg } = await supabaseAdmin
      .from('city_waitlist')
      .select('city_id');

    const waitlistCountMap = {};
    for (const row of waitlistAgg || []) {
      waitlistCountMap[row.city_id] = (waitlistCountMap[row.city_id] || 0) + 1;
    }

    const result = cities.map((c) => ({
      ...c,
      shop_count:     shopCountMap[c.id]     || 0,
      order_count:    orderCountMap[c.id]    || 0,
      gmv_paise:      gmvMap[c.id]           || 0,
      waitlist_count: waitlistCountMap[c.id] || 0,
    }));

    res.json({ success: true, data: { cities: result } });
  } catch (err) { next(err); }
}

// ── Get City (per-city analytics) ─────────────────────────────

/**
 * GET /admin/cities/:cityId
 *
 * Returns:
 *   - city metadata
 *   - orders: total, GMV
 *   - top_shops: top 5 by GMV
 *   - avg_delivery_time_mins
 */
export async function getCityAnalytics(req, res, next) {
  try {
    const { cityId } = req.params;
    const city = await getCity(cityId);

    // All sub_orders for shops in this city
    const { data: subOrders } = await supabaseAdmin
      .from('sub_orders')
      .select(`
        shop_id,
        total_amount,
        status,
        created_at,
        shops!inner(id, name, city_id),
        delivery_assignments(
          assigned_at,
          delivered_at
        )
      `)
      .eq('shops.city_id', cityId);

    const delivered = (subOrders || []).filter((o) => o.status === 'delivered');

    // GMV + order counts
    const total_orders  = (subOrders || []).length;
    const delivered_orders = delivered.length;
    const gmv_paise     = delivered.reduce((s, o) => s + (o.total_amount || 0), 0);

    // Avg delivery time (assigned_at → delivered_at)
    const deliveryTimes = delivered
      .flatMap((o) => o.delivery_assignments || [])
      .filter((d) => d.assigned_at && d.delivered_at)
      .map((d) => {
        const diff = new Date(d.delivered_at) - new Date(d.assigned_at);
        return diff / 60000; // ms → minutes
      });

    const avg_delivery_time_mins = deliveryTimes.length
      ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length)
      : null;

    // Top 5 shops by GMV
    const shopGmv = {};
    const shopName = {};
    for (const o of delivered) {
      const sid = o.shop_id;
      shopGmv[sid]  = (shopGmv[sid]  || 0) + (o.total_amount || 0);
      shopName[sid] = o.shops?.name || sid;
    }
    const top_shops = Object.entries(shopGmv)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, gmv]) => ({ id, name: shopName[id], gmv_paise: gmv }));

    // Waitlist count
    const { count: waitlist_count } = await supabaseAdmin
      .from('city_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('city_id', cityId);

    res.json({
      success: true,
      data: {
        city,
        analytics: {
          total_orders,
          delivered_orders,
          gmv_paise,
          avg_delivery_time_mins,
          top_shops,
          waitlist_count: waitlist_count || 0,
        },
      },
    });
  } catch (err) { next(err); }
}

// ── Toggle City Status ─────────────────────────────────────────

/**
 * PATCH /admin/cities/:cityId/status
 * Body: { is_active: boolean }
 *
 * When activating (is_active: true):
 *   - Sets launch_date = today if not already set
 *   - Fires the activation notification (non-blocking)
 */
export async function toggleCityStatus(req, res, next) {
  try {
    const { cityId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      throw new AppError('is_active must be a boolean', 400);
    }

    const city = await getCity(cityId);

    const patch = { is_active };
    if (is_active && !city.launch_date) {
      patch.launch_date = new Date().toISOString().split('T')[0];
    }

    const { data, error } = await supabaseAdmin
      .from('cities')
      .update(patch)
      .eq('id', cityId)
      .select()
      .single();

    if (error) throw error;

    logger.info({ cityId, is_active }, 'admin: city status toggled');

    // Fire notification on activation (non-blocking)
    if (is_active) {
      notifyCityActivation(data).catch(() => {});
      // P5-6: SMS blast to waitlist signups — fire-and-forget
      notifyWaitlist(cityId, data.name).catch((err) =>
        logger.warn({ cityId, error: err.message }, 'toggleCityStatus: waitlist SMS failed (non-fatal)')
      );
    }

    res.json({ success: true, data: { city: data } });
  } catch (err) { next(err); }
}

// ── Activate City ─────────────────────────────────────────────

/**
 * POST /admin/cities/:cityId/activate
 *
 * Convenience endpoint: always sets is_active = true,
 * sets launch_date = today, fires notification.
 * Idempotent — safe to call multiple times.
 */
export async function activateCity(req, res, next) {
  try {
    const { cityId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('cities')
      .update({
        is_active:   true,
        launch_date: today,
      })
      .eq('id', cityId)
      .select()
      .single();

    if (error || !data) throw new NotFoundError(`City ${cityId} not found`);

    logger.info({ cityId, city: data.name }, 'admin: city activated');

    // Fire-and-forget: internal Slack alert
    notifyCityActivation(data).catch(() => {});

    // P5-6: SMS blast to all un-notified waitlist signups — fire-and-forget
    // Runs after the HTTP response is sent so the admin never waits on SMS delivery.
    notifyWaitlist(cityId, data.name).catch((err) =>
      logger.warn({ cityId, error: err.message }, 'activateCity: waitlist SMS failed (non-fatal)')
    );

    res.json({ success: true, data: { city: data } });
  } catch (err) { next(err); }
}
