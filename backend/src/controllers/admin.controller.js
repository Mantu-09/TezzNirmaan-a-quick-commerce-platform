// ────────────────────────────────────────────────────────────
// Admin Controller — Platform-wide operations
// All routes require authenticate + requireRole('platform_admin')
// Uses supabaseAdmin (service role) to bypass RLS
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError } from '../utils/errors.js';

// ── Shops ─────────────────────────────────────────────────

export async function getShops(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const { data, error, count } = await supabaseAdmin
      .from('shops')
      .select('*, profiles!owner_id(full_name, phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw error;
    res.json({ success: true, data: { shops: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) {
    next(err);
  }
}

export async function createShop(req, res, next) {
  try {
    const { ownerId, name, slug, description, phone, email, addressLine1, addressLine2,
      city, state, pincode, location, quickDeliveryRadiusKm, scheduledDeliveryRadiusKm,
      operatingHours } = req.body;
    // TODO: Insert shop with PostGIS location:
    // Use supabaseAdmin.rpc('create_shop_with_location', { ...fields, lng: location.lng, lat: location.lat })
    // Or use raw SQL via supabase.from('shops').insert({ ..., location: `SRID=4326;POINT(${lng} ${lat})` })
    res.status(201).json({ success: true, data: { shop: null, message: 'TODO: implement create shop with PostGIS location' } });
  } catch (err) {
    next(err);
  }
}

// ── Orders ────────────────────────────────────────────────

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
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data: { orders: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) {
    next(err);
  }
}

// ── Products (Master Catalog) ─────────────────────────────

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
    if (tier) query = query.eq('delivery_tier', tier);
    if (search) query = query.textSearch('search_vector', search, { type: 'plain' });
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data: { products: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) {
    next(err);
  }
}

export async function createProduct(req, res, next) {
  try {
    const { name, slug, description, categoryId, brandId, deliveryTier, unit,
      weightKg, isBulk, hsnCode, gstPercent, images } = req.body;
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        name, slug, description,
        category_id: categoryId,
        brand_id: brandId,
        delivery_tier: deliveryTier,
        unit, weight_kg: weightKg,
        is_bulk: isBulk,
        hsn_code: hsnCode,
        gst_percent: gstPercent,
        images,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { product: data } });
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Convert camelCase to snake_case for DB fields
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.brandId !== undefined) dbUpdates.brand_id = updates.brandId;
    if (updates.deliveryTier !== undefined) dbUpdates.delivery_tier = updates.deliveryTier;
    if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
    if (updates.weightKg !== undefined) dbUpdates.weight_kg = updates.weightKg;
    if (updates.isBulk !== undefined) dbUpdates.is_bulk = updates.isBulk;
    if (updates.hsnCode !== undefined) dbUpdates.hsn_code = updates.hsnCode;
    if (updates.gstPercent !== undefined) dbUpdates.gst_percent = updates.gstPercent;
    if (updates.images !== undefined) dbUpdates.images = updates.images;
    dbUpdates.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new NotFoundError('Product not found');
    res.json({ success: true, data: { product: data } });
  } catch (err) {
    next(err);
  }
}

// ── Riders ────────────────────────────────────────────────

export async function getRiders(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const { data, error, count } = await supabaseAdmin
      .from('riders')
      .select('*, profiles!profile_id(full_name, phone), rider_shop_assignments(shop_id, shops(name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw error;
    res.json({ success: true, data: { riders: data, pagination: { page: +page, limit: +limit, total: count } } });
  } catch (err) {
    next(err);
  }
}

export async function createRider(req, res, next) {
  try {
    const { profileId, vehicleType, vehicleNumber, licenseNumber, shopIds } = req.body;
    // TODO: In a transaction:
    // 1. Insert rider record
    // 2. Insert rider_shop_assignments for each shopId
    // Also update the profile role to 'rider' in auth.users app_metadata via supabaseAdmin.auth.admin.updateUserById
    res.status(201).json({ success: true, data: { rider: null, message: 'TODO: implement create rider with shop assignments' } });
  } catch (err) {
    next(err);
  }
}

// ── Analytics ─────────────────────────────────────────────

export async function getAnalyticsOverview(req, res, next) {
  try {
    // TODO: Run aggregated queries for the overview dashboard:
    // - Total orders today / this week / this month
    // - Total revenue today / this week / this month
    // - Orders by status breakdown
    // - Active riders count
    // - Low-stock items count across all shops
    res.json({
      success: true,
      data: {
        message: 'TODO: implement analytics overview',
        metrics: {
          ordersToday: 0,
          revenueToday: 0,
          activeRiders: 0,
          lowStockItems: 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
