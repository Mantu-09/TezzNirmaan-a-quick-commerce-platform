#!/usr/bin/env node
// ────────────────────────────────────────────────────────────
// Index Products — P6-5
//
// One-time (and re-runnable) script to bulk-populate Typesense
// from the Postgres shop_inventory table.
//
// Usage:
//   node --env-file=.env src/scripts/index-products.js
//
// Safe to re-run — uses { action: 'upsert' } so duplicates are
// overwritten, not duplicated.
// ────────────────────────────────────────────────────────────
import { typesenseClient, PRODUCTS_SCHEMA, isTypesenseEnabled } from '../lib/typesense.js';
import { supabaseAdmin } from '../config/supabase.js';

if (!isTypesenseEnabled()) {
  console.error('TYPESENSE_HOST or TYPESENSE_ADMIN_API_KEY not set. Aborting.');
  process.exit(1);
}

const BATCH_SIZE = 100;

async function buildDocument(item) {
  const p = item.products || {};
  const s = item.shops   || {};
  return {
    id:            item.id,          // shop_inventory.id → Typesense doc ID
    product_id:    p.id || '',
    shop_id:       item.shop_id,
    city_id:       s.city_id || '',
    name:          p.name     || '',
    brand_name:    p.brand_name  || '',
    category_name: p.category_name || '',
    description:   p.description   || '',
    search_text:   [p.name, p.brand_name, p.category_name, p.description]
                     .filter(Boolean).join(' '),
    delivery_tier: p.delivery_tier || '',
    unit:          p.unit          || '',
    shop_name:     s.name          || '',
    price:         item.price      || 0,   // paise
    mrp:           item.mrp        || 0,
    stock_quantity: item.stock_quantity || 0,
    is_listed:     Boolean(item.is_listed),
    is_in_stock:   Boolean(item.is_in_stock),
  };
}

async function indexAllProducts() {
  console.log('▶ Starting Typesense product indexing…');

  // ── 1. (Re)create collection ─────────────────────────────
  console.log('  Dropping existing collection (if any)…');
  try {
    await typesenseClient.collections('products').delete();
    console.log('  ✓ Dropped old collection');
  } catch (e) {
    if (!e.message?.includes('Not Found')) throw e;
    console.log('  ℹ No existing collection found');
  }

  await typesenseClient.collections().create(PRODUCTS_SCHEMA);
  console.log('  ✓ Created collection with schema');

  // ── 2. Fetch all listed inventory from Supabase ───────────
  console.log('  Fetching inventory from Supabase…');

  let allItems = [];
  let rangeFrom = 0;
  const PAGE_SIZE = 1000; // Supabase max per request

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('shop_inventory')
      .select(`
        id, shop_id, price, mrp, stock_quantity, is_in_stock, is_listed,
        products(id, name, brand_name, category_name, description, delivery_tier, unit),
        shops(name, city_id)
      `)
      .eq('is_listed', true)
      .range(rangeFrom, rangeFrom + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    allItems = allItems.concat(data);
    console.log(`  Fetched ${allItems.length} rows…`);
    if (data.length < PAGE_SIZE) break;
    rangeFrom += PAGE_SIZE;
  }

  console.log(`  ✓ Total inventory rows: ${allItems.length}`);

  // ── 3. Transform ──────────────────────────────────────────
  const documents = await Promise.all(allItems.map(buildDocument));

  // ── 4. Batch upsert ───────────────────────────────────────
  let indexed = 0;
  let errors  = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const results = await typesenseClient
      .collections('products')
      .documents()
      .import(batch, { action: 'upsert' });

    // results is an array of { success: bool, error?: string }
    const batchErrors = results.filter(r => !r.success);
    if (batchErrors.length) {
      console.error(`  ✗ ${batchErrors.length} errors in batch ${Math.floor(i / BATCH_SIZE) + 1}:`);
      batchErrors.slice(0, 3).forEach(e => console.error('    ', e.error));
    }

    indexed += batch.length - batchErrors.length;
    errors  += batchErrors.length;
    process.stdout.write(`\r  Indexed ${indexed}/${documents.length}…`);
  }

  console.log(`\n  ✓ Done — ${indexed} documents indexed, ${errors} errors`);
}

indexAllProducts().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
