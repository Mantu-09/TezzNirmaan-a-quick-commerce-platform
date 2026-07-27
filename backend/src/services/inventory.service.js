// ────────────────────────────────────────────────────────────
// Inventory Service — P6-5 (Typesense sync added)
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError } from '../utils/errors.js';
import { invalidateShopInventoryCache } from './cache.service.js'; // P2-C
import { syncInventoryItem, deleteInventoryItem } from '../lib/typesense.js'; // P6-5
import logger from '../utils/logger.js';

// ── Helper: fetch joined row for Typesense ────────────────────

async function fetchInventoryForSync(inventoryId) {
  const { data } = await supabaseAdmin
    .from('shop_inventory')
    .select(`
      id, shop_id, price, mrp, stock_quantity, is_in_stock, is_listed,
      products(id, name, brand_name, category_name, description, delivery_tier, unit),
      shops(name, city_id)
    `)
    .eq('id', inventoryId)
    .single();
  return data;
}

/**
 * Get paginated inventory for a shop, joined with full product details.
 */
export async function getInventory(shopId, { search, inStock, page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  let query = supabaseAdmin
    .from('shop_inventory')
    .select('*, products(*, categories(name), brands(name))', { count: 'exact' })
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (inStock !== undefined) query = query.eq('is_in_stock', inStock);

  const { data, error, count } = await query;
  if (error) throw error;
  return { inventory: data, pagination: { page: +page, limit: +limit, total: count } };
}

/**
 * Add a product to a shop's inventory.
 */
export async function addToInventory(shopId, { productId, price, mrp, costPrice, stockQuantity, lowStockThreshold, isListed }) {
  // Validate product exists and is active
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, delivery_tier')
    .eq('id', productId)
    .eq('is_active', true)
    .single();

  if (productError || !product) throw new NotFoundError('Product not found or inactive');

  const { data, error } = await supabaseAdmin
    .from('shop_inventory')
    .insert({
      shop_id:             shopId,
      product_id:          productId,
      price,
      mrp,
      cost_price:          costPrice,
      stock_quantity:      stockQuantity,
      low_stock_threshold: lowStockThreshold ?? 5,
      is_listed:           isListed ?? true,
    })
    .select()
    .single();

  if (error) throw error;

  // P2-C: invalidate Redis cache
  invalidateShopInventoryCache(shopId).catch(() => {});

  // P6-5: sync to Typesense (fire-and-forget, non-fatal)
  if (data?.is_listed) {
    fetchInventoryForSync(data.id)
      .then(row => row && syncInventoryItem(row))
      .catch(err => logger.warn('addToInventory: Typesense sync failed', { error: err.message }));
  }

  return data;
}

/**
 * Update a single inventory item (price, stock, listing status).
 */
export async function updateInventoryItem(inventoryId, shopId, updates) {
  const dbUpdates = { updated_at: new Date().toISOString() };
  if (updates.price            !== undefined) dbUpdates.price            = updates.price;
  if (updates.mrp              !== undefined) dbUpdates.mrp              = updates.mrp;
  if (updates.costPrice        !== undefined) dbUpdates.cost_price       = updates.costPrice;
  if (updates.stockQuantity    !== undefined) dbUpdates.stock_quantity   = updates.stockQuantity;
  if (updates.lowStockThreshold !== undefined) dbUpdates.low_stock_threshold = updates.lowStockThreshold;
  if (updates.isListed         !== undefined) dbUpdates.is_listed        = updates.isListed;

  const { data, error } = await supabaseAdmin
    .from('shop_inventory')
    .update(dbUpdates)
    .eq('id', inventoryId)
    .eq('shop_id', shopId)   // security: validate ownership
    .select()
    .maybeSingle();          // 0 rows → data=null, no PGRST116 error

  if (error) throw error;
  if (!data) throw new NotFoundError('Inventory item not found');

  // P2-C
  invalidateShopInventoryCache(shopId).catch(() => {});

  // P6-5: sync to Typesense
  if (data.is_listed) {
    fetchInventoryForSync(inventoryId)
      .then(row => row && syncInventoryItem(row))
      .catch(err => logger.warn('updateInventoryItem: Typesense sync failed', { error: err.message }));
  } else {
    // If unlisted, remove from search index
    deleteInventoryItem(inventoryId).catch(() => {});
  }

  return data;
}

/**
 * Bulk update inventory items (price and/or stock).
 * All items must belong to the given shopId.
 */
export async function bulkUpdateInventory(shopId, items) {
  const results = [];
  for (const item of items) {
    const result = await updateInventoryItem(item.id, shopId, item);
    results.push(result);
  }
  // Belt-and-suspenders invalidation
  invalidateShopInventoryCache(shopId).catch(() => {});
  return results;
}

/**
 * Remove a product from a shop's inventory (soft delete: set is_listed = false).
 */
export async function removeFromInventory(inventoryId, shopId) {
  const { data, error } = await supabaseAdmin
    .from('shop_inventory')
    .update({ is_listed: false, updated_at: new Date().toISOString() })
    .eq('id', inventoryId)
    .eq('shop_id', shopId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError('Inventory item not found');

  // P2-C
  invalidateShopInventoryCache(shopId).catch(() => {});

  // P6-5: remove from Typesense (soft delete hides from search)
  deleteInventoryItem(inventoryId).catch(() => {});

  return data;
}
