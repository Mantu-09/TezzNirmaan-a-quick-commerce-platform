# TezzNirmaan — k6 Load Tests

## Quick Start

```bash
# Install k6
brew install k6                       # macOS
# or: winget install k6               # Windows

# Set environment variables
export API_URL=https://tezznirmaan-api-staging.onrender.com
export WS_URL=wss://tezznirmaan-api-staging.onrender.com
export TEST_TOKEN=eyJ...              # Bearer token for a staging customer
export TEST_INVENTORY_ID=<uuid>       # From: Supabase → inventory table → any active row
export TEST_ADDRESS_ID=<uuid>         # From: Supabase → addresses table → any address for the test customer
export TEST_ORDER_ID=<uuid>           # An order in 'out_for_delivery' status (for WS test)

# Run all tests (from backend/load-tests/)
chmod +x run-all.sh
./run-all.sh

# Or run individually:
k6 run -e API_URL=$API_URL -e TEST_TOKEN=$TEST_TOKEN 01_smoke.js
```

## Tests

| File | VUs | Duration | Tests |
|------|-----|----------|-------|
| `01_smoke.js` | 5 | 30s | Health, nearby shops, search, auth |
| `02_browse.js` | 50 | 8min (ramp) | Browse, categories, search, product detail |
| `03_checkout.js` | 20 | 5min (ramp) | Cart, preview, place order (COD) |
| `04_websocket.js` | 100 | 3min (ramp) | Socket.IO connections |

## Thresholds

| Test | Threshold | Meaning |
|------|-----------|---------|
| All | `http_req_failed < 1%` | Near-zero API errors |
| Browse | `http_req_duration p95 < 500ms` | Browsing feels instant |
| Search | `search_time p95 < 200ms` | Typesense is faster than Postgres fallback |
| Checkout | `checkout_time p95 < 3000ms` | Order placement under 3s |
| Checkout | `order_success count > 50` | At least 50 complete orders in test window |
| WebSocket | `ws_errors < 10` | Redis adapter holding connections |
| WebSocket | `ws_connected > 90` | 90%+ connection success rate |

## Troubleshooting

### Checkout p95 > 3000ms
1. **Supabase Dashboard → Database → Connections** — is the pool maxed?
2. Check `place_order_atomic` for row-level lock waits
3. Check pg-boss holds how many Session-mode connections
4. **Fix:** Reduce `maxConcurrency` in `jobQueue.js`, or upgrade Supabase plan

### Browse p95 > 500ms
1. Is Typesense being hit? Check `search_time` metric — should be ≤ 50ms
2. If `search_time` is high, Typesense is down → falling back to Postgres FTS
3. Check Redis cache hit rate for product catalog in Upstash Console

### WebSocket errors > 10
- Upstash **free tier** allows 100 simultaneous connections
- At 100 VUs, you're exactly at the limit — a few failures are normal
- **For production launch:** Upgrade Upstash to paid tier ($10/month, 1000 connections)

## Results

JSON results are saved to `results/` (git-ignored). Each file is named `<test>_<timestamp>.json`.

To view a summary of a result file:
```bash
k6 run --out json=results/browse.json 02_browse.js
# Then inspect with jq:
cat results/browse.json | jq '.metrics.http_req_duration'
```

## Important

> **Run against staging ONLY. Never against production.**
> The checkout test places real (COD) orders and modifies inventory.
> The WebSocket test opens 100 simultaneous Redis connections.
