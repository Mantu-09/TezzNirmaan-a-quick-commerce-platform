// ────────────────────────────────────────────────────────────
// Shop Dashboard Controller
//
// All routes in this controller require the `requireShopAccess`
// middleware, which resolves and attaches `req.shopId`.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import * as orderService     from '../services/order.service.js';
import * as inventoryService from '../services/inventory.service.js';
import * as deliveryService  from '../services/delivery.service.js';
import * as shopService      from '../services/shop.service.js';
import { getCachedShopInventory } from '../services/cache.service.js'; // P2-C
import { NotFoundError, AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ── Order Management ──────────────────────────────────────

export async function getShopOrders(req, res, next) {
  try {
    const shopId = req.shopId;
    const { status, tier, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;

    let query = supabaseAdmin
      .from('sub_orders')
      .select(`
        id, sub_order_number, delivery_tier, status, total_amount,
        estimated_delivery_at, confirmed_at, preparing_at, ready_at,
        created_at, updated_at,
        orders!inner(
          id, order_number, shop_id, placed_at, notes,
          delivery_address_snapshot,
          profiles!customer_id(full_name, phone)
        ),
        order_items(id)
      `, { count: 'exact' })
      .eq('orders.shop_id', shopId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      query = statuses.length === 1
        ? query.eq('status', statuses[0])
        : query.in('status', statuses);
    }
    if (tier) query = query.eq('delivery_tier', tier);


    const { data, error, count } = await query;
    if (error) throw error;

    // Annotate each sub-order with item count for quick display
    const subOrders = (data || []).map(so => ({
      ...so,
      item_count: so.order_items?.length || 0,
    }));

    res.json({
      success: true,
      data: {
        subOrders,
        pagination: { page: +page, limit: +limit, total: count, hasMore: count > page * limit },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getSubOrderDetail(req, res, next) {
  try {
    const shopId      = req.shopId;
    const { subOrderId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('sub_orders')
      .select(`
        *,
        order_items(*),
        orders!inner(
          id, order_number, shop_id, placed_at, notes,
          payment_method, delivery_address_snapshot,
          profiles!customer_id(id, full_name, phone)
        ),
        delivery_assignments(
          id, assigned_at, accepted_at, picked_up_at, delivered_at,
          delivery_otp, is_active,
          riders(
            id, vehicle_type, vehicle_number,
            profiles!profile_id(full_name, phone)
          )
        )
      `)
      .eq('id', subOrderId)
      .eq('orders.shop_id', shopId)
      .single();

    if (error || !data) throw new NotFoundError('Sub-order not found');

    res.json({ success: true, data: { subOrder: data } });
  } catch (err) {
    next(err);
  }
}

export async function confirmSubOrder(req, res, next) {
  try {
    const shopId  = req.shopId;
    const { subOrderId } = req.params;
    const userRole = req.user.role;

    const result = await orderService.updateSubOrderStatus(
      subOrderId, 'confirmed', userRole, shopId
    );

    logger.info('Sub-order confirmed', { subOrderId, shopId, role: userRole });
    res.json({ success: true, data: { message: 'Sub-order confirmed', ...result } });
  } catch (err) {
    next(err);
  }
}

export async function rejectSubOrder(req, res, next) {
  try {
    const shopId  = req.shopId;
    const { subOrderId } = req.params;
    const { reason } = req.body;
    const userRole   = req.user.role;

    const result = await orderService.updateSubOrderStatus(
      subOrderId, 'rejected', userRole, shopId, { reason }
    );

    logger.info('Sub-order rejected', { subOrderId, shopId, reason });
    res.json({ success: true, data: { message: 'Sub-order rejected', ...result } });
  } catch (err) {
    next(err);
  }
}

export async function markPreparing(req, res, next) {
  try {
    const shopId  = req.shopId;
    const { subOrderId } = req.params;
    const userRole = req.user.role;

    const result = await orderService.updateSubOrderStatus(
      subOrderId, 'preparing', userRole, shopId
    );

    res.json({ success: true, data: { message: 'Sub-order marked as preparing', ...result } });
  } catch (err) {
    next(err);
  }
}

export async function markReady(req, res, next) {
  try {
    const shopId  = req.shopId;
    const { subOrderId } = req.params;
    const userRole = req.user.role;

    const result = await orderService.updateSubOrderStatus(
      subOrderId, 'ready_for_pickup', userRole, shopId
    );

    res.json({ success: true, data: { message: 'Sub-order ready for pickup', ...result } });
  } catch (err) {
    next(err);
  }
}

export async function assignRider(req, res, next) {
  try {
    const shopId  = req.shopId;
    const { subOrderId } = req.params;
    // Dashboard sends riderId as rider_id (snake_case) from api.js line 66
    const riderId    = req.body.riderId || req.body.rider_id;
    const assignedBy = req.user.id;

    if (!riderId) throw new AppError('riderId is required', 400);

    const assignment = await deliveryService.assignRider(
      subOrderId, riderId, assignedBy, shopId
    );

    logger.info('Rider assigned', { subOrderId, riderId, shopId });
    res.json({
      success: true,
      data: { message: 'Rider assigned', subOrderId, riderId, assignment },
    });
  } catch (err) {
    next(err);
  }
}

// ── Riders for this shop (used by dashboard assignment dropdown) ──

export async function getShopRiders(req, res, next) {
  try {
    const shopId = req.shopId;

    const { data, error } = await supabaseAdmin
      .from('rider_shop_assignments')
      .select(`
        rider_id,
        riders(
          id, vehicle_type, vehicle_number, status, is_active,
          profiles!profile_id(id, full_name, phone)
        )
      `)
      .eq('shop_id', shopId)
      .eq('is_active', true);

    if (error) throw error;

    // Flatten: return riders directly, not nested inside assignment records
    const riders = (data || [])
      .map(a => a.riders)
      .filter(Boolean)
      .filter(r => r.is_active);

    res.json({ success: true, data: { riders } });
  } catch (err) {
    next(err);
  }
}

// ── Inventory Management ──────────────────────────────────

export async function getInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { search, inStock, page, limit } = req.query;

    // Convert inStock string query param to boolean
    const inStockBool = inStock === 'true' ? true : inStock === 'false' ? false : undefined;
    const pageNum     = page  ? +page  : 1;
    const limitNum    = limit ? +limit : 20;

    // P2-C: Cache only the default "show everything" fetch (page 1, no filter,
    // no search). Filtered / searched / paginated requests skip the cache to
    // avoid serving stale filtered views.
    const isDefaultFetch = !search && inStockBool === undefined && pageNum === 1 && limitNum === 20;

    let result;
    if (isDefaultFetch) {
      result = await getCachedShopInventory(shopId, () =>
        inventoryService.getInventory(shopId, { page: 1, limit: 20 })
      );
    } else {
      result = await inventoryService.getInventory(shopId, {
        search,
        inStock: inStockBool,
        page:    pageNum,
        limit:   limitNum,
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function addToInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    // Accept both camelCase (from mobile) and snake_case (from dashboard API)
    const {
      productId   = req.body.product_id,
      price,
      mrp,
      costPrice   = req.body.cost_price,
      stockQuantity = req.body.stock_quantity,
      lowStockThreshold = req.body.low_stock_threshold,
      isListed    = req.body.is_listed,
    } = req.body;

    const item = await inventoryService.addToInventory(shopId, {
      productId, price, mrp, costPrice, stockQuantity, lowStockThreshold, isListed,
    });

    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updateInventoryItem(req, res, next) {
  try {
    const shopId = req.shopId;
    const { inventoryId } = req.params;

    // Dashboard API sends snake_case: stock_quantity, is_in_stock, is_listed
    // inventoryService.updateInventoryItem expects camelCase
    // Map incoming snake_case fields to the camelCase the service expects
    const rawUpdates = req.body;
    const updates = {
      price:             rawUpdates.price,
      mrp:               rawUpdates.mrp,
      costPrice:         rawUpdates.cost_price   ?? rawUpdates.costPrice,
      stockQuantity:     rawUpdates.stock_quantity ?? rawUpdates.stockQuantity,
      isListed:          rawUpdates.is_listed      ?? rawUpdates.isListed,
      lowStockThreshold: rawUpdates.low_stock_threshold ?? rawUpdates.lowStockThreshold,
    };

    // Remove undefined keys so the service doesn't overwrite with undefined
    Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

    const item = await inventoryService.updateInventoryItem(inventoryId, shopId, updates);
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function bulkUpdateInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('items array is required', 400);
    }

    const results = await inventoryService.bulkUpdateInventory(shopId, items);
    res.json({ success: true, data: { updated: results.length, items: results } });
  } catch (err) {
    next(err);
  }
}

export async function removeFromInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { inventoryId } = req.params;

    await inventoryService.removeFromInventory(inventoryId, shopId);
    res.json({ success: true, data: { message: 'Product removed from inventory' } });
  } catch (err) {
    next(err);
  }
}

// ── Shop Settings ─────────────────────────────────────────

export async function getShopSettings(req, res, next) {
  try {
    const shopId = req.shopId;
    const shop   = await shopService.getShopById(shopId);
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

export async function updateShopSettings(req, res, next) {
  try {
    const shopId = req.shopId;
    const raw    = req.body;

    // Accept both camelCase and snake_case from dashboard/mobile
    // shopService.updateShop works on snake_case keys
    const payload = {
      name:                         raw.name,
      description:                  raw.description,
      phone:                        raw.phone,
      email:                        raw.email,
      address_line1:                raw.addressLine1              ?? raw.address_line1,
      address_line2:                raw.addressLine2              ?? raw.address_line2,
      city:                         raw.city,
      state:                        raw.state,
      pincode:                      raw.pincode,
      quick_delivery_radius_km:     raw.quickDeliveryRadiusKm    ?? raw.quick_delivery_radius_km,
      scheduled_delivery_radius_km: raw.scheduledDeliveryRadiusKm ?? raw.scheduled_delivery_radius_km,
      operating_hours:              raw.operatingHours            ?? raw.operating_hours,
      logo_url:                     raw.logoUrl                   ?? raw.logo_url,
    };

    // Remove undefined keys — shopService.updateShop only writes provided fields
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const shop = await shopService.updateShop(shopId, payload);
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

export async function toggleOrders(req, res, next) {
  try {
    const shopId = req.shopId;

    // Fetch current value
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('shops')
      .select('is_accepting_orders')
      .eq('id', shopId)
      .single();

    if (fetchErr || !current) throw new NotFoundError('Shop not found');

    const newValue = !current.is_accepting_orders;

    const { data: shop, error: updateErr } = await supabaseAdmin
      .from('shops')
      .update({ is_accepting_orders: newValue, updated_at: new Date().toISOString() })
      .eq('id', shopId)
      .select('id, is_accepting_orders')
      .single();

    if (updateErr) throw updateErr;

    logger.info('Shop order acceptance toggled', { shopId, isAcceptingOrders: newValue });
    res.json({
      success: true,
      data: {
        isAcceptingOrders: shop.is_accepting_orders,
        message: shop.is_accepting_orders
          ? 'Shop is now accepting orders'
          : 'Shop has paused new orders',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── B2: Onboarding — GET /shop/me ─────────────────────────────
// Used by mobile onboarding flow. Requires only 'authenticate';
// does NOT need requireShopAccess so a new owner with no shopId cookie works.
export async function getMyShop(req, res, next) {
  try {
    const { data: shop, error } = await supabaseAdmin
      .from('shops')
      .select('*')
      .eq('owner_id', req.user.id)
      .single();
    if (error || !shop) {
      return res.status(404).json({ success: false, error: { message: 'Shop not found for this owner' } });
    }
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

// ── B2: Onboarding — PATCH /shop/me ───────────────────────────
// Lets owner update shop details during onboarding.
export async function updateMyShop(req, res, next) {
  try {
    const allowedFields = ['name', 'phone', 'description', 'operating_hours', 'is_accepting_orders'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updated_at = new Date().toISOString();

    const { data: shop, error } = await supabaseAdmin
      .from('shops')
      .update(updates)
      .eq('owner_id', req.user.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

// ── P5-5C: Order Export — GET /shop/orders/export ─────────────
// Returns a CSV file of orders in the requested date range.
// Supports: ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
// Scoped to the authenticated shop via requireShopAccess.
//
// CSV columns: Order #, Date, Items, Total (₹), Status, Payment
// Row totals are in rupees (not paise) for easy accounting.
export async function exportShopOrders(req, res, next) {
  try {
    const shopId = req.shopId;
    const { from, to, format: fmt = 'csv' } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: '`from` and `to` query params are required (YYYY-MM-DD)' });
    }

    // Clamp range to 90 days to avoid timeout / OOM on huge shops
    const fromDate = new Date(from);
    const toDate   = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format — use YYYY-MM-DD' });
    }
    const rangeMs = toDate.getTime() - fromDate.getTime();
    if (rangeMs > 90 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ success: false, message: 'Date range cannot exceed 90 days' });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        order_number, created_at, total_amount_paise, status, payment_method,
        order_items(
          quantity, unit_price,
          products(name)
        )
      `)
      .eq('shop_id', shopId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', new Date(toDate.getTime() + 86400000).toISOString()) // inclusive end
      .order('created_at', { ascending: false })
      .limit(5000); // safety cap

    if (error) throw error;

    const rows = (orders || []).map(o => {
      const itemStr = (o.order_items || [])
        .map(i => `${i.products?.name || 'Item'} ×${i.quantity}`)
        .join('; ');
      // Quote fields that may contain commas
      const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;
      return [
        o.order_number,
        new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
        quote(itemStr),
        ((o.total_amount_paise || 0) / 100).toFixed(2),
        o.status,
        o.payment_method || 'cod',
      ].join(',');
    });

    const csvHeader = 'Order #,Date,Items,Total (₹),Status,Payment';
    const csv = [csvHeader, ...rows].join('\n');

    const filename = `orders_${from}_to_${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM for Excel compatibility
  } catch (err) {
    next(err);
  }
}
