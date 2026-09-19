// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin Controller â€” Platform Admin only
// All routes require authenticate + requireRole('platform_admin')
// Uses supabaseAdmin (service role) to bypass RLS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

import * as smsService from '../services/sms.service.js';
import { getPlatformAnalytics } from '../services/platform-analytics.service.js'; // P2-A
import { getLiveStats }         from '../services/realtime-analytics.service.js';  // P9-3
import logger from '../utils/logger.js';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

// â”€â”€ Shops â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
 * POST /admin/shops â€” B2
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
      city_id,                          // P4-4A: optional explicit city link
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

    // Internal email alias for staff login (phone â†’ email)
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

    // Resolve city link (P4-4A)
    // If city_id provided, look up city centre coordinates.
    // Falls back to matching by city name, then to null.
    let resolvedCityId      = null;
    let resolvedCityCenter  = {};

    if (city_id) {
      const { data: cityRow } = await supabaseAdmin
        .from('cities').select('id, center_lat, center_lng').eq('id', city_id).single();
      if (cityRow) {
        resolvedCityId     = cityRow.id;
        resolvedCityCenter = { city_center_lat: cityRow.center_lat, city_center_lng: cityRow.center_lng };
      }
    } else {
      // Best-effort: match by city name so shops created without city_id still get a centre
      const { data: cityRow } = await supabaseAdmin
        .from('cities').select('id, center_lat, center_lng').ilike('name', city).limit(1).single();
      if (cityRow) {
        resolvedCityId     = cityRow.id;
        resolvedCityCenter = { city_center_lat: cityRow.center_lat, city_center_lng: cityRow.center_lng };
      }
    }

    // 3. Insert shop row â€” PostGIS location uses WKT SRID notation
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
        city_id:             resolvedCityId,
        ...resolvedCityCenter,
      })
      .select()
      .single();

    if (shopErr) {
      logger.error('createShop: shop insert failed', { error: shopErr.message, ownerId });
      throw new AppError('Shop creation failed: ' + shopErr.message, 500);
    }

    logger.info('Shop created', { shopId: shop.id, shopName: shop_name, ownerId });

    // 4. SMS credentials to owner (non-blocking)
    smsService.sendSMS(
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
        tempPassword, // Show once â€” admin should relay securely
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

// â”€â”€ Orders (admin view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Products (master catalog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      unit, weightKg, isBulk, hsnCode, gstPercent, images,
      specifications, dimensions } = req.body;
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        name, slug, description,
        category_id:   categoryId,
        brand_id:      brandId,
        delivery_tier: deliveryTier,
        unit, weight_kg: weightKg, is_bulk: isBulk,
        hsn_code: hsnCode, gst_percent: gstPercent, images,
        specifications: specifications || {},
        dimensions:     dimensions || null,
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
    // Phase 12 additions (migration 080)
    if (u.specifications !== undefined) dbUpdates.specifications = u.specifications;
    if (u.dimensions !== undefined)     dbUpdates.dimensions = u.dimensions;
    const { data, error } = await supabaseAdmin
      .from('products').update(dbUpdates).eq('id', id).select().single();
    if (error) throw error;
    if (!data) throw new NotFoundError('Product not found');
    res.json({ success: true, data: { product: data } });
  } catch (err) { next(err); }
}

// Phase 12: GET /admin/products/:id â€” single product for edit page
export async function getProductById(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, categories(id, name, slug), brands(id, name)')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new NotFoundError('Product not found');
    res.json({ success: true, data: { product: data } });
  } catch (err) { next(err); }
}

// Phase 12: PATCH /admin/products/:id/archive â€” toggle is_active
export async function archiveProduct(req, res, next) {
  try {
    const { id } = req.params;
    // First fetch current status, then toggle
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('products').select('id, is_active').eq('id', id).single();
    if (fetchErr || !existing) throw new NotFoundError('Product not found');
    const newStatus = !existing.is_active;
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    res.json({ success: true, data: { product: data, archived: !newStatus } });
  } catch (err) { next(err); }
}

// Phase 12: GET /admin/categories
export async function getAdminCategories(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, slug, parent_id')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: { categories: data || [] } });
  } catch (err) { next(err); }
}

// Session J: POST /admin/categories
export async function createCategory(req, res, next) {
  try {
    const { name, slug, parent_id } = req.body;
    if (!name?.trim()) throw new ValidationError('name is required');
    const cleanSlug = slug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({ name: name.trim(), slug: cleanSlug, parent_id: parent_id || null })
      .select('id, name, slug, parent_id')
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { category: data } });
  } catch (err) { next(err); }
}

