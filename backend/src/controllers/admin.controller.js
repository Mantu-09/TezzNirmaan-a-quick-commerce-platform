// ────────────────────────────────────────────────────────────
// Admin Controller — Platform Admin only
// All routes require authenticate + requireRole('platform_admin')
// Uses supabaseAdmin (service role) to bypass RLS
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import * as smsService from '../services/sms.service.js';
import logger from '../utils/logger.js';

// ── Helpers ───────────────────────────────────────────────────

function makeSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

// ── Shops ─────────────────────────────────────────────────────

export async function getShops(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const from = (page - 1) * limit;
    let query = supabaseAdmin
      .from('shops')
      .select(`
        id, name, slug, phone, city, is_active, is_accepting_orders,
        quick_delivery_radius_km, scheduled_delivery_radius_km, created_at,
        profiles!owner_id(full_name, phone)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (status) query = query.eq('is_active', status === 'active');
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data: { shops: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) { next(err); }
}

export async function getShop(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('shops')
      .select('*, profiles!owner_id(full_name, phone)')
      .eq('id', req.params.shopId)
      .single();
    if (error || !data) throw new NotFoundError('Shop not found');
    res.json({ success: true, data: { shop: data } });
  } catch (err) { next(err); }
}

/**
 * POST /admin/shops — B2
 *
 * Creates a Supabase Auth user for the shop owner (phone, email+password for staff login),
 * inserts profile + shop rows. Sends SMS with credentials.
 *
 * Body: {
 *   shop_name, owner_phone, owner_name,
 *   address_line1, city?, state?, pincode,
 *   lat, lng,
 *   quick_delivery_radius_km?,    // default 5
 *   scheduled_delivery_radius_km?, // default 15
 *   operating_hours?,             // {} default
 *   description?
 * }
 */
export async function createShop(req, res, next) {
  try {
    const {
      shop_name,
      owner_phone,
      owner_name,
      address_line1,
      city     = 'Patna',
      state    = 'Bihar',
      pincode,
      lat,
      lng,
      quick_delivery_radius_km     = 5,
      scheduled_delivery_radius_km = 15,
      operating_hours              = {},
      description                  = '',
    } = req.body;

    if (!shop_name || !owner_phone || !owner_name || !address_line1 || !pincode || lat == null || lng == null) {
      throw new AppError('Missing required fields: shop_name, owner_phone, owner_name, address_line1, pincode, lat, lng', 400);
    }

    const normalisedPhone = owner_phone.startsWith('+')
      ? owner_phone
      : `+91${owner_phone.replace(/\D/g, '')}`;

    // Internal email alias for staff login (phone → email)
    const internalEmail = `${normalisedPhone.replace(/\D/g, '')}@tezznirmaan.internal`;
    const tempPassword  = `TN${Math.random().toString(36).slice(2, 8).toUpperCase()}@2024`;

    // 1. Create Supabase Auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         internalEmail,
      password:      tempPassword,
      phone:         normalisedPhone,
      email_confirm: true,
      phone_confirm: true,
      app_metadata:  { role: 'shop_owner' },
      user_metadata: { full_name: owner_name, phone: normalisedPhone },
    });

    if (authErr) {
      if (authErr.message?.toLowerCase().includes('already registered') ||
          authErr.message?.toLowerCase().includes('already exists')) {
        throw new AppError(`A user with phone ${normalisedPhone} already exists`, 409, 'USER_EXISTS');
      }
      logger.error('createShop: auth user creation failed', { error: authErr.message });
      throw new AppError('Failed to create auth user: ' + authErr.message, 500);
    }

    const ownerId = authData.user.id;

    // 2. Upsert profile
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id:             ownerId,
        phone:          normalisedPhone,
        full_name:      owner_name,
        role:           'shop_owner',
        setup_complete: false,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileErr) {
      logger.error('createShop: profile upsert failed', { error: profileErr.message, ownerId });
      throw new AppError('Profile creation failed: ' + profileErr.message, 500);
    }

    // 3. Insert shop row — PostGIS location uses WKT SRID notation
    const slug = makeSlug(shop_name);
    const { data: shop, error: shopErr } = await supabaseAdmin
      .from('shops')
      .insert({
        owner_id:                    ownerId,
        name:                        shop_name,
        slug,
        description,
        phone:                       normalisedPhone,
        address_line1,
        city,
        state,
        pincode,
        location:                    `SRID=4326;POINT(${lng} ${lat})`,
        quick_delivery_radius_km:     +quick_delivery_radius_km,
        scheduled_delivery_radius_km: +scheduled_delivery_radius_km,
        operating_hours,
        is_active:           true,
        is_accepting_orders: false,  // disabled until owner completes setup
      })
      .select()
      .single();

    if (shopErr) {
      logger.error('createShop: shop insert failed', { error: shopErr.message, ownerId });
      throw new AppError('Shop creation failed: ' + shopErr.message, 500);
    }

    logger.info('Shop created', { shopId: shop.id, shopName: shop_name, ownerId });

    // 4. SMS credentials to owner (non-blocking)
    smsService.send(
      normalisedPhone,
      `Welcome to TezzNirmaan! Shop "${shop_name}" created.\n` +
      `Phone: ${normalisedPhone} | Password: ${tempPassword}\n` +
      `Use the TezzNirmaan Shop app to complete setup.`
    );

    res.status(201).json({
      success: true,
      data: {
        shop,
        owner:        { id: ownerId, phone: normalisedPhone, name: owner_name },
        tempPassword, // Show once — admin should relay securely
        message:      'Shop created. Owner notified via SMS.',
      },
    });
  } catch (err) { next(err); }
}

export async function updateShop(req, res, next) {
  try {
    const { shopId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('shops')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', shopId).select().single();
    if (error) throw error;
    res.json({ success: true, data: { shop: data } });
  } catch (err) { next(err); }
}

export async function toggleShopStatus(req, res, next) {
  try {
    const { shopId } = req.params;
    const { is_active } = req.body;
    const { data, error } = await supabaseAdmin
      .from('shops')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', shopId).select('id, is_active').single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Orders (admin view) ───────────────────────────────────────

export async function getAllOrders(req, res, next) {
  try {
    const { shopId, status, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    let query = supabaseAdmin
      .from('orders')
      .select('*, sub_orders(*), profiles!customer_id(full_name, phone)', { count: 'exact' })
      .order('placed_at', { ascending: false })
      .range(from, from + limit - 1);
    if (shopId) query = query.eq('shop_id', shopId);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data: { orders: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) { next(err); }
}

// ── Products (master catalog) ─────────────────────────────────

export async function getProducts(req, res, next) {
  try {
    const { category, search, tier, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    let query = supabaseAdmin
      .from('products')
      .select('*, categories(name), brands(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (category) query = query.eq('category_id', category);
    if (tier)     query = query.eq('delivery_tier', tier);
    if (search)   query = query.ilike('name', `%${search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data: { products: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) { next(err); }
}

export async function createProduct(req, res, next) {
  try {
    const { name, slug, description, categoryId, brandId, deliveryTier,
      unit, weightKg, isBulk, hsnCode, gstPercent, images } = req.body;
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        name, slug, description,
        category_id:   categoryId,
        brand_id:      brandId,
        delivery_tier: deliveryTier,
        unit, weight_kg: weightKg, is_bulk: isBulk,
        hsn_code: hsnCode, gst_percent: gstPercent, images,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { product: data } });
  } catch (err) { next(err); }
}

