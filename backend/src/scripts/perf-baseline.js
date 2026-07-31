#!/usr/bin/env node
// P7-3 Performance Baseline Script
// Measures getClaims() latency over 10 consecutive calls.
// Run AFTER backend is running: node --env-file=.env src/scripts/perf-baseline.js
//
// Requires a valid JWT in PERF_TEST_TOKEN env var:
//   PERF_TEST_TOKEN="<your-jwt>" node --env-file=.env src/scripts/perf-baseline.js
//
// How to get a test token:
//   In your app, log in and copy the access_token from the response.
//   Or: GET /api/v1/auth/me with a valid session and grab the Authorization header value.

import { createClient } from '@supabase/supabase-js';

const token = process.env.PERF_TEST_TOKEN;
if (!token) {
  console.error('Set PERF_TEST_TOKEN=<your-jwt> before running this script.');
  process.exit(1);
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const RUNS = 10;
const timings = [];

console.log(`\n▶ getClaims() performance baseline — ${RUNS} consecutive calls\n`);

for (let i = 1; i <= RUNS; i++) {
  const start = Date.now();
  const { data, error } = await supabaseAdmin.auth.getClaims(token);
  const ms = Date.now() - start;
  timings.push(ms);

  const label = i === 1 ? ' ← cold start (JWKS fetch)' : '';
  const status = error ? `ERROR: ${error.message}` : `sub=${data?.claims?.sub?.slice(0, 8)}…`;
  console.log(`  Run ${i.toString().padStart(2)}: ${ms.toString().padStart(4)}ms  ${status}${label}`);
}

const avg     = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
const warmAvg = Math.round(timings.slice(1).reduce((a, b) => a + b, 0) / (RUNS - 1));
const min     = Math.min(...timings);
const max     = Math.max(...timings);

console.log(`
┌─────────────────────────────────────────────┐
│         getClaims() — P7-3 Results          │
├─────────────────────────────────────────────┤
│  Cold start (run 1):  ${timings[0].toString().padStart(4)}ms (JWKS fetch)   │
│  Warm avg (runs 2-${RUNS}): ${warmAvg.toString().padStart(4)}ms (local crypto) │
│  Overall avg:         ${avg.toString().padStart(4)}ms                  │
│  Min / Max:           ${min}ms / ${max}ms               │
├─────────────────────────────────────────────┤
│  Phase 6 getUser() baseline: ~120-250ms     │
│  Improvement: ${Math.round(200 / Math.max(warmAvg, 1))}x faster on warm calls        │
└─────────────────────────────────────────────┘
`);

process.exit(0);