// Session J: PATCH /admin/categories/:id
export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug, parent_id } = req.body;
    const updates = {};
    if (name !== undefined)      updates.name      = name.trim();
    if (slug !== undefined)      updates.slug      = slug.trim();
    if (parent_id !== undefined) updates.parent_id = parent_id || null;
    if (!Object.keys(updates).length) throw new ValidationError('No fields to update');
    const { data, error } = await supabaseAdmin
      .from('categories').update(updates).eq('id', id)
      .select('id, name, slug, parent_id').single();
    if (error) throw error;
    if (!data) throw new NotFoundError('Category not found');
    res.json({ success: true, data: { category: data } });
  } catch (err) { next(err); }
}

// Session J: DELETE /admin/categories/:id
export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('categories').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) { next(err); }
}

// Phase 12: GET /admin/brands
export async function getAdminBrands(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('brands')
      .select('id, name, slug')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: { brands: data || [] } });
  } catch (err) { next(err); }
}

// Session J: POST /admin/brands
export async function createBrand(req, res, next) {
  try {
    const { name, slug } = req.body;
    if (!name?.trim()) throw new ValidationError('name is required');
    const cleanSlug = slug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data, error } = await supabaseAdmin
      .from('brands')
      .insert({ name: name.trim(), slug: cleanSlug })
      .select('id, name, slug')
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { brand: data } });
  } catch (err) { next(err); }
}

// Session J: PATCH /admin/brands/:id
export async function updateBrand(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (slug !== undefined) updates.slug = slug.trim();
    if (!Object.keys(updates).length) throw new ValidationError('No fields to update');
    const { data, error } = await supabaseAdmin
      .from('brands').update(updates).eq('id', id)
      .select('id, name, slug').single();
    if (error) throw error;
    if (!data) throw new NotFoundError('Brand not found');
    res.json({ success: true, data: { brand: data } });
  } catch (err) { next(err); }
}

// Session J: DELETE /admin/brands/:id
export async function deleteBrand(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('brands').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Brand deleted' });
  } catch (err) { next(err); }
}


