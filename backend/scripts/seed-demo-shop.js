/**
 * Dev-only seed script — creates a complete demo shop owner account.
 *
 * Usage:
 *   node scripts/seed-demo-shop.js
 *
 * Creates:
 *   👤 Shop Owner — phone: +919000000001 | password: TezzDev@2024
 *   🏪 Demo Shop  — "Sharma Hardware" in Patna, Bhagalpur-ready
 *   📦 5 sample products in inventory
 *
 * Safe to run multiple times — skips if account already exists.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Demo Credentials ─────────────────────────────────────────
const DEMO_PHONE    = '+919000000001';
const DEMO_PASSWORD = 'TezzDev@2024';
const DEMO_EMAIL    = `${DEMO_PHONE.replace('+', '')}@tezznirmaan.internal`;

const DEMO_SHOP = {
  name:         'Sharma Hardware — Demo',
  address:      '12-A, Ashok Rajpath, Patna, Bihar 800004',
  city:         'Patna',
  gstin:        '10AABCS1429B1ZP',
  phone:        DEMO_PHONE,
  lat:          25.5961,
  lng:          85.1409,
  is_active:    true,
  is_verified:  true,
};

const DEMO_PRODUCTS = [
  { name: 'OPC 43 Cement (50 kg bag)',  category: 'cement',    price_paise:  42000, mrp_paise:  45000, stock: 500, unit: 'bag'  },
  { name: 'Tata Tiscon TMT Rod 8mm',    category: 'steel',     price_paise: 310000, mrp_paise: 320000, stock: 200, unit: 'piece'},
  { name: 'Asian Paints Emulsion 4L',   category: 'paint',     price_paise:  95000, mrp_paise: 105000, stock: 80,  unit: 'tin'  },
  { name: 'Kajaria Floor Tile 2x2 ft',  category: 'tiles',     price_paise:  55000, mrp_paise:  60000, stock: 300, unit: 'box'  },
  { name: 'Havells Switch 6A (box/10)', category: 'electrical',price_paise:  18000, mrp_paise:  22000, stock: 150, unit: 'box'  },
];

// ── Helper ────────────────────────────────────────────────────
function log(emoji, msg, detail = '') {
  console.log(`${emoji}  ${msg}${detail ? `  →  ${detail}` : ''}`);
}

// ── Main ──────────────────────────────────────────────────────
async function seed() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TezzNirmaan — Dev Seed Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── 1. Auth user ─────────────────────────────────────────
  log('🔍', 'Checking if demo auth user exists…');
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('listUsers failed:', listErr.message); process.exit(1); }

  let userId;
  const existing = users.find(u => u.email === DEMO_EMAIL);

  if (existing) {
    userId = existing.id;
    log('✅', 'Auth user already exists — updating password', userId);
    const { error: upErr } = await supabase.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      app_metadata: { role: 'shop_owner' },
    });
    if (upErr) { console.error('updateUser failed:', upErr.message); process.exit(1); }
  } else {
    log('👤', 'Creating auth user…', DEMO_EMAIL);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email:          DEMO_EMAIL,
      password:       DEMO_PASSWORD,
      email_confirm:  true,
      app_metadata:   { role: 'shop_owner' },
      user_metadata:  { phone: DEMO_PHONE },
    });
    if (createErr) { console.error('createUser failed:', createErr.message); process.exit(1); }
    userId = created.user.id;
    log('✅', 'Auth user created', userId);
  }

  // ── 2. Profile ────────────────────────────────────────────
  log('👤', 'Upserting profile…');
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id:             userId,
    phone:          DEMO_PHONE,
    full_name:      'Demo Shop Owner',
    role:           'shop_owner',
    setup_complete: true,
  }, { onConflict: 'id' });
  if (profileErr) { console.error('profile upsert failed:', profileErr.message); process.exit(1); }
  log('✅', 'Profile upserted');

  // ── 3. Shop ───────────────────────────────────────────────
  log('🏪', 'Checking/creating shop…');
  const { data: existingShop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();

  let shopId;
  if (existingShop) {
    shopId = existingShop.id;
    log('✅', 'Shop already exists', shopId);
  } else {
    const { data: shop, error: shopErr } = await supabase.from('shops').insert({
      owner_id:    userId,
      name:        DEMO_SHOP.name,
      address:     DEMO_SHOP.address,
      city:        DEMO_SHOP.city,
      gstin:       DEMO_SHOP.gstin,
      phone:       DEMO_SHOP.phone,
      lat:         DEMO_SHOP.lat,
      lng:         DEMO_SHOP.lng,
      is_active:   DEMO_SHOP.is_active,
      is_verified: DEMO_SHOP.is_verified,
    }).select('id').single();
    if (shopErr) { console.error('shop insert failed:', shopErr.message); process.exit(1); }
    shopId = shop.id;
    log('✅', 'Shop created', shopId);
  }

  // Update profile with shop_id
  await supabase.from('profiles').update({ shop_id: shopId }).eq('id', userId);

  // ── 4. Inventory ──────────────────────────────────────────
  log('📦', 'Seeding inventory products…');
  for (const product of DEMO_PRODUCTS) {
    const { data: exists } = await supabase
      .from('shop_inventory')
      .select('id')
      .eq('shop_id', shopId)
      .eq('name', product.name)
      .maybeSingle();

    if (exists) {
      log('  ⏭️ ', `Skipped (exists): ${product.name}`);
      continue;
    }

    const { error: invErr } = await supabase.from('shop_inventory').insert({
      shop_id:       shopId,
      name:          product.name,
      category:      product.category,
      price:         product.price_paise,
      mrp:           product.mrp_paise,
      stock_quantity: product.stock,
      unit:          product.unit,
      delivery_tier: 'standard',
      is_available:  true,
    });
    if (invErr) {
      log('  ⚠️ ', `Failed: ${product.name}`, invErr.message);
    } else {
      log('  ✅', `Added: ${product.name}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅  DEMO SEED COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`
  Dashboard Login Credentials
  ───────────────────────────
  URL       : http://localhost:3001/login
  Phone     : 9000000001   (+91 prefix added automatically)
  Password  : TezzDev@2024
  Role      : shop_owner
  Shop      : Sharma Hardware — Demo (Patna)

  ⚠️  DELETE this account before production launch.
      Run: node scripts/delete-demo-shop.js
`);
}

seed().catch(err => {
  console.error('Seed script crashed:', err);
  process.exit(1);
});
