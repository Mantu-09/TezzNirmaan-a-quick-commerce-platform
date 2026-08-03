// ────────────────────────────────────────────────────────────
// 02_browse.js — TezzNirmaan Load Test Suite
// P9-1: Browse Load Test
//
// Purpose: Simulate normal traffic — 50 concurrent users browsing the app.
//   The browse path is the most common action: open app → see shops →
//   browse categories → view products → search.
//
//   This test validates that the stack handles typical peak-hour traffic
//   without response times degrading. At 50 VUs Supabase connection pools
//   should NOT be exhausted (PgBouncer limit is ~100 connections).
//
// Thresholds:
//   • http_req_failed < 1%           — near-zero errors on browse
//   • http_req_duration p95 < 500ms  — browsing must feel instant
//   • http_req_duration p99 < 1000ms — tail latency cap
//   • product_page_time p95 < 400ms  — product listing < 400ms
//   • search_time p95 < 200ms        — Typesense search < 200ms
//
// If browse p95 > 500ms:
//   • Check if Typesense is responding (should be < 50ms itself)
//   • Check Redis cache hit rate for product catalog
//   • Check Supabase Dashboard → Database → Connections graph
//
// Run:
//   k6 run -e API_URL=https://tezznirmaan-api-staging.onrender.com \
//          -e TEST_TOKEN=eyJ... \
//          backend/load-tests/02_browse.js
// ────────────────────────────────────────────────────────────
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Custom metrics — tracked separately from the default http_req_duration
const productPageTime = new Trend('product_page_time');
const searchTime      = new Trend('search_time');
const nearbyTime      = new Trend('nearby_shops_time');

export const options = {
  scenarios: {
    browse_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },  // Ramp: 0 → 50 VUs over 2 minutes
        { duration: '5m', target: 50 },  // Hold: 50 VUs for 5 minutes
        { duration: '1m', target:  0 },  // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],          // < 1% errors
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    product_page_time: ['p(95)<400'],          // product listing must be fast
    search_time:       ['p(95)<200'],          // Typesense should be ~50ms
    nearby_shops_time: ['p(95)<500'],          // PostGIS spatial query
  },
};

const BASE_URL   = __ENV.API_URL   || 'https://tezznirmaan-api-staging.onrender.com';
const AUTH_TOKEN = __ENV.TEST_TOKEN || '';

// Test shop/product IDs — replace with real staging IDs after P9-0 setup
// These are used only if env vars not provided; tests still run (may get 404s)
const TEST_SHOP_ID    = __ENV.TEST_SHOP_ID    || 'test-shop-id';
const TEST_PRODUCT_ID = __ENV.TEST_PRODUCT_ID || 'test-product-id';

// Simulated browse sessions — randomise to avoid cache warm-up bias
const SEARCH_QUERIES = ['cement', 'paint', 'tiles', 'gravel', 'sand', 'plywood', 'pipe'];
const CATEGORIES     = ['Paints', 'Tiles', 'Cement & Concrete', 'Plumbing', 'Electrical'];

export default function () {
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type':  'application/json',
  };

  // ── Step 1: Open app — browse nearby shops ─────────────────
  const nearbyStart = Date.now();
  const nearby = http.get(
    `${BASE_URL}/api/v1/customer/shops/nearby?lat=25.5941&lng=85.1376&radius_km=5`,
    { headers },
  );
  nearbyTime.add(Date.now() - nearbyStart);

  check(nearby, {
    'nearby shops 200':     (r) => r.status === 200,
    'nearby shops < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.5); // User reads the shop list

  // ── Step 2: Browse products in a category ─────────────────
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const prodStart = Date.now();
  const products = http.get(
    `${BASE_URL}/api/v1/customer/products?category=${encodeURIComponent(category)}&shop_id=${TEST_SHOP_ID}&limit=20`,
    { headers },
  );
  productPageTime.add(Date.now() - prodStart);

  check(products, {
    'product list 200 or 404':  (r) => r.status === 200 || r.status === 404,
    'product list < 400ms':     (r) => r.timings.duration < 400,
  });

  sleep(1); // User browses the product list

  // ── Step 3: Search for a product via Typesense ────────────
  const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
  const searchStart = Date.now();
  const search = http.get(
    `${BASE_URL}/api/v1/customer/search?q=${query}`,
    { headers },
  );
  searchTime.add(Date.now() - searchStart);

  check(search, {
    'search 200':         (r) => r.status === 200,
    'search < 200ms':     (r) => r.timings.duration < 200,
    'search has results': (r) => {
      try { return JSON.parse(r.body).data !== undefined; }
      catch (_) { return false; }
    },
  });

  sleep(0.5); // User reads search results

  // ── Step 4: View product detail ───────────────────────────
  const detail = http.get(
    `${BASE_URL}/api/v1/customer/products/${TEST_PRODUCT_ID}`,
    { headers },
  );

  check(detail, {
    'product detail 200 or 404': (r) => r.status === 200 || r.status === 404,
    'product detail < 500ms':    (r) => r.timings.duration < 500,
  });

  sleep(1); // User reads product detail, considers buying

  // ── Step 5: View cart (lightweight, tests Redis cart cache) ─
  const cart = http.get(`${BASE_URL}/api/v1/customer/cart`, { headers });
  check(cart, {
    'cart 200': (r) => r.status === 200 || r.status === 401,
    'cart < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(0.5);
}
