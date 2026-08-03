#!/bin/bash
# ────────────────────────────────────────────────────────────
# run-all.sh — TezzNirmaan Load Test Suite
# P9-1: Sequential load test runner
#
# Usage:
#   export API_URL=https://tezznirmaan-api-staging.onrender.com
#   export WS_URL=wss://tezznirmaan-api-staging.onrender.com
#   export TEST_TOKEN=eyJ...                 # Bearer token for a test customer
#   export TEST_INVENTORY_ID=<uuid>          # Pre-seeded staging inventory item
#   export TEST_ADDRESS_ID=<uuid>            # Pre-seeded staging address
#   export TEST_ORDER_ID=<uuid>              # An order in 'out_for_delivery' status
#   cd backend/load-tests
#   ./run-all.sh
#
# What it does:
#   1. Smoke test   — if this fails, abort immediately (nothing else will pass)
#   2. Browse load  — 50 VUs, 8 min (normal peak-hour traffic)
#   3. Checkout stress — 20 VUs, 5 min (concurrent order placement)
#   4. WebSocket load  — 100 VUs, 3 min (Upstash connection limit test)
#
# Results saved to: load-tests/results/ (add to .gitignore)
#
# Pre-requisites:
#   brew install k6            # macOS
#   apt-get install k6         # Ubuntu/Debian (see README for GPG key setup)
#   winget install k6          # Windows
#
# DO NOT run against production. Staging only.
# ────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Defaults ──────────────────────────────────────────────────
API_URL="${API_URL:-https://tezznirmaan-api-staging.onrender.com}"
WS_URL="${WS_URL:-wss://tezznirmaan-api-staging.onrender.com}"

# ── Validate k6 is installed ──────────────────────────────────
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}❌ k6 is not installed.${RESET}"
  echo ""
  echo "Install instructions:"
  echo "  macOS:          brew install k6"
  echo "  Ubuntu/Debian:  see https://k6.io/docs/get-started/installation/"
  echo "  Windows:        winget install k6"
  exit 1
fi

# ── Validate required env vars ────────────────────────────────
if [[ -z "${TEST_TOKEN:-}" ]]; then
  echo -e "${YELLOW}⚠️  TEST_TOKEN is not set.${RESET}"
  echo "   Auth-gated endpoints will return 401. Set TEST_TOKEN to a valid"
  echo "   staging Bearer token to test authenticated paths."
fi

# ── Create results directory ──────────────────────────────────
RESULTS_DIR="$(dirname "$0")/results"
mkdir -p "$RESULTS_DIR"

# ── Timestamp for this run ────────────────────────────────────
RUN_TS=$(date +"%Y%m%d_%H%M%S")
SUMMARY_FILE="$RESULTS_DIR/summary_${RUN_TS}.txt"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  TezzNirmaan Load Test Suite — P9-1               ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Target:    ${BOLD}${API_URL}${RESET}"
echo -e "  Run time:  $(date)"
echo -e "  Results:   ${RESULTS_DIR}/"
echo ""

# ── Helper: run a test and check exit code ────────────────────
run_test() {
  local name="$1"
  local file="$2"
  local extra_env="${3:-}"

  echo -e "${CYAN}▶ ${name}${RESET}"

  # Build k6 command
  local cmd="k6 run \
    -e API_URL=${API_URL} \
    -e WS_URL=${WS_URL} \
    -e TEST_TOKEN=${TEST_TOKEN:-} \
    -e TEST_SHOP_ID=${TEST_SHOP_ID:-} \
    -e TEST_PRODUCT_ID=${TEST_PRODUCT_ID:-} \
    -e TEST_INVENTORY_ID=${TEST_INVENTORY_ID:-} \
    -e TEST_ADDRESS_ID=${TEST_ADDRESS_ID:-} \
    -e TEST_ORDER_ID=${TEST_ORDER_ID:-} \
    --out json=${RESULTS_DIR}/${file%.js}_${RUN_TS}.json \
    ${file}"

  if eval "$cmd"; then
    echo -e "${GREEN}  ✅ ${name} — PASSED${RESET}"
    echo "PASS: ${name}" >> "$SUMMARY_FILE"
    return 0
  else
    echo -e "${RED}  ❌ ${name} — FAILED${RESET}"
    echo "FAIL: ${name}" >> "$SUMMARY_FILE"
    return 1
  fi
}

