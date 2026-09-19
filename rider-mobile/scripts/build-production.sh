#!/bin/bash
# ────────────────────────────────────────────────────────────
# build-production.sh — TezzNirmaan Mobile
# P9-2: EAS Production Build (Android + optional iOS)
#
# Usage (from mobile/ directory):
#   ./scripts/build-production.sh           # Android only
#   ./scripts/build-production.sh --ios     # iOS only
#   ./scripts/build-production.sh --all     # Android + iOS
#
# Prerequisites:
#   npm install -g eas-cli@latest  (requires >= 12.0.0)
#   eas login                      (uses your expo.dev account: mantu-09)
#
# What this does:
#   1. Validates eas-cli >= 12.0.0 is installed
#   2. Validates all REPLACE_WITH_* placeholders have been filled
#   3. Runs: eas build --platform android --profile production
#   4. Produces an .aab (Android App Bundle) for Play Store submission
#
# Monitor progress at:
#   https://expo.dev/accounts/mantu-09/projects/tezznirmaan/builds
# ────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PLATFORM="android"
AUTO_SUBMIT=false

for arg in "$@"; do
  case "$arg" in
    --ios)  PLATFORM="ios" ;;
    --all)  PLATFORM="all" ;;
    --auto-submit) AUTO_SUBMIT=true ;;
  esac
done

echo ""
echo -e "${BOLD}${CYAN}TezzNirmaan — EAS Production Build${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Platform:    ${PLATFORM}"
echo -e "  Profile:     production"
echo -e "  Auto-submit: ${AUTO_SUBMIT}"
echo ""

# ── 1. Check eas-cli is installed and >= 12.0.0 ───────────────
if ! command -v eas &> /dev/null; then
  echo -e "${RED}❌ eas-cli is not installed.${RESET}"
  echo "   Run: npm install -g eas-cli@latest"
  exit 1
fi

EAS_VERSION=$(eas --version 2>/dev/null || echo "0.0.0")
EAS_MAJOR=$(echo "$EAS_VERSION" | cut -d. -f1)
if [[ "$EAS_MAJOR" -lt 12 ]]; then
  echo -e "${RED}❌ eas-cli ${EAS_VERSION} is too old. Requires >= 12.0.0.${RESET}"
  echo "   Run: npm install -g eas-cli@latest"
  exit 1
fi
echo -e "  eas-cli: ${EAS_VERSION} ✅"

# ── 2. Check logged in ────────────────────────────────────────
if ! eas whoami &> /dev/null; then
  echo -e "${RED}❌ Not logged in to Expo.${RESET}"
  echo "   Run: eas login"
  exit 1
fi
echo -e "  Expo account: $(eas whoami 2>/dev/null)"

# ── 3. Validate placeholders have been replaced ───────────────
echo ""
echo -e "${BOLD}Checking for unfilled placeholder values...${RESET}"

PLACEHOLDERS=("REPLACE_WITH_EAS_PROJECT_ID" "REPLACE_WITH_SUPABASE_URL" "REPLACE_WITH_SUPABASE_ANON_KEY" "REPLACE_WITH_RAZORPAY_LIVE_KEY_ID" "REPLACE_WITH_SENTRY_DSN")
FOUND_PLACEHOLDER=false

for placeholder in "${PLACEHOLDERS[@]}"; do
  if grep -q "$placeholder" "$MOBILE_DIR/app.json" 2>/dev/null; then
    echo -e "  ${RED}❌ Found unfilled placeholder: ${placeholder} in app.json${RESET}"
    FOUND_PLACEHOLDER=true
  fi
done

if grep -q "REPLACE_WITH" "$MOBILE_DIR/eas.json" 2>/dev/null; then
  if grep -v "REPLACE_WITH_YOUR_APPLE" "$MOBILE_DIR/eas.json" | grep -q "REPLACE_WITH"; then
    echo -e "  ${RED}❌ Found unfilled placeholder in eas.json (non-iOS)${RESET}"
    FOUND_PLACEHOLDER=true
  fi
fi

if [ "$FOUND_PLACEHOLDER" = true ]; then
  echo ""
  echo -e "${RED}${BOLD}Build aborted — fill in all REPLACE_WITH_* values before building.${RESET}"
  echo ""
  echo "  app.json values to fill:"
  echo "    extra.eas.projectId    → expo.dev → your project → ID"
  echo "    extra.supabaseUrl      → Supabase dashboard → Project URL"
  echo "    extra.supabaseAnonKey  → Supabase dashboard → API → anon key"
  echo "    extra.razorpayKeyId    → Razorpay dashboard → API Keys → rzp_live_..."
  echo "    updates.url            → same EAS project ID"
  echo ""
  exit 1
fi

echo -e "  ${GREEN}✅ No unfilled placeholders found${RESET}"

# ── 4. Confirm production build ───────────────────────────────
echo ""
echo -e "${YELLOW}${BOLD}⚠️  This will start a PRODUCTION build.${RESET}"
echo -e "  • Profile: production"
echo -e "  • Platform: Android"
echo -e "  • Output: .aab (App Bundle for Play Store)"
echo -e "  • Cost: counts toward your EAS build minutes"
echo ""
read -rp "  Proceed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

# ── 5. Run the build ──────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Starting EAS production build (${PLATFORM})...${RESET}"
echo ""

cd "$MOBILE_DIR"

if [[ "$PLATFORM" == "all" ]]; then
  eas build --platform all --profile production --non-interactive
elif [[ "$PLATFORM" == "ios" ]]; then
  eas build --platform ios --profile production --non-interactive
else
  eas build --platform android --profile production --non-interactive
fi

echo ""
echo -e "${GREEN}${BOLD}✅ Build submitted to EAS.${RESET}"
echo ""
echo -e "  Monitor:  https://expo.dev/accounts/mantu-09/projects/tezznirmaan/builds"
echo ""

if [[ "$AUTO_SUBMIT" == "true" ]]; then
  echo -e "${CYAN}▶ Auto-submitting to Play Store internal track...${RESET}"
  echo ""
  "$SCRIPT_DIR/submit-android.sh" internal
else
  echo -e "  Next step: run ${BOLD}./scripts/submit-android.sh${RESET} once the build completes"
  echo -e "  Or rerun with ${BOLD}--auto-submit${RESET} to chain build + submit in one command"
fi

echo ""
