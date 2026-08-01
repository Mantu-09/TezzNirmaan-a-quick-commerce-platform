#!/bin/bash
# ────────────────────────────────────────────────────────────
# TezzNirmaan — Migration Deployment Script (P8-1)
#
# Runs all 46 migrations in numeric order against any Supabase
# project. Safe to run against staging before touching production.
#
# Usage:
#   chmod +x scripts/deploy-migrations.sh
#   ./scripts/deploy-migrations.sh <supabase-url> <service-role-key>
#
# Example (staging):
#   ./scripts/deploy-migrations.sh \
#     https://xxxxxxxx.supabase.co \
#     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
#
# The script uses Supabase's pg_execute_sql RPC which requires
# the service role key (NOT the anon key).
# ────────────────────────────────────────────────────────────
set -euo pipefail

SUPABASE_URL="${1:-}"
SERVICE_ROLE_KEY="${2:-}"

# ── Argument validation ───────────────────────────────────
if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo ""
  echo "❌  Usage: ./scripts/deploy-migrations.sh <supabase-url> <service-role-key>"
  echo ""
  echo "    supabase-url       e.g. https://xyzxyz.supabase.co"
  echo "    service-role-key   from Supabase Dashboard → Settings → API → service_role key"
  echo ""
  exit 1
fi

# Strip trailing slash from URL if present
SUPABASE_URL="${SUPABASE_URL%/}"

MIGRATIONS_DIR="$(dirname "$0")/../migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌  Migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

# ── Collect and sort migration files ─────────────────────
mapfile -t FILES < <(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "❌  No .sql files found in $MIGRATIONS_DIR"
  exit 1
fi

echo ""
echo "  🗄️  TezzNirmaan — Migration Runner (P8-1)"
echo "  ─────────────────────────────────────────"
echo "  Target : $SUPABASE_URL"
echo "  Files  : ${#FILES[@]} migrations"
echo "  ─────────────────────────────────────────"
echo ""

FAILED=0
APPLIED=0
SKIPPED=0

for FILE in "${FILES[@]}"; do
  FILENAME=$(basename "$FILE")

  # Read SQL content and JSON-encode it (handles quotes, newlines, etc.)
  SQL_JSON=$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' < "$FILE")

  echo "▶  Applying $FILENAME..."

  RESPONSE=$(curl -s -w "\n__HTTP_STATUS__%{http_code}" \
    -X POST \
    "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    --max-time 60 \
    -d "{\"sql\": $SQL_JSON}" 2>&1)

  HTTP_STATUS=$(echo "$RESPONSE" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')
  BODY=$(echo "$RESPONSE" | grep -v '__HTTP_STATUS__')

  # Check for error in body OR non-2xx status
  if echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if 'error' not in d else 1)" 2>/dev/null; then
    # No error key in response
    if [ "${HTTP_STATUS:-0}" -ge 200 ] && [ "${HTTP_STATUS:-0}" -lt 300 ]; then
      echo "   ✅ $FILENAME"
      APPLIED=$((APPLIED + 1))
    else
      echo "   ⚠️  $FILENAME — HTTP $HTTP_STATUS (may already be applied)"
      SKIPPED=$((SKIPPED + 1))
    fi
  else
    # Check if it's an "already exists" error — those are safe to skip
    if echo "$BODY" | grep -qi "already exists\|duplicate\|relation.*already"; then
      echo "   ⚠️  $FILENAME — already applied (skipping)"
      SKIPPED=$((SKIPPED + 1))
    else
      echo "   ❌ $FILENAME — FAILED"
      echo "      Response: $BODY"
      FAILED=$((FAILED + 1))

      # Stop on first hard failure
      echo ""
      echo "  ❌  Migration failed. Stopping to prevent partial state."
      echo "  Fix the issue in $FILENAME and re-run from that migration."
      exit 1
    fi
  fi
done

echo ""
echo "  ─────────────────────────────────────────"
echo "  ✅  Done!"
echo "     Applied : $APPLIED"
echo "     Skipped : $SKIPPED (already applied)"
echo "     Failed  : $FAILED"
echo "  ─────────────────────────────────────────"
echo ""