export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const u = req.body;
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (u.name !== undefined)         dbUpdates.name = u.name;
    if (u.description !== undefined)  dbUpdates.description = u.description;
    if (u.categoryId !== undefined)   dbUpdates.category_id = u.categoryId;
    if (u.brandId !== undefined)      dbUpdates.brand_id = u.brandId;
    if (u.deliveryTier !== undefined) dbUpdates.delivery_tier = u.deliveryTier;
    if (u.unit !== undefined)         dbUpdates.unit = u.unit;
    if (u.weightKg !== undefined)     dbUpdates.weight_kg = u.weightKg;
    if (u.isBulk !== undefined)       dbUpdates.is_bulk = u.isBulk;
    if (u.hsnCode !== undefined)      dbUpdates.hsn_code = u.hsnCode;
    if (u.gstPercent !== undefined)   dbUpdates.gst_percent = u.gstPercent;
    if (u.images !== undefined)       dbUpdates.images = u.images;
    const { data, error } = await supabaseAdmin
      .from('products').update(dbUpdates).eq('id', id).select().single();
    if (error) throw error;
    if (!data) throw new NotFoundError('Product not found');
    res.json({ success: true, data: { product: data } });
  } catch (err) { next(err); }
}

// ── Riders ────────────────────────────────────────────────────

