// ────────────────────────────────────────────────────────────
// Test Setup — P0-C
//
// Connects to the TEST Supabase project (separate from prod).
// Exports helper factories for seeding test data and
// provides global beforeAll / afterAll hooks.
//
// Required env vars (set in .env.test):
//   TEST_SUPABASE_URL
//   TEST_SUPABASE_ANON_KEY
//   TEST_SUPABASE_SERVICE_KEY
//
// IMPORTANT: Never use production Supabase project for tests.
// Create a separate Supabase project named "tezznirmaan-test".
// ────────────────────────────────────────────────────────────
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Supabase clients ─────────────────────────────────────────

const testUrl        = process.env.TEST_SUPABASE_URL        || process.env.SUPABASE_URL;
const testAnonKey    = process.env.TEST_SUPABASE_ANON_KEY   || process.env.SUPABASE_ANON_KEY;
const testServiceKey = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!testUrl || !testServiceKey) {
  console.warn(
    '⚠️  TEST_SUPABASE_URL or TEST_SUPABASE_SERVICE_KEY not set. ' +
    'Falling back to production credentials — DANGEROUS if not a test DB!\n' +
    'Create a separate Supabase project and set TEST_SUPABASE_* env vars.'
  );
}

/** Admin client — bypasses RLS; use for seeding and cleanup only */
export const testAdmin = createClient(testUrl, testServiceKey, {
  auth: { persistSession: false },
});

/** Anon client — respects RLS; use in tests to simulate real API calls */
export const testAnon = createClient(testUrl, testAnonKey, {
  auth: { persistSession: false },
});

// ── Helper: get JWT for a test user ──────────────────────────

/**
 * Signs in with email+password (the internal email alias) and returns
 * the access token for use in Authorization headers.
 */
export async function getAuthToken(email, password) {
  const { data, error } = await testAnon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return data.session.access_token;
}

