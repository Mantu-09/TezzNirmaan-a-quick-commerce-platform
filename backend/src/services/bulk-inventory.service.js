// ────────────────────────────────────────────────────────────
// Bulk Inventory Service — P1-D
//
// Parses a CSV file and upserts products + shop_inventory rows.
// Strategy:
//   1. Parse CSV with csv-parse
//   2. For each row: find or create product in master catalog
//   3. Upsert shop_inventory (create if new, update if exists)
//   4. Return { created, updated, errors[] }
// ────────────────────────────────────────────────────────────
import { parse } from 'csv-parse/sync';
import { supabaseAdmin } from '../config/supabase.js';
import { invalidateShopInventoryCache } from './cache.service.js'; // P2-C
import logger from '../utils/logger.js';

// ── CSV Template ─────────────────────────────────────────────
export const CSV_TEMPLATE_HEADER =
  'product_name,brand,category,unit,unit_size,price_inr,mrp_inr,stock_quantity,low_stock_threshold,delivery_tier,description';

export const CSV_TEMPLATE_ROWS = [
  'UltraTech Cement,UltraTech,Construction,bag,50kg,420,450,100,20,scheduled,OPC 53 Grade cement',
  'Asian Paints Tractor Emulsion,Asian Paints,Paints,litre,10,1850,1999,30,10,quick,Interior emulsion paint',
  'Pidilite Fevicol SH,Pidilite,Adhesives,kg,1,180,199,50,15,quick,Synthetic resin adhesive',
];

export const CSV_TEMPLATE = [CSV_TEMPLATE_HEADER, ...CSV_TEMPLATE_ROWS].join('\n');

// ── Validation ────────────────────────────────────────────────
const REQUIRED_COLUMNS = [
  'product_name', 'unit', 'price_inr', 'stock_quantity', 'delivery_tier',
];

const VALID_TIERS = ['quick', 'scheduled'];
const VALID_UNITS = ['bag', 'kg', 'litre', 'box', 'piece', 'bundle', 'roll', 'sheet', 'packet', 'gram', 'ml', 'dozen'];

function validateRow(row, rowIndex) {
  const errors = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!row[col]?.trim()) {
      errors.push(`Column '${col}' is required`);
    }
  }

  const price = parseFloat(row.price_inr);
  if (isNaN(price) || price <= 0) errors.push(`price_inr must be a positive number (got: ${row.price_inr})`);

  const stock = parseInt(row.stock_quantity, 10);
  if (isNaN(stock) || stock < 0) errors.push(`stock_quantity must be a non-negative integer (got: ${row.stock_quantity})`);

  if (row.low_stock_threshold) {
    const lst = parseInt(row.low_stock_threshold, 10);
    if (isNaN(lst) || lst < 0) errors.push(`low_stock_threshold must be a non-negative integer`);
  }

  if (row.delivery_tier && !VALID_TIERS.includes(row.delivery_tier.trim().toLowerCase())) {
    errors.push(`delivery_tier must be 'quick' or 'scheduled' (got: ${row.delivery_tier})`);
  }

  if (row.unit && !VALID_UNITS.includes(row.unit.trim().toLowerCase())) {
    errors.push(`unit '${row.unit}' is not recognized. Valid: ${VALID_UNITS.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

// ── DB helpers ────────────────────────────────────────────────

/** Find a product in the master catalog by name + brand (case-insensitive). */
async function findProductByNameAndBrand(name, brand) {
  const query = supabaseAdmin
    .from('products')
    .select('id, name, brand, delivery_tier')
    .ilike('name', name.trim());

  if (brand?.trim()) query.ilike('brand', brand.trim());

  const { data } = await query.limit(1).maybeSingle();
  return data || null;
}

/** Resolve or create a category row, returning its ID. */
async function resolveCategory(categoryName) {
  if (!categoryName?.trim()) return null;

  const name = categoryName.trim();
  const { data: existing } = await supabaseAdmin
    .from('categories')
    .select('id')
    .ilike('name', name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabaseAdmin
    .from('categories')
    .insert({ name })
    .select('id')
    .single();

  return created?.id || null;
}

/** Create a new product in the master catalog. */
async function createProduct({ name, brand, categoryId, unit, unitSize, deliveryTier, description }) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      name:          name.trim(),
      brand:         brand?.trim() || null,
      category_id:   categoryId,
      unit:          unit.trim().toLowerCase(),
      unit_size:     unitSize?.trim() || null,
      delivery_tier: deliveryTier.trim().toLowerCase(),
      description:   description?.trim() || null,
      is_active:     true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not create product: ${error.message}`);
  return data;
}