export async function getRiders(req, res, next) {
  try {
    const { page = 1, limit = 20, shopId } = req.query;
    const from = (page - 1) * limit;
    let query = supabaseAdmin
      .from('riders')
      .select(`
        id, vehicle_type, vehicle_number, status, is_active, created_at,
        profiles!profile_id(full_name, phone),
        rider_shop_assignments(shop_id, is_active, shops!shop_id(name))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (shopId) {
      const { data: riderIds } = await supabaseAdmin
        .from('rider_shop_assignments')
        .select('rider_id')
        .eq('shop_id', shopId)
        .eq('is_active', true);
      if (riderIds?.length) {
        query = query.in('id', riderIds.map(r => r.rider_id));
      }
    }
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data: { riders: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) { next(err); }
}

/**
 * POST /admin/riders — B2
 *
 * Creates a Supabase Auth user for the rider (phone, email+password for staff login),
 * inserts profile + rider rows, creates rider_shop_assignments.
 *
 * Body: { name, phone, vehicle_type, vehicle_number?, shop_ids[] }
 * vehicle_type: 'bike' | 'scooter' | 'cycle' | 'tempo' | 'other'
 */
export async function createRider(req, res, next) {
  try {
    const { name, phone, vehicle_type, vehicle_number = '', shop_ids = [] } = req.body;

    if (!name || !phone || !vehicle_type) {
      throw new AppError('Missing required fields: name, phone, vehicle_type', 400);
    }

    const VALID_VEHICLE_TYPES = ['bike', 'scooter', 'cycle', 'tempo', 'other'];
    if (!VALID_VEHICLE_TYPES.includes(vehicle_type)) {
      throw new AppError(`vehicle_type must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`, 400);
    }

    const normalisedPhone = phone.startsWith('+')
      ? phone
      : `+91${phone.replace(/\D/g, '')}`;

    const internalEmail = `${normalisedPhone.replace(/\D/g, '')}@tezznirmaan.internal`;
    const tempPassword  = `TN${Math.random().toString(36).slice(2, 8).toUpperCase()}@2024`;

    // 1. Create Supabase Auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         internalEmail,
      password:      tempPassword,
      phone:         normalisedPhone,
      email_confirm: true,
      phone_confirm: true,
      app_metadata:  { role: 'rider' },
      user_metadata: { full_name: name, phone: normalisedPhone },
    });

    if (authErr) {
      if (authErr.message?.toLowerCase().includes('already registered') ||
          authErr.message?.toLowerCase().includes('already exists')) {
        throw new AppError(`A user with phone ${normalisedPhone} already exists`, 409, 'USER_EXISTS');
      }
      throw new AppError('Failed to create auth user: ' + authErr.message, 500);
    }

    const profileId = authData.user.id;

    // 2. Upsert profile
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id:             profileId,
        phone:          normalisedPhone,
        full_name:      name,
        role:           'rider',
        setup_complete: true,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileErr) throw new AppError('Profile creation failed: ' + profileErr.message, 500);

    // 3. Insert rider row
    const { data: rider, error: riderErr } = await supabaseAdmin
      .from('riders')
      .insert({
        profile_id:     profileId,
        vehicle_type,
        vehicle_number,
        status:         'offline',
        is_active:      true,
      })
      .select()
      .single();

    if (riderErr) throw new AppError('Rider record creation failed: ' + riderErr.message, 500);

    logger.info('Rider created', { riderId: rider.id, name, phone: normalisedPhone });

    // 4. Shop assignments
    if (shop_ids.length > 0) {
      const assignments = shop_ids.map(shopId => ({
        rider_id:  rider.id,
        shop_id:   shopId,
        is_active: true,
      }));
      const { error: assignErr } = await supabaseAdmin
        .from('rider_shop_assignments')
        .upsert(assignments, { onConflict: 'rider_id,shop_id' });
      if (assignErr) {
        logger.error('Rider shop assignment failed', { error: assignErr.message, riderId: rider.id });
        // Non-fatal — rider created; admin can assign shops later
      }
    }

    // 5. SMS credentials
    smsService.send(
      normalisedPhone,
      `Welcome to TezzNirmaan! You are registered as a delivery rider.\n` +
      `Phone: ${normalisedPhone} | Password: ${tempPassword}\n` +
      `Download the TezzNirmaan Rider app to start.`
    );

    res.status(201).json({
      success: true,
      data: {
        rider: { ...rider, profile: { full_name: name, phone: normalisedPhone } },
        shopAssignments: shop_ids,
        tempPassword,
        message: 'Rider created. Login credentials sent via SMS.',
      },
    });
  } catch (err) { next(err); }
}

export async function updateRider(req, res, next) {
  try {
    const { riderId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('riders').update({ ...req.body }).eq('id', riderId).select().single();
    if (error) throw error;
    res.json({ success: true, data: { rider: data } });
  } catch (err) { next(err); }
}

export async function assignRiderToShop(req, res, next) {
  try {
    const { riderId } = req.params;
    const { shop_ids } = req.body;
    const assignments = shop_ids.map(shopId => ({
      rider_id: riderId, shop_id: shopId, is_active: true
    }));
    const { data, error } = await supabaseAdmin
      .from('rider_shop_assignments')
      .upsert(assignments, { onConflict: 'rider_id,shop_id' })
      .select();
    if (error) throw error;
    res.json({ success: true, data: { assignments: data } });
  } catch (err) { next(err); }
}

// ── Analytics ─────────────────────────────────────────────────

export async function getAnalyticsOverview(req, res, next) {
  try {
    const [shops, orders, riders] = await Promise.all([
      supabaseAdmin.from('shops').select('id, is_active', { count: 'exact' }),
      supabaseAdmin.from('orders').select('id, placed_at', { count: 'exact' }),
      supabaseAdmin.from('riders').select('id', { count: 'exact' }),
    ]);
    res.json({ success: true, data: {
      totalShops:  shops.count,
      totalOrders: orders.count,
      totalRiders: riders.count,
    }});
  } catch (err) { next(err); }
}

// Alias for backwards compatibility
export const getDashboardOverview = getAnalyticsOverview;