// ── Unique suffix generator ────────────────────────────────────
// For default callers: timestamp + 4 hex chars = unique per millisecond.
// For explicit callers (e.g. authorization.test.js passes 901001): the
// numeric suffix is used directly — phone takes its last 9 digits.
function nextSuffix() {
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${Date.now()}${rand}`;
}

/**
 * Makes a valid 13-char E.164 Indian number from any suffix.
 * Takes last 9 chars of the NUMERIC portion, prefixed with a type digit.
 * type: 9=customer, 8=shop, 7=rider
 */
function makePhone(suffix, type) {
  // Keep only digits from suffix, take last 9, pad left if shorter
  const digits = String(suffix).replace(/\D/g, '');
  const last9  = digits.slice(-9).padStart(9, '0');
  return `+91${type}${last9}`; // +91 + 1 digit + 9 digits = 13 chars ✓
}

/**
 * Cascade-safe cleanup for any test user.
 * Must run BEFORE createUser — deletes riders/shops/profiles first,
 * then the auth user. Avoids FK cascade violations.
 */
async function cleanupStaleUser(email) {
  const { data: all } = await testAdmin.auth.admin.listUsers({ perPage: 1000 });
  const stale = (all?.users || []).filter(u => u.email === email);
  for (const u of stale) {
    const uid = u.id;

    // 1. Delete order_items → sub_orders → orders (customer FK prevents profile delete)
    const { data: orders } = await testAdmin.from('orders').select('id').eq('customer_id', uid);
    if (orders?.length) {
      const orderIds = orders.map(o => o.id);
      const { data: subs } = await testAdmin.from('sub_orders').select('id').in('order_id', orderIds);
      if (subs?.length) {
        await testAdmin.from('order_items').delete().in('sub_order_id', subs.map(s => s.id));
      }
      await testAdmin.from('sub_orders').delete().in('order_id', orderIds);
      await testAdmin.from('orders').delete().in('id', orderIds);
    }

    // 2. Delete addresses (FK to profiles)
    await testAdmin.from('addresses').delete().eq('user_id', uid);

    // 3. Delete shop inventory + shop (FK to profiles via owner_id)
    const { data: shops } = await testAdmin.from('shops').select('id').eq('owner_id', uid);
    if (shops?.length) {
      const shopIds = shops.map(s => s.id);
      // sub_orders has no shop_id — join via orders.shop_id
      const { data: shopOrders } = await testAdmin
        .from('orders').select('id').in('shop_id', shopIds);
      if (shopOrders?.length) {
        const shopOrderIds = shopOrders.map(o => o.id);
        const { data: shopSubs } = await testAdmin
          .from('sub_orders').select('id').in('order_id', shopOrderIds);
        if (shopSubs?.length) {
          await testAdmin.from('order_items').delete()
            .in('sub_order_id', shopSubs.map(s => s.id));
        }
        await testAdmin.from('sub_orders').delete().in('order_id', shopOrderIds);
        await testAdmin.from('orders').delete().in('id', shopOrderIds);
      }
      await testAdmin.from('shop_inventory').delete().in('shop_id', shopIds);
      await testAdmin.from('shops').delete().in('id', shopIds);
    }

    // 4. Delete rider record
    await testAdmin.from('riders').delete().eq('profile_id', uid);

    // 5. Delete profile and auth user
    await testAdmin.from('profiles').delete().eq('id', uid);
    await testAdmin.auth.admin.deleteUser(uid);
  }
}

// ── Seed factories ────────────────────────────────────────────

/**
 * Creates a test customer with a unique phone number.
 * Returns { userId, phone, email, password, token }
 */
export async function createTestCustomer(suffix = nextSuffix()) {
  const phone    = makePhone(suffix, 9); // +919XXXXXXXXX
  const email    = `testcustomer_${suffix}@tezznirmaan.internal`;
  const password = `TestPass123!`;

  await cleanupStaleUser(email);

  const { data: authData, error: authErr } = await testAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
    app_metadata:  { role: 'customer' },
    user_metadata: { full_name: `Test Customer ${suffix}`, phone },
  });
  if (authErr) throw new Error(`createTestCustomer auth: ${authErr.message}`);

  const { error: custProfErr } = await testAdmin.from('profiles').upsert({
    id: authData.user.id, phone, full_name: `Test Customer ${suffix}`,
    role: 'customer', updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (custProfErr) throw new Error(`createTestCustomer profile: ${custProfErr.message}`);

  const token = await getAuthToken(email, password);
  return { userId: authData.user.id, phone, email, password, token };
}

/**
 * Creates a test shop with a shop_owner account.
 * Returns { shopId, ownerId, ownerToken }
 */
export async function createTestShop(suffix = nextSuffix()) {
  const phone    = makePhone(suffix, 8); // +918XXXXXXXXX
  const email    = `testshop_${suffix}@tezznirmaan.internal`;
  const password = `TestPass123!`;
  const slug     = `test-shop-${suffix}`;

  // Cleanup order: shops → profiles → auth.users (FK chain)
  await testAdmin.from('shops').delete().eq('slug', slug);
  await cleanupStaleUser(email);
  // Also clean up orphaned profiles by phone from previous runs
  await testAdmin.from('profiles').delete().eq('phone', phone);

  const { data: authData, error: authErr } = await testAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
    app_metadata:  { role: 'shop_owner' },
    user_metadata: { full_name: `Test Shop Owner ${suffix}`, phone },
  });
  if (authErr) throw new Error(`createTestShop auth: ${authErr.message}`);

  const ownerId = authData.user.id;
  const { error: profErr } = await testAdmin.from('profiles').upsert({
    id: ownerId, phone, full_name: `Test Shop Owner ${suffix}`,
    role: 'shop_owner', updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (profErr) throw new Error(`createTestShop profile: ${profErr.message}`);

  const { data: shop, error: shopErr } = await testAdmin.from('shops').insert({
    owner_id: ownerId,
    name:     `Test Shop ${suffix}`,
    slug,
    phone,
    address_line1: 'Test Address',
    city: 'Patna', state: 'Bihar', pincode: '800001',
    location: 'SRID=4326;POINT(85.1376 25.5941)',
    quick_delivery_radius_km: 5,
    scheduled_delivery_radius_km: 15,
    operating_hours: {},
    is_active: true,
    is_accepting_orders: true,
  }).select().single();
  if (shopErr) throw new Error(`createTestShop shop insert: ${shopErr.message}`);

  const ownerToken = await getAuthToken(email, password);
  return { shopId: shop.id, ownerId, ownerToken, shop };
}

/**
 * Creates a test rider account.
 * Returns { riderId, riderToken }
 */
export async function createTestRider(suffix = nextSuffix()) {
  const phone    = makePhone(suffix, 7); // +917XXXXXXXXX
  const email    = `testrider_${suffix}@tezznirmaan.internal`;
  const password = `TestPass123!`;

  // Cascade-safe cleanup: riders → profiles → auth.users
  await cleanupStaleUser(email);
  // Also clean orphaned profiles by phone
  const { data: orphanProf } = await testAdmin.from('profiles')
    .select('id').eq('phone', phone).maybeSingle();
  if (orphanProf) {
    await testAdmin.from('riders').delete().eq('profile_id', orphanProf.id);
    await testAdmin.from('profiles').delete().eq('id', orphanProf.id);
  }

  const { data: authData, error: authErr } = await testAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
    app_metadata:  { role: 'rider' },
    user_metadata: { full_name: `Test Rider ${suffix}`, phone },
  });
  if (authErr) throw new Error(`createTestRider auth: ${authErr.message}`);

  const riderId = authData.user.id;
  const { error: riderProfErr } = await testAdmin.from('profiles').upsert({
    id: riderId, phone, full_name: `Test Rider ${suffix}`,
    role: 'rider', updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (riderProfErr) throw new Error(`createTestRider profile upsert: ${riderProfErr.message}`);

  // Insert into riders table so the rider can be assigned to orders
  const { error: riderErr } = await testAdmin.from('riders').insert({
    profile_id:   riderId,
    vehicle_type: 'bike',
    status:       'available',
    is_active:    true,
  });
  if (riderErr) {
    console.warn(`createTestRider: riders insert skipped — ${riderErr.message}`);
  }

  const riderToken = await getAuthToken(email, password);
  return { riderId, riderToken };
}


/**
 * Creates a test product in the master catalog, then adds inventory
 * for the given shop with specified stock and price.
 * Returns { productId, inventoryId }
 */
export async function createTestProduct(shopId, {
  name          = 'Test Cement Bag',
  deliveryTier  = 'scheduled',
  stockQty      = 50,
  pricePaise    = 40000,
  mrpPaise,               // default is computed below so mrp >= price always
  isInStock     = true,
} = {}) {
  // Ensure mrp >= price — callers that don't supply mrpPaise get 10% markup
  const effectiveMrp = (mrpPaise !== undefined && mrpPaise >= pricePaise)
    ? mrpPaise
    : Math.ceil(pricePaise * 1.1);

  // Find or create a category
  let categoryId;
  const { data: catData } = await testAdmin.from('categories').select('id').limit(1).single();
  if (catData) {
    categoryId = catData.id;
  } else {
    const { data: newCat, error: catErr } = await testAdmin.from('categories')
      .insert({ name: 'Test Category', slug: `test-cat-${Date.now()}` })
      .select('id').single();
    if (catErr) throw new Error(`createTestProduct category: ${catErr.message}`);
    categoryId = newCat.id;
  }

  const { data: product, error: pErr } = await testAdmin.from('products').insert({
    name,
    slug:          `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    category_id:   categoryId,
    delivery_tier: deliveryTier,
    unit:          'bag',
  }).select().single();
  if (pErr) throw new Error(`createTestProduct product: ${pErr.message}`);

  const { data: inv, error: iErr } = await testAdmin.from('shop_inventory').insert({
    shop_id:        shopId,
    product_id:     product.id,
    stock_quantity: stockQty,
    price:          pricePaise,
    mrp:            effectiveMrp, // always >= price
    // is_in_stock is GENERATED ALWAYS — do NOT insert
  }).select().single();
  if (iErr) throw new Error(`createTestProduct inventory: ${iErr.message}`);

  return { productId: product.id, inventoryId: inv.id, product, inventory: inv };
}