/** Check if a shop_inventory row already exists for this shop + product. */
async function getExistingInventoryItem(shopId, productId) {
  const { data } = await supabaseAdmin
    .from('shop_inventory')
    .select('id')
    .eq('shop_id', shopId)
    .eq('product_id', productId)
    .maybeSingle();
  return data || null;
}

// ── Core bulk upload ──────────────────────────────────────────

/**
 * Parse a CSV buffer and upsert inventory for a shop.
 *
 * @param {string}  shopId      — authenticated shop's ID
 * @param {Buffer}  csvBuffer   — raw CSV file buffer from multer
 * @returns {{ created: number, updated: number, errors: Array }}
 */
export async function bulkUploadInventory(shopId, csvBuffer) {
  // 1. Parse CSV
  let records;
  try {
    records = parse(csvBuffer, {
      columns:          true,    // use first row as column names
      skip_empty_lines: true,
      trim:             true,
      bom:              true,    // handle Excel BOM
    });
  } catch (parseErr) {
    throw new Error(`CSV parse error: ${parseErr.message}`);
  }

  if (records.length === 0) {
    throw new Error('CSV file is empty or has no data rows (only a header row was found)');
  }

  if (records.length > 500) {
    throw new Error(`CSV exceeds 500-row limit (got ${records.length} rows). Split into smaller files.`);
  }

  // Check required columns exist
  const firstRow = records[0];
  for (const col of REQUIRED_COLUMNS) {
    if (!(col in firstRow)) {
      throw new Error(`Missing required column: '${col}'. Download the template to see the correct format.`);
    }
  }

  const results = { created: 0, updated: 0, errors: [] };

  // 2. Process each row
  for (const [index, row] of records.entries()) {
    const rowNum = index + 2; // +2: header row + 1-indexed

    try {
      // Validate
      validateRow(row, rowNum);

      const pricePaise = Math.round(parseFloat(row.price_inr) * 100);
      const mrpPaise   = row.mrp_inr ? Math.round(parseFloat(row.mrp_inr) * 100) : null;
      const stockQty   = parseInt(row.stock_quantity, 10);
      const lowStock   = row.low_stock_threshold ? parseInt(row.low_stock_threshold, 10) : 5;

      // Find or create product in master catalog
      let product = await findProductByNameAndBrand(row.product_name, row.brand);

      if (!product) {
        const categoryId = await resolveCategory(row.category);
        product = await createProduct({
          name:          row.product_name,
          brand:         row.brand,
          categoryId,
          unit:          row.unit,
          unitSize:      row.unit_size,
          deliveryTier:  row.delivery_tier,
          description:   row.description,
        });
        logger.info('bulk-upload: created product', { name: row.product_name, productId: product.id });
      }

      // Upsert shop_inventory
      const existing = await getExistingInventoryItem(shopId, product.id);

      if (existing) {
        const { error } = await supabaseAdmin
          .from('shop_inventory')
          .update({
            price:               pricePaise,
            mrp:                 mrpPaise,
            stock_quantity:      stockQty,
            low_stock_threshold: lowStock,
            is_in_stock:         stockQty > 0,
            updated_at:          new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('shop_id', shopId);

        if (error) throw new Error(`DB update failed: ${error.message}`);
        results.updated++;
      } else {
        const { error } = await supabaseAdmin
          .from('shop_inventory')
          .insert({
            shop_id:             shopId,
            product_id:          product.id,
            price:               pricePaise,
            mrp:                 mrpPaise,
            stock_quantity:      stockQty,
            low_stock_threshold: lowStock,
            is_in_stock:         stockQty > 0,
            is_listed:           true,
          });

        if (error) throw new Error(`DB insert failed: ${error.message}`);
        results.created++;
      }
    } catch (err) {
      results.errors.push({
        row:     rowNum,
        message: err.message,
        data:    {
          product_name:  row.product_name,
          price_inr:     row.price_inr,
          stock_quantity: row.stock_quantity,
        },
      });
      logger.warn('bulk-upload: row error', { shopId, rowNum, error: err.message });
    }
  }

  logger.info('bulk-upload: complete', { shopId, ...results });
  // P2-C: flush catalog cache after bulk write so customers see updated stock
  invalidateShopInventoryCache(shopId).catch(() => {});
  return results;
}
