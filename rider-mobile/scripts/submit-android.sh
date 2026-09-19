#!/bin/bash
# ────────────────────────────────────────────────────────────
# submit-android.sh — TezzNirmaan Mobile
# P9-2: Submit Android App Bundle to Google Play (Internal Testing)
#
# Usage (from mobile/ directory):
#   ./scripts/submit-android.sh
#
# Prerequisites:
#   1. A completed production build (run build-production.sh first)
#   2. google-play-service-account.json in the project ROOT (not mobile/)
#      Get it: Google Play Console → Setup → API access → Create service account
#              → Grant "Release manager" role → Download JSON key
#   3. Your app must already exist in Play Console (create the app first)
#
# Track targets:
#   internal  — Internal Testing (up to 100 testers, no review required)
#   alpha     — Closed Testing (requires review, 1-3 days)
#   beta      — Open Testing
#   production — Production (requires full review, submit to alpha first)
#
# For launch: always start with 'internal', then promote to production after testing
# ────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$MOBILE_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

TRACK="${1:-internal}"

echo ""
echo -e "${BOLD}${CYAN}TezzNirmaan — Submit to Google Play (${TRACK} track)${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── 1. Check eas-cli ──────────────────────────────────────────
if ! command -v eas &> /dev/null; then
  echo -e "${RED}❌ eas-cli not found. Run: npm install -g eas-cli${RESET}"
  exit 1
fi

# ── 2. Check service account key exists ───────────────────────
SERVICE_ACCOUNT_FILE="$PROJECT_ROOT/google-play-service-account.json"

if [[ ! -f "$SERVICE_ACCOUNT_FILE" ]]; then
  echo -e "${RED}❌ google-play-service-account.json not found.${RESET}"
  echo ""
  echo "  Expected at: $SERVICE_ACCOUNT_FILE"
  echo ""
  echo "  How to get it:"
  echo "    1. Google Play Console → Setup → API access"
  echo "    2. Link to a Google Cloud project"
  echo "    3. Create a Service Account with 'Release manager' role"
  echo "    4. Create and download a JSON key"
  echo "    5. Place it at: $(dirname "$SERVICE_ACCOUNT_FILE")/"
  echo ""
  echo -e "  ${YELLOW}IMPORTANT: Never commit this file to git.${RESET}"
  echo "  The .gitignore already excludes service-account*.json"
  exit 1
fi

echo -e "  ${GREEN}✅ Service account key found${RESET}"

# ── 3. Confirm submission ─────────────────────────────────────
echo ""
echo -e "${YELLOW}${BOLD}Submitting to Play Store track: ${TRACK}${RESET}"
if [[ "$TRACK" == "production" ]]; then
  echo -e "${RED}  ⚠️  Production track requires Google review (1–3 days).${RESET}"
  echo "  Use 'internal' for initial launch testing."
fi
echo ""
read -rp "  Proceed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

# ── 4. Submit ─────────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Submitting to Google Play...${RESET}"
echo ""

cd "$MOBILE_DIR"

eas submit \
  --platform android \
  --profile production \
  --non-interactive

echo ""
echo -e "${GREEN}${BOLD}✅ Submitted to Google Play — ${TRACK} track.${RESET}"
echo ""
echo -e "  View in Play Console: https://play.google.com/console"
echo -e "  Internal testers can install immediately after processing (~15 minutes)"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo "    1. Open Play Console → Testing → Internal Testing"
echo "    2. Add testers by email"
echo "    3. Share the opt-in link with your team"
echo "    4. When ready to go public: promote to Production in Play Console"
echo ""