START_TIME=$SECONDS

# ── 1. Smoke test — MUST pass or abort ───────────────────────
echo -e "${BOLD}Step 1/4: Smoke Test (5 VUs, 30s)${RESET}"
if ! run_test "01_smoke.js — Smoke test" "01_smoke.js"; then
  echo ""
  echo -e "${RED}${BOLD}❌ Smoke test FAILED — aborting all load tests.${RESET}"
  echo ""
  echo "  The staging API is not healthy. Fix before running load tests:"
  echo "  • Check Render dashboard for the staging service status"
  echo "  • Verify all P9-0 environment variables are set in staging"
  echo "  • Run: curl ${API_URL}/health"
  echo ""
  exit 1
fi

echo ""

# ── 2. Browse load test ───────────────────────────────────────
echo -e "${BOLD}Step 2/4: Browse Load Test (50 VUs, 8 min)${RESET}"
run_test "02_browse.js — Browse load" "02_browse.js" || true  # Don't abort on browse failure
echo ""

# ── 3. Checkout stress test ───────────────────────────────────
echo -e "${BOLD}Step 3/4: Checkout Stress Test (20 VUs, 5 min)${RESET}"

if [[ -z "${TEST_INVENTORY_ID:-}" ]] || [[ -z "${TEST_ADDRESS_ID:-}" ]]; then
  echo -e "${YELLOW}  ⚠️  TEST_INVENTORY_ID or TEST_ADDRESS_ID not set.${RESET}"
  echo -e "     Checkout test will run but orders will fail with 404/422."
  echo -e "     Set these to staging UUIDs for meaningful results."
fi

run_test "03_checkout.js — Checkout stress" "03_checkout.js" || true
echo ""

# ── 4. WebSocket load test ────────────────────────────────────
echo -e "${BOLD}Step 4/4: WebSocket Load Test (100 VUs, 3 min)${RESET}"
run_test "04_websocket.js — WebSocket load" "04_websocket.js" || true
echo ""

# ── Summary ───────────────────────────────────────────────────
ELAPSED=$((SECONDS - START_TIME))
ELAPSED_MIN=$((ELAPSED / 60))
ELAPSED_SEC=$((ELAPSED % 60))

echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  All Load Tests Complete                          ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Total time: ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
echo -e "  Results:    ${RESULTS_DIR}/"
echo ""
echo -e "${BOLD}Key thresholds to verify:${RESET}"
echo -e "  Browse:    p95 < 500ms"
echo -e "  Search:    p95 < 200ms"
echo -e "  Checkout:  p95 < 3000ms  +  order_success count > 50"
echo -e "  WebSocket: ws_errors < 10  +  ws_connected > 90"
echo ""
echo -e "${BOLD}Pass/fail summary:${RESET}"
cat "$SUMMARY_FILE" 2>/dev/null || echo "  (see results directory)"
echo ""
echo -e "${BOLD}${YELLOW}⚠️  If checkout p95 > 3000ms:${RESET}"
echo "  1. Supabase Dashboard → Database → Connections (is pool exhausted?)"
echo "  2. Check place_order_atomic for lock contention"
echo "  3. Consider reducing pg-boss concurrency in jobQueue.js"
echo ""
echo -e "${BOLD}${YELLOW}⚠️  If ws_errors > 10:${RESET}"
echo "  • Upstash free tier has 100 simultaneous connection limit"
echo "  • Upgrade to Upstash paid tier (\$10/mo) for production launch"
echo ""
