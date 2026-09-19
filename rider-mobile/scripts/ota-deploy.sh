#!/bin/bash
# ────────────────────────────────────────────────────────────
# ota-deploy.sh — TezzNirmaan Mobile
# P9-2: Safe OTA deploy with staged rollout and manual promotion
#
# Usage (from mobile/ directory):
#   ./scripts/ota-deploy.sh "Bug fix: correct wallet balance display"
#
# Staged rollout protocol:
#   1. Publish at 0% — verify in Expo dashboard before any user gets it
#   2. Promote to 10% — watch Sentry for new errors (30 min)
#   3. Promote to 50% — watch for crash spikes (1 hour)
#   4. Promote to 100% — full rollout
#
# SAFE TO OTA (JS-only changes):
#   ✅ UI changes, bug fixes, text changes
#   ✅ New API calls (to existing backend endpoints)
#   ✅ Zustand store changes
#   ✅ New screens / navigation (if navigator is already compiled)
#
# REQUIRES FULL BUILD (native changes):
#   ❌ New native packages (package.json changes)
#   ❌ New expo plugins (app.json plugins[])
#   ❌ Changes to expo SDK version
#   ❌ New permissions (android.permissions / infoPlist)
#   ❌ App icon / splash changes
#
# Monitor at:
#   https://expo.dev/accounts/mantu-09/projects/tezznirmaan/updates
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

MESSAGE="${1:-Routine update}"

echo ""
echo -e "${BOLD}${CYAN}TezzNirmaan — OTA Deploy (Staged Rollout)${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  Message: ${BOLD}${MESSAGE}${RESET}"
echo -e "  Branch:  production"
echo -e "  Channel: production"
echo ""

# ── 1. Check eas-cli is installed ─────────────────────────────
if ! command -v eas &> /dev/null; then
  echo -e "${RED}❌ eas-cli not found.${RESET}"
  echo "   Run: npm install -g eas-cli"
  exit 1
fi

EAS_VERSION=$(eas --version 2>/dev/null || echo "unknown")
echo -e "  eas-cli: ${EAS_VERSION}"

# ── 2. Check logged in ────────────────────────────────────────
if ! eas whoami &> /dev/null; then
  echo -e "${RED}❌ Not logged in to Expo.${RESET}"
  echo "   Run: eas login"
  exit 1
fi
echo -e "  Account: $(eas whoami 2>/dev/null)"
echo ""

# ── 3. Safety check — is there an active 100% rollout already? ─
echo -e "${YELLOW}⚠️  Pre-deploy checklist:${RESET}"
echo "   □ This change does NOT add new native packages"
echo "   □ This change does NOT modify app.json plugins"
echo "   □ Sentry errors on production are NOT spiking right now"
echo "   □ You have tested this on a physical device (preview build)"
echo ""
read -rp "  Confirm checklist passed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

# ── 4. Publish at 0% rollout ──────────────────────────────────
echo ""
echo -e "${CYAN}▶ Publishing update at 0% rollout...${RESET}"
echo ""

cd "$MOBILE_DIR"

eas update \
  --branch production \
  --message "$MESSAGE" \
  --rollout-percentage 0 \
  --non-interactive

echo ""
echo -e "${GREEN}${BOLD}✅ Published at 0% rollout.${RESET}"
echo ""
echo -e "${BOLD}Promotion commands (run in order, monitor between each):${RESET}"
echo ""
echo -e "  ${CYAN}10%  (run after verifying in Expo dashboard — ~5 min):${RESET}"
echo "    eas update:republish --branch production --rollout-percentage 10"
echo ""
echo -e "  ${CYAN}50%  (run after 30 min of clean Sentry metrics):${RESET}"
echo "    eas update:republish --branch production --rollout-percentage 50"
echo ""
echo -e "  ${CYAN}100% (run after 1 hour of clean metrics):${RESET}"
echo "    eas update:republish --branch production --rollout-percentage 100"
echo ""
echo -e "  ${RED}Rollback (if issues surface at any stage):${RESET}"
echo "    eas update:republish --branch production --rollout-percentage 0"
echo "    # Then re-publish the last known-good commit's update"
echo ""
echo -e "  Monitor: https://expo.dev/accounts/mantu-09/projects/tezznirmaan/updates"
echo ""
