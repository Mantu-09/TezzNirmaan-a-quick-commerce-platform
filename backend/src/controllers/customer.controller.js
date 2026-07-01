// ────────────────────────────────────────────────────────────
// Customer Controller — Real Implementations
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import * as orderService from '../services/order.service.js';
import * as geoService   from '../services/geo.service.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ── Browse & Search ──────────────────────────────────────

export async function getNearbyShops(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const shops = await geoService.findNearbyShops(parseFloat(lat), parseFloat(lng));
    res.json({ success: true, data: { shops, count: shops.length } });
  } catch (err) {
    next(err);
  }
}

export async function getShop(req, res, next) {
  try {
    const { shopId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('shops')
      .select('id, name, slug, phone, email, address_line1, address_line2, city, state, pincode, operating_hours, quick_delivery_radius_km, scheduled_delivery_radius_km, is_accepting_orders, created_at')
      .eq('id', shopId)
      .eq('is_active', true)
      .single();
    if (error || !data) throw new NotFoundError('Shop not found');
    res.json({ success: true, data: { shop: data } });
  } catch (err) {
    next(err);
  }
}

export async function getProducts(req, res, next) {
  try {
    const { shopId } = req.params;
    const { category, search, tier, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;

    let query = supabaseAdmin
      .from('shop_inventory')
      .select(`
        id, price, mrp, stock_quantity, is_in_stock, is_listed,
        products!inner(
          id, name, slug, description, delivery_tier, unit,
          weight_kg, is_bulk, gst_percent, images,
          categories(id, name, slug),
          brands(id, name)
        )
      `, { count: 'exact' })
      .eq('shop_id', shopId)
      .eq('is_listed', true)
      .eq('is_in_stock', true)
      .order('id', { ascending: true })
      .range(from, from + Number(limit) - 1);

    if (category)  query = query.eq('products.category_id', category);
    if (tier)      query = query.eq('products.delivery_tier', tier);
    if (search) {
      // Full-text search on products.search_vector
      query = query.textSearch('products.search_vector', search, { type: 'plain', config: 'simple' });
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: {
        products: data,
        pagination: { page: +page, limit: +limit, total: count },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req, res, next) {
  try {
    const { shopId, productId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('shop_inventory')
      .select(`
        id, price, mrp, stock_quantity, is_in_stock, is_listed,
        products!inner(
          id, name, slug, description, delivery_tier, unit,
          weight_kg, is_bulk, gst_percent, images, hsn_code,
          categories(id, name, slug),
          brands(id, name)
        )
      `)
      .eq('shop_id', shopId)
      .eq('product_id', productId)
      .single();
    if (error || !data) throw new NotFoundError('Product not found in this shop');
    res.json({ success: true, data: { product: data } });
  } catch (err) {
    next(err);
  }
}

export async function getCategories(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, slug, description, parent_id, image_url')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: { categories: data } });
  } catch (err) {
    next(err);
  }
}

// ── Cart ──────────────────────────────────────────────────

export async function getCart(req, res, next) {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select(`
        id, quantity, shop_id, created_at,
        products!inner(id, name, slug, delivery_tier, unit, images, gst_percent),
        shop_inventory!inner(id, price, mrp, is_in_stock, is_listed)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const quickItems     = data.filter(i => i.products.delivery_tier === 'quick');
    const scheduledItems = data.filter(i => i.products.delivery_tier === 'scheduled');

    res.json({ success: true, data: { items: data, quickItems, scheduledItems, count: data.length } });
  } catch (err) {
    next(err);
  }
}

export async function addToCart(req, res, next) {
  try {
    const userId = req.user.id;
    const { shopId, productId, quantity } = req.body;

    // Validate inventory exists and is in stock (server-side validation)
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('shop_inventory')
      .select('id, price, is_in_stock, is_listed, stock_quantity')
      .eq('shop_id', shopId)
      .eq('product_id', productId)
      .single();

    if (invErr || !inv) throw new AppError('Product not available in this shop', 404);
    if (!inv.is_listed)  throw new AppError('Product is not available', 400);
    if (!inv.is_in_stock) throw new AppError('Product is out of stock', 400);
    if (quantity > inv.stock_quantity) {
      throw new AppError(`Only ${inv.stock_quantity} units available`, 400);
    }

    // Upsert cart item
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .upsert({
        user_id:    userId,
        shop_id:    shopId,
        product_id: productId,
        quantity,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,shop_id,product_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data: { item: data } });
  } catch (err) {
    next(err);
  }
}

export async function updateCartItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    // Fetch cart item to get product info for stock check
    const { data: cartItem, error: fetchErr } = await supabaseAdmin
      .from('cart_items')
      .select('id, shop_id, product_id')
      .eq('id', itemId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !cartItem) throw new NotFoundError('Cart item not found');

    // Validate stock
    const { data: inv } = await supabaseAdmin
      .from('shop_inventory')
      .select('stock_quantity, is_in_stock')
      .eq('shop_id', cartItem.shop_id)
      .eq('product_id', cartItem.product_id)
      .single();

    if (!inv?.is_in_stock) throw new AppError('Product is now out of stock', 400);
    if (quantity > inv.stock_quantity) throw new AppError(`Only ${inv.stock_quantity} units available`, 400);

    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: { item: data } });
  } catch (err) {
    next(err);
  }
}

export async function removeCartItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { error } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, data: { message: 'Item removed from cart' } });
  } catch (err) {
    next(err);
  }
}

export async function clearCart(req, res, next) {
  try {
    const userId = req.user.id;
    const { error } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, data: { message: 'Cart cleared' } });
  } catch (err) {
    next(err);
  }
}

// ── Checkout & Orders ─────────────────────────────────────

export async function previewOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;
    const preview = await orderService.previewOrder(userId, addressId);
    res.json({ success: true, data: { preview } });
  } catch (err) {
    next(err);
  }
}

export async function placeOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethod, notes, scheduledSlot } = req.body;

    logger.info('Place order request', { userId, paymentMethod });
    const result = await orderService.placeOrder(userId, { addressId, paymentMethod, notes, scheduledSlot });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getOrders(req, res, next) {
  try {
    const userId = req.user.id;
    const { page, limit } = req.query;
    const result = await orderService.getOrders(userId, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const order = await orderService.getOrder(orderId, userId);
    res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { reason } = req.body;
    const result = await orderService.cancelOrder(orderId, userId, reason);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Addresses ─────────────────────────────────────────────

export async function getAddresses(req, res, next) {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('addresses')
      .select('id, label, full_name, phone, address_line1, address_line2, landmark, city, state, pincode, is_default, created_at')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { addresses: data } });
  } catch (err) {
    next(err);
  }
}

export async function createAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const { label, fullName, phone, addressLine1, addressLine2, landmark,
            city, state, pincode, location, isDefault } = req.body;

    // If setting as default, unset previous default first
    if (isDefault) {
      await supabaseAdmin
        .from('addresses')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_default', true);
    }

    const insertData = {
      user_id:       userId,
      label:         label || 'Home',
      full_name:     fullName,
      phone,
      address_line1: addressLine1,
      address_line2: addressLine2 || null,
      landmark:      landmark || null,
      city:          city || 'Patna',
      state:         state || 'Bihar',
      pincode,
      is_default:    isDefault || false,
    };

    const { data, error } = await supabaseAdmin
      .from('addresses')
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { address: data } });
  } catch (err) {
    next(err);
  }
}

export async function updateAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const { id }  = req.params;
    const updates = req.body;

    if (updates.isDefault) {
      await supabaseAdmin
        .from('addresses')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_default', true);
    }

    // Map camelCase → snake_case
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (updates.label         !== undefined) dbUpdates.label          = updates.label;
    if (updates.fullName      !== undefined) dbUpdates.full_name      = updates.fullName;
    if (updates.phone         !== undefined) dbUpdates.phone          = updates.phone;
    if (updates.addressLine1  !== undefined) dbUpdates.address_line1  = updates.addressLine1;
    if (updates.addressLine2  !== undefined) dbUpdates.address_line2  = updates.addressLine2;
    if (updates.landmark      !== undefined) dbUpdates.landmark       = updates.landmark;
    if (updates.city          !== undefined) dbUpdates.city           = updates.city;
    if (updates.state         !== undefined) dbUpdates.state          = updates.state;
    if (updates.pincode       !== undefined) dbUpdates.pincode        = updates.pincode;
    if (updates.isDefault     !== undefined) dbUpdates.is_default     = updates.isDefault;

    const { data, error } = await supabaseAdmin
      .from('addresses')
      .update(dbUpdates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error || !data) throw new NotFoundError('Address not found');
    res.json({ success: true, data: { address: data } });
  } catch (err) {
    next(err);
  }
}

export async function deleteAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, data: { message: 'Address deleted' } });
  } catch (err) {
    next(err);
  }
}

// ── Profile ───────────────────────────────────────────────

export async function getProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone, email, avatar_url, role, created_at')
      .eq('id', userId)
      .single();
    if (error || !data) throw new NotFoundError('Profile not found');
    res.json({ success: true, data: { profile: data } });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { fullName, email, avatarUrl } = req.body;
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (fullName  !== undefined) dbUpdates.full_name   = fullName;
    if (email     !== undefined) dbUpdates.email       = email;
    if (avatarUrl !== undefined) dbUpdates.avatar_url  = avatarUrl;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(dbUpdates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data: { profile: data } });
  } catch (err) {
    next(err);
  }
}