/**
 * Creates a test order with one sub-order and one item.
 * Uses ONLY columns that exist in the base schema (006_orders.sql).
 * Requires the orders table to have its NOT NULL constraints on
 * delivery_address_id / delivery_address_snapshot relaxed OR the
 * 043 patch to have been applied (which adds status + loosens constraints).
 *
 * Returns { order, subOrder }
 */
export async function createTestOrder(customerId, shopId, inventoryId, {
  status     = 'pending',
  qty        = 1,
  pricePaise = 40000,
} = {}) {
  const total = qty * pricePaise + 10000;

  // Generate a unique order number via timestamp
  const orderNumber = `TN-TEST-${Date.now()}`;

  // First: find or create a test address for the customer
  let addressId;
  const { data: existAddr } = await testAdmin
    .from('addresses')
    .select('id')
    .eq('user_id', customerId)
    .limit(1)
    .maybeSingle();

  if (existAddr) {
    addressId = existAddr.id;
  } else {
    const { data: newAddr, error: addrErr } = await testAdmin
      .from('addresses')
      .insert({
        user_id:       customerId,
        full_name:     'Test User',
        phone:         '+919000000001',
        label:         'Test Address',
        address_line1: '123 Test Street',
        city:          'Patna',
        state:         'Bihar',
        pincode:       '800001',
        is_default:    true,
      })
      .select('id')
      .single();
    if (addrErr) throw new Error(`createTestOrder address: ${addrErr.message}`);
    addressId = newAddr.id;
  }

  const { data: order, error: oErr } = await testAdmin.from('orders').insert({
    customer_id:               customerId,
    shop_id:                   shopId,
    order_number:              orderNumber,
    delivery_address_id:       addressId,
    delivery_address_snapshot: { address_line1: '123 Test Street', city: 'Patna', pincode: '800001' },
    subtotal:                  qty * pricePaise,
    delivery_fee:              10000,
    tax_amount:                0,
    discount_amount:           0,
    total_amount:              total,
    status:                    status,   // added by 043 patch
    placed_at:                 new Date().toISOString(),
  }).select().single();
  if (oErr) throw new Error(`createTestOrder order: ${oErr.message}`);

  const { data: sub, error: sErr } = await testAdmin.from('sub_orders').insert({
    order_id:         order.id,
    sub_order_number: `${orderNumber}-S`,
    delivery_tier:    'scheduled',
    status:           status,
    subtotal:         qty * pricePaise,
    delivery_fee:     10000,
    tax_amount:       0,
    discount_amount:  0,
    total_amount:     total,
  }).select().single();
  if (sErr) throw new Error(`createTestOrder sub_order: ${sErr.message}`);

  if (inventoryId) {
    // Fetch product_id from shop_inventory (order_items.product_id is NOT NULL)
    const { data: inv } = await testAdmin
      .from('shop_inventory').select('product_id').eq('id', inventoryId).single();
    const productId = inv?.product_id;

    const { error: iErr } = await testAdmin.from('order_items').insert({
      sub_order_id:  sub.id,
      product_id:    productId,
      inventory_id:  inventoryId,
      product_name:  'Test Product',
      unit:          'bag',
      delivery_tier: 'scheduled',
      quantity:      qty,
      unit_price:    pricePaise,
      tax_percent:   0,
      tax_amount:    0,
      total_price:   qty * pricePaise,
    });
    if (iErr) throw new Error(`createTestOrder order_items: ${iErr.message}`);
  }

  return { order, subOrder: sub };
}


