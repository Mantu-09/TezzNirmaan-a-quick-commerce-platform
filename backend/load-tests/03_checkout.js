// ────────────────────────────────────────────────────────────
// 03_checkout.js — TezzNirmaan Load Test Suite
// P9-1: Checkout / Order Placement Stress Test
//
// Purpose: Test concurrent order placement — the most DB-intensive path.
//   A single order placement executes:
//     1. POST /customer/cart/items     → Redis cart write
//     2. POST /customer/orders/preview → stock availability check + fee calc
//     3. POST /customer/orders         → place_order_atomic() RPC:
//          BEGIN TRANSACTION
//            lock inventory rows (SELECT FOR UPDATE)
//            deduct stock
//            create order + sub_orders
//            enqueue pg-boss background jobs (push, settlement, payout)
//          COMMIT
//
//   At 20 concurrent users hitting this simultaneously, Supabase connection
//   pools may be exhausted and lock contention may produce 409 conflicts.
//   These are expected and tracked — but checkout p95 must still be < 3s.
//
// Why COD for load testing:
//   Using COD (not online payment) avoids spawning real Razorpay calls.
//   The order still goes through the full DB flow, pg-boss job queue,
//   and Socket.IO broadcast — everything that matters for load measurement.
//
// Thresholds:
//   • http_req_failed < 5%           — some concurrent conflicts are expected
//   • checkout_time p95 < 3000ms     — 3s max for the order creation call
//   • order_success count > 50       — at least 50 complete orders must succeed
//
// If checkout p95 > 3000ms:
//   1. Supabase Dashboard → Database → Connections — is pool exhausted?
//   2. Check `place_order_atomic` for lock waits (pg_stat_activity)
//   3. Check if pg-boss holds too many Session-mode connections
//   Fix: reduce pg-boss max_jobs, or increase Supabase plan connection limit
//
// Run:
//   k6 run -e API_URL=https://tezznirmaan-api-staging.onrender.com \
//          -e TEST_TOKEN=eyJ... \
//          -e TEST_INVENTORY_ID=<uuid> \
//          -e TEST_ADDRESS_ID=<uuid> \
//          backend/load-tests/03_checkout.js
// ────────────────────────────────────────────────────────────
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const orderSuccess = new Counter('order_success');
const orderFail    = new Counter('order_fail');
const checkoutTime = new Trend('checkout_time');
const previewTime  = new Trend('preview_time');

export const options = {
  scenarios: {
    checkout_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },  // Ramp: 0 → 20 concurrent orders
        { duration: '3m', target: 20 },  // Hold: 20 VUs for 3 minutes
        { duration: '1m', target:  0 },  // Ramp down
      ],
    },
  },
  thresholds: {
    // Allow up to 5% errors — concurrent stock conflicts are expected and correct behaviour
    // If error rate exceeds 5%, something else is wrong (DB down, auth broken, etc.)
    http_req_failed: ['rate<0.05'],

    // The order creation call itself must complete in < 3s at p95
    checkout_time:   ['p(95)<3000'],

    // At least 50 orders must successfully complete in the 5-minute test window
    // If this fails, stock locking is too aggressive or connections are exhausted
    order_success:   ['count>50'],
  },
};

const BASE_URL          = __ENV.API_URL          || 'https://tezznirmaan-api-staging.onrender.com';
const AUTH_TOKEN        = __ENV.TEST_TOKEN        || '';
const TEST_INVENTORY_ID = __ENV.TEST_INVENTORY_ID || 'test-inventory-id';  // Pre-seeded staging product
const TEST_ADDRESS_ID   = __ENV.TEST_ADDRESS_ID   || 'test-address-id';    // Pre-seeded staging address

export default function () {
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type':  'application/json',
  };

  // ── Step 1: Add to cart ────────────────────────────────────
  const cartRes = http.post(
    `${BASE_URL}/api/v1/customer/cart/items`,
    JSON.stringify({ inventory_id: TEST_INVENTORY_ID, quantity: 1 }),
    { headers },
  );

  if (!check(cartRes, { 'add to cart 200': (r) => r.status === 200 })) {
    orderFail.add(1);
    // Don't return — still try to preview/place in case cart already has item
  }

  sleep(0.5);

  // ── Step 2: Preview order (calculates fees, validates stock) ─
  const previewStart = Date.now();
  const previewRes = http.post(
    `${BASE_URL}/api/v1/customer/orders/preview`,
    JSON.stringify({ address_id: TEST_ADDRESS_ID }),
    { headers },
  );
  previewTime.add(Date.now() - previewStart);

  if (!check(previewRes, { 'preview 200': (r) => r.status === 200 })) {
    orderFail.add(1);
    // Clear cart before next iteration to avoid stale state
    http.delete(`${BASE_URL}/api/v1/customer/cart`, { headers });
    sleep(2);
    return;
  }

  sleep(0.3);

  // ── Step 3: Place order (COD — no Razorpay call, full DB flow) ──
  // This is the hot path: place_order_atomic() RPC inside Supabase.
  // 20 concurrent callers → we expect some 409 "out of stock" responses
  // as VUs race to lock the same inventory rows.
  const orderStart = Date.now();
  const orderRes = http.post(
    `${BASE_URL}/api/v1/customer/orders`,
    JSON.stringify({
      address_id:     TEST_ADDRESS_ID,
      payment_method: 'cod',
    }),
    { headers },
  );
  checkoutTime.add(Date.now() - orderStart);

  const placed = check(orderRes, {
    'order placed 201':    (r) => r.status === 201,
    'order < 3000ms':      (r) => r.timings.duration < 3000,
  });

  // 409 = stock conflict (expected under load, not a failure)
  // 422 = validation error (unexpected — indicates a bug)
  if (placed) {
    orderSuccess.add(1);
  } else {
    orderFail.add(1);

    // Log unexpected errors (not 409 conflicts)
    if (orderRes.status !== 409 && orderRes.status !== 400) {
      console.error(`Unexpected order error: ${orderRes.status} — ${orderRes.body?.slice(0, 200)}`);
    }
  }

  // ── Clear cart for next iteration ─────────────────────────
  http.delete(`${BASE_URL}/api/v1/customer/cart`, { headers });

  // Think time: users don't place orders back-to-back in real life
  sleep(2);
}
