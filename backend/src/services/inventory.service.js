// ────────────────────────────────────────────────────────────
// Inventory Service
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Get paginated inventory for a shop, joined with full product details.
 */
export async function getInventory(shopId, { search, inStock, page = 1, limit = 20 } = {}) {
  // TODO:
  // SELECT shop_inventory.*, products(*, categories(name), brands(name))
  // WHERE shop_id = shopId
  // Optionally filter: is_in_stock = inStock (if provided)
  // Optionally full-text search on products.search_vector (if search provided)
  // ORDER BY products.name ASC
  // LIMIT / OFFSET pagination
  const from = (page - 1) * limit;
  let query = supabaseAdmin
    .from('shop_inventory')
    .select('*, products(*, categories(name), brands(name))', { count: 'exact' })
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (inStock !== undefined) query = query.eq('is_in_stock', inStock);
  // Note: text search across joined table requires a view or RPC in production

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
      shop_id: shopId,
      product_id: productId,
      price,
      mrp,
      cost_price: costPrice,
      stock_quantity: stockQuantity,
      low_stock_threshold: lowStockThreshold ?? 5,
      is_listed: isListed ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a single inventory item (price, stock, listing status).
 */
export async function updateInventoryItem(inventoryId, shopId, updates) {
  const dbUpdates = { updated_at: new Date().toISOString() };
  if (updates.price !== undefined) dbUpdates.price = updates.price;
  if (updates.mrp !== undefined) dbUpdates.mrp = updates.mrp;
  if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
  if (updates.stockQuantity !== undefined) dbUpdates.stock_quantity = updates.stockQuantity;
  if (updates.lowStockThreshold !== undefined) dbUpdates.low_stock_threshold = updates.lowStockThreshold;
  if (updates.isListed !== undefined) dbUpdates.is_listed = updates.isListed;

  const { data, error } = await supabaseAdmin
    .from('shop_inventory')
    .update(dbUpdates)
    .eq('id', inventoryId)
    .eq('shop_id', shopId)   // security: validate ownership
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError('Inventory item not found');
  return data;
}

/**
 * Bulk update inventory items (price and/or stock).
 * All items must belong to the given shopId.
 */
export async function bulkUpdateInventory(shopId, items) {
  // TODO: For true atomicity, wrap in a Postgres function (RPC).
  // For V1: sequential updates (acceptable for small pilot inventory).
  const results = [];
  for (const item of items) {
    const result = await updateInventoryItem(item.id, shopId, item);
    results.push(result);
  }
  return results;
}

/**
 * Remove a product from a shop's inventory (soft delete: set is_listed = false).
 */
export async function removeFromInventory(inventoryId, shopId) {
  // Soft delete: hide the product without losing order history references
  const { data, error } = await supabaseAdmin
    .from('shop_inventory')
    .update({ is_listed: false, updated_at: new Date().toISOString() })
    .eq('id', inventoryId)
    .eq('shop_id', shopId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError('Inventory item not found');
  return data;
}