// ── Global teardown ───────────────────────────────────────────

/**
 * Cleans up all test data created during a test suite.
 * Call in afterAll() of each test file.
 */
export async function cleanupTestData(userIds = [], shopIds = []) {
  // Step 1: clear orders linked to these customers (FK blocks profile delete)
  if (userIds.length) {
    const { data: orders } = await testAdmin
      .from('orders').select('id').in('customer_id', userIds);
    if (orders?.length) {
      const orderIds = orders.map(o => o.id);
      const { data: subs } = await testAdmin
        .from('sub_orders').select('id').in('order_id', orderIds);
      if (subs?.length) {
        await testAdmin.from('order_items').delete()
          .in('sub_order_id', subs.map(s => s.id));
      }
      await testAdmin.from('sub_orders').delete().in('order_id', orderIds);
      await testAdmin.from('orders').delete().in('id', orderIds);
    }
    // Clear addresses (FK to profiles)
    await testAdmin.from('addresses').delete().in('user_id', userIds);
    // Clear riders
    await testAdmin.from('riders').delete().in('profile_id', userIds);
  }

  // Step 2: clear shop data (sub_orders has no shop_id — join via orders)
  if (shopIds.length) {
    const { data: shopOrders } = await testAdmin
      .from('orders').select('id').in('shop_id', shopIds);
    if (shopOrders?.length) {
      const shopOrderIds = shopOrders.map(o => o.id);
      const { data: shopSubs } = await testAdmin
        .from('sub_orders').select('id').in('order_id', shopOrderIds);
      if (shopSubs?.length) {
        await testAdmin.from('order_items').delete()
          .in('sub_order_id', shopSubs.map(s => s.id));
      }
      await testAdmin.from('sub_orders').delete().in('order_id', shopOrderIds);
      await testAdmin.from('orders').delete().in('id', shopOrderIds);
    }
    await testAdmin.from('shop_inventory').delete().in('shop_id', shopIds);
    await testAdmin.from('shops').delete().in('id', shopIds);
  }

  // Step 3: delete profiles then auth users
  if (userIds.length) {
    await testAdmin.from('profiles').delete().in('id', userIds);
    for (const id of userIds) {
      await testAdmin.auth.admin.deleteUser(id);
    }
  }
}