// â”€â”€ Riders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
 * POST /admin/riders â€” B2
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
        // Non-fatal â€” rider created; admin can assign shops later
      }
    }

    // 5. SMS credentials
    smsService.sendSMS(
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

// â”€â”€ Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** GET /admin/analytics/overview â€” lightweight overview (backwards compat) */
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

/** GET /admin/analytics/platform?period=30d â€” P2-A full GMV dashboard */
export async function getPlatformAnalyticsHandler(req, res, next) {
  try {
    const { period = '30d' } = req.query;
    if (!['today', '7d', '30d'].includes(period)) {
      return res.status(400).json({ success: false, message: 'period must be today | 7d | 30d' });
    }
    const data = await getPlatformAnalytics(period);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// Alias for backwards compatibility
export const getDashboardOverview = getAnalyticsOverview;

// â”€â”€ Shop Interest Registrations (P4-1A) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getShopInterests(req, res, next) {
  try {
    const {
      page   = 1,
      limit  = 25,
      status,
      city,
    } = req.query;

    const from = (page - 1) * limit;

    let query = supabaseAdmin
      .from('shop_interest_registrations')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, from + limit - 1);

    if (status) query = query.eq('status', status);
    if (city)   query = query.ilike('city', `%${city}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data:    data || [],
      meta: {
        page:       Number(page),
        limit:      Number(limit),
        total:      count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) { next(err); }
}

export async function updateShopInterestStatus(req, res, next) {
  try {
    const { id }      = req.params;
    const { status, notes } = req.body;

    const VALID = ['new', 'contacted', 'onboarded', 'rejected'];
    if (status && !VALID.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    }

    const updates = {};
    if (status) updates.status = status;
    if (notes  !== undefined) updates.notes = notes;

    const { data, error } = await supabaseAdmin
      .from('shop_interest_registrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// â”€â”€ P9-3: GET /admin/analytics/live â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Real-time stats for the founder live dashboard.
// Always fresh â€” no caching, no SSE. The dashboard polls every 30s.
// Converts paise â†’ rupees at the API boundary.
export async function getLiveAnalytics(req, res, next) {
  try {
    // Prevent any CDN / browser caching â€” these numbers must always be live
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    const raw = await getLiveStats();

    // Convert paise â†’ rupees for display
    const data = {
      today: {
        orders:            raw.today.orders,
        gmv_rupees:        +(raw.today.gmv_paise  / 100).toFixed(2),
        active_deliveries: raw.today.active_deliveries,
      },
      cities: (raw.cities || []).map(c => ({
        city_name:   c.city_name,
        order_count: c.order_count,
        gmv_rupees:  +(c.gmv_paise / 100).toFixed(2),
      })),
      recent_orders: (raw.recent_orders || []).map(o => ({
        order_number:      o.order_number,
        total_rupees:      +(o.total_amount_paise / 100).toFixed(2),
        status:            o.status,
        payment_status:    o.payment_status,
        shop_name:         o.shop_name,
        created_at:        o.created_at,
      })),
      hourly_chart: (raw.hourly_chart || []).map(h => ({
        hour:        h.hour,
        order_count: h.order_count,
        gmv_rupees:  +(h.gmv_paise / 100).toFixed(2),
      })),
      timestamp: raw.timestamp,
    };

    res.json({ success: true, data });
  } catch (err) {
    logger.error('GET /admin/analytics/live error', { error: err.message });
    next(err);
  }
}


// ── R3: GET /admin/cod/pending ───────────────────────────────────────────
// Lists all sub_orders with cod_status = 'collected' (awaiting admin remittance).
// Groups by rider for easy reconciliation.
export async function getCodPending(req, res, next) {
  try {
    const { rider_id, page = 1, limit = 50 } = req.query;
    const from = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('sub_orders')
      .select(`
        id, sub_order_number, total_amount, cod_status,
        cod_collected_at, delivered_at,
        orders (
          order_number, delivery_address_snapshot,
          profiles!customer_id ( full_name, phone )
        ),
        delivery_assignments!sub_order_id (
          rider_cash_collected_at,
          riders!rider_id (
            id,
            profiles!profile_id ( full_name, phone )
          )
        )
      `, { count: 'exact' })
      .eq('cod_status', 'collected')
      .order('cod_collected_at', { ascending: false })
      .range(from, from + Number(limit) - 1);

    if (rider_id) {
      // Filter by rider: join through delivery_assignments
      query = query.eq('delivery_assignments.riders.id', rider_id);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: {
        sub_orders: data || [],
        pagination: { page: Number(page), limit: Number(limit), total: count },
      },
    });
  } catch (err) {
    logger.error('GET /admin/cod/pending error', { error: err.message });
    next(err);
  }
}

// ── R3: GET /admin/cod/balances ───────────────────────────────────────────
// Per-rider summary: how much cash each rider is currently holding.
export async function getRiderCodBalances(req, res, next) {
  try {
    // Aggregate collected (not remitted) sub_orders grouped by rider
    const { data: rows, error } = await supabaseAdmin
      .from('delivery_assignments')
      .select(`
        riders!rider_id (
          id,
          profiles!profile_id ( full_name, phone )
        ),
        sub_orders!sub_order_id (
          total_amount, cod_status, cod_collected_at
        )
      `)
      .eq('sub_orders.cod_status', 'collected')
      .not('rider_cash_collected_at', 'is', null);

    if (error) throw error;

    // Group by rider
    const byRider = {};
    for (const row of rows || []) {
      const riderInfo = row.riders;
      if (!riderInfo) continue;
      const riderId = riderInfo.id;
      if (!byRider[riderId]) {
        byRider[riderId] = {
          rider_id:    riderId,
          rider_name:  riderInfo.profiles?.full_name || 'Unknown',
          rider_phone: riderInfo.profiles?.phone || '',
          total_paise: 0,
          order_count: 0,
          oldest_collected_at: null,
        };
      }
      const so = row.sub_orders;
      if (so?.cod_status === 'collected') {
        byRider[riderId].total_paise  += so.total_amount || 0;
        byRider[riderId].order_count  += 1;
        if (!byRider[riderId].oldest_collected_at ||
            so.cod_collected_at < byRider[riderId].oldest_collected_at) {
          byRider[riderId].oldest_collected_at = so.cod_collected_at;
        }
      }
    }

    const balances = Object.values(byRider)
      .filter(r => r.total_paise > 0)
      .sort((a, b) => b.total_paise - a.total_paise);

    const grandTotal = balances.reduce((s, r) => s + r.total_paise, 0);

    res.json({
      success: true,
      data: {
        riders:              balances,
        total_pending_paise: grandTotal,
      },
    });
  } catch (err) {
    logger.error('GET /admin/cod/balances error', { error: err.message });
    next(err);
  }
}

// ── R3: POST /admin/cod/reconcile ─────────────────────────────────────────
// Admin marks a batch of sub_orders as remitted.
// Body: { sub_order_ids: string[], remittance_ref: string }
export async function reconcileCod(req, res, next) {
  try {
    const { sub_order_ids, remittance_ref } = req.body;

    if (!Array.isArray(sub_order_ids) || sub_order_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'sub_order_ids must be a non-empty array.' });
    }
    if (!remittance_ref?.trim()) {
      return res.status(400).json({ success: false, message: 'remittance_ref is required.' });
    }

    const now = new Date().toISOString();

    // Validate: all must be in 'collected' state
    const { data: subOrders, error: fetchErr } = await supabaseAdmin
      .from('sub_orders')
      .select('id, cod_status, total_amount')
      .in('id', sub_order_ids);

    if (fetchErr) throw fetchErr;

    const invalid = (subOrders || []).filter(so => so.cod_status !== 'collected');
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${invalid.length} sub_order(s) are not in 'collected' state and cannot be reconciled.`,
        invalid_ids: invalid.map(so => so.id),
      });
    }

    // Update all to 'remitted'
    const { error: updateErr } = await supabaseAdmin
      .from('sub_orders')
      .update({
        cod_status:       'remitted',
        cod_remitted_at:  now,
        cod_remittance_ref: remittance_ref.trim(),
        updated_at:       now,
      })
      .in('id', sub_order_ids);

    if (updateErr) throw updateErr;

    const totalPaise = (subOrders || []).reduce((s, so) => s + (so.total_amount || 0), 0);

    logger.info('Admin reconciled COD batch', {
      admin: req.user.id,
      count: sub_order_ids.length,
      remittance_ref,
      total_paise: totalPaise,
    });

    res.json({
      success: true,
      message: `${sub_order_ids.length} order(s) marked as remitted.`,
      data: {
        reconciled_count:   sub_order_ids.length,
        total_paise:        totalPaise,
        remittance_ref,
        remitted_at:        now,
      },
    });
  } catch (err) {
    logger.error('POST /admin/cod/reconcile error', { error: err.message });
    next(err);
  }
}

