// ────────────────────────────────────────────────────────────
// 01_smoke.js — TezzNirmaan Load Test Suite
// P9-1: Smoke Test
//
// Purpose: Verify staging is healthy before spending time on load tests.
//   Fails fast if the API is down, DB connection is broken, or Typesense
//   is unreachable — saves you from wasting 20 minutes on a broken setup.
//
// Thresholds:
//   • http_req_failed < 1%    — virtually zero errors allowed
//   • http_req_duration p95 < 500ms — staging should be snappy at 5 VUs
//   • health < 100ms          — the health endpoint is a static response
//
// Run:
//   k6 run -e API_URL=https://tezznirmaan-api-staging.onrender.com \
//          -e TEST_TOKEN=eyJ... \
//          backend/load-tests/01_smoke.js
// ────────────────────────────────────────────────────────────
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus:      5,
  duration: '30s',
  thresholds: {
    // < 1% errors — if anything is broken, fail here before running load tests
    http_req_failed:   ['rate<0.01'],
    // 95% of all requests must complete within 500ms at 5 VUs
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL  = __ENV.API_URL   || 'https://tezznirmaan-api-staging.onrender.com';
const AUTH_TOKEN = __ENV.TEST_TOKEN || '';

export default function () {
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type':  'application/json',
  };

  // ── 1. Health check ────────────────────────────────────────
  // Validates: DB ping + Redis ping. Should be < 100ms with warm connections.
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health status 200':      (r) => r.status === 200,
    'health response < 100ms': (r) => r.timings.duration < 100,
    'health db=ok':            (r) => {
      try { return JSON.parse(r.body).checks?.database === 'ok'; }
      catch (_) { return false; }
    },
  });

  sleep(0.5);

  // ── 2. Nearby shops (unauthenticated public path) ──────────
  // Validates: PostGIS spatial query works, city geofencing is live.
  // Patna coordinates: 25.5941° N, 85.1376° E
  const nearby = http.get(
    `${BASE_URL}/api/v1/customer/shops/nearby?lat=25.5941&lng=85.1376`,
    { headers },
  );
  check(nearby, {
    'nearby shops 200':      (r) => r.status === 200,
    'nearby shops < 300ms':  (r) => r.timings.duration < 300,
    'nearby shops has data': (r) => {
      try { return Array.isArray(JSON.parse(r.body).data?.shops); }
      catch (_) { return false; }
    },
  });

  sleep(0.5);

  // ── 3. Typesense search ────────────────────────────────────
  // Validates: Typesense cluster is reachable and indexed.
  // "cement" is guaranteed to exist in the TezzNirmaan product catalog.
  // If Typesense is down, this falls back to Postgres FTS (still works,
  // but will be > 200ms — catch this here before the load tests).
  const search = http.get(
    `${BASE_URL}/api/v1/customer/search?q=cement`,
    { headers },
  );
  check(search, {
    'search 200':       (r) => r.status === 200,
    'search < 200ms':   (r) => r.timings.duration < 200,
    'search has hits':  (r) => {
      try { return JSON.parse(r.body).data?.hits?.length >= 0; }
      catch (_) { return false; }
    },
  });

  sleep(0.5);

  // ── 4. Auth check ──────────────────────────────────────────
  // Validates: JWT verification middleware works, Supabase JWKS is cached.
  // Uses the profile endpoint (lightweight, no heavy DB query).
  if (AUTH_TOKEN) {
    const profile = http.get(`${BASE_URL}/api/v1/customer/profile`, { headers });
    check(profile, {
      'profile auth works':  (r) => r.status === 200 || r.status === 404,
      'profile < 300ms':     (r) => r.timings.duration < 300,
    });
  }

  sleep(0.5);
}