// ── Phase E: POST /admin/staff ────────────────────────────────────────────
/**
 * POST /admin/staff
 *
 * Creates a Supabase Auth user + profile row for a staff member.
 * Supports roles: 'shop_owner' | 'rider' | 'shop_staff'.
 *
 * Body: { full_name, phone, role }
 *
 * Returns the new user's credentials (tempPassword shown ONCE).
 * Sends an SMS with login details — non-fatal if SMS fails.
 */
export async function createStaffAccount(req, res, next) {
  try {
    const { full_name, phone, role } = req.body;

    if (!full_name || !phone || !role) {
      throw new AppError('Missing required fields: full_name, phone, role', 400);
    }

    const VALID_ROLES = ['shop_owner', 'rider', 'shop_staff'];
    if (!VALID_ROLES.includes(role)) {
      throw new AppError(`role must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }

    // Normalise phone to E.164 (+91...)
    const normalisedPhone = phone.startsWith('+')
      ? phone
      : `+91${phone.replace(/\D/g, '')}`;

    // Internal email: <digits>@tezznirmaan.internal
    const digits        = normalisedPhone.replace(/\D/g, '');
    const internalEmail = `${digits}@tezznirmaan.internal`;
    const tempPassword  = `TN${Math.random().toString(36).slice(2, 8).toUpperCase()}@2024`;

    // 1. Create Supabase Auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         internalEmail,
      password:      tempPassword,
      phone:         normalisedPhone,
      email_confirm: true,
      phone_confirm: true,
      app_metadata:  { role },
      user_metadata: { full_name, phone: normalisedPhone },
    });

    if (authErr) {
      if (authErr.message?.toLowerCase().includes('already registered') ||
          authErr.message?.toLowerCase().includes('already exists')) {
        throw new AppError(`A user with phone ${normalisedPhone} already exists`, 409, 'USER_EXISTS');
      }
      logger.error('createStaffAccount: auth user creation failed', { error: authErr.message });
      throw new AppError('Failed to create auth user: ' + authErr.message, 500);
    }

    const userId = authData.user.id;

    // 2. Upsert profile row
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id:             userId,
        phone:          normalisedPhone,
        full_name,
        role,
        setup_complete: false,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileErr) {
      logger.error('createStaffAccount: profile upsert failed', { error: profileErr.message, userId });
      throw new AppError('Profile creation failed: ' + profileErr.message, 500);
    }

    logger.info('Staff account created', { userId, role, phone: normalisedPhone });

    // 3. Send SMS credentials (non-fatal)
    smsService.sendSMS(
      normalisedPhone,
      `Welcome to TezzNirmaan! Your account has been created.\n` +
      `Role: ${role} | Phone: ${normalisedPhone} | Password: ${tempPassword}\n` +
      `Log in at the TezzNirmaan dashboard.`
    ).catch(err => logger.warn('createStaffAccount: SMS send failed (non-fatal)', { error: err.message }));

    res.status(201).json({
      success: true,
      data: {
        user: {
          id:    userId,
          phone: normalisedPhone,
          role,
          email: internalEmail,
        },
        tempPassword, // Show once — admin should relay securely
        message: 'Staff account created. Login credentials sent via SMS.',
      },
    });
  } catch (err) { next(err); }
}
