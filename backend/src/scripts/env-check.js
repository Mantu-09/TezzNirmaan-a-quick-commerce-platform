// backend/src/scripts/env-check.js — P18-7
// Run at startup to audit required environment variables.
// Called from server.js / index.js before starting the HTTP server.

const VARS = [
  // CRITICAL — app will fail without these
  { key: 'SUPABASE_URL',              level: 'CRITICAL', desc: 'Supabase project URL' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', level: 'CRITICAL', desc: 'Supabase service role key' },
  { key: 'JWT_SECRET',                level: 'CRITICAL', desc: 'JWT signing secret' },
  { key: 'RAZORPAY_KEY_ID',           level: 'CRITICAL', desc: 'Razorpay key ID (use test_ prefix for dev)' },
  { key: 'RAZORPAY_KEY_SECRET',       level: 'CRITICAL', desc: 'Razorpay key secret' },
  { key: 'API_BASE_URL',              level: 'CRITICAL', desc: 'Backend URL used by Next.js proxy rewrites — all /api/backend/* calls fail without this' },

  // HIGH — payments/notifications will silently fail
  { key: 'RAZORPAY_WEBHOOK_SECRET',   level: 'HIGH',     desc: 'Razorpay webhook signature verification' },
  { key: 'RAZORPAYX_WEBHOOK_SECRET',  level: 'HIGH',     desc: 'RazorpayX payout webhook secret' },
  { key: 'EXPO_ACCESS_TOKEN',         level: 'HIGH',     desc: 'Expo push notifications token' },

  // MEDIUM — features degrade but core works
  { key: 'GOOGLE_MAPS_API_KEY',       level: 'MEDIUM',   desc: 'Google Maps (address autocomplete, geocoding)' },
  { key: 'WATI_API_URL',              level: 'MEDIUM',   desc: 'WATI.io WhatsApp Business API URL' },
  { key: 'WATI_API_TOKEN',            level: 'MEDIUM',   desc: 'WATI.io bearer token' },
  { key: 'TWILIO_ACCOUNT_SID',        level: 'MEDIUM',   desc: 'Twilio account SID (SMS order updates)' },
  { key: 'TWILIO_AUTH_TOKEN',         level: 'MEDIUM',   desc: 'Twilio auth token' },
  { key: 'TWILIO_PHONE_NUMBER',       level: 'MEDIUM',   desc: 'Twilio sender phone number' },
  { key: 'GEMINI_API_KEY',            level: 'MEDIUM',   desc: 'Google Gemini AI (admin assistant)' },
  { key: 'INTERNAL_API_KEY',          level: 'MEDIUM',   desc: 'Internal monitoring key' },
  { key: 'CF_R2_BUCKET_NAME',         level: 'MEDIUM',   desc: 'Cloudflare R2 bucket (image uploads)' },
  { key: 'CF_R2_ACCESS_KEY_ID',       level: 'MEDIUM',   desc: 'Cloudflare R2 access key' },
  { key: 'CF_R2_SECRET_ACCESS_KEY',   level: 'MEDIUM',   desc: 'Cloudflare R2 secret key' },
  { key: 'TYPESENSE_HOST',            level: 'MEDIUM',   desc: 'Typesense search host' },
  { key: 'TYPESENSE_API_KEY',         level: 'MEDIUM',   desc: 'Typesense API key' },
];

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

export function checkEnv() {
  const missing  = { CRITICAL: [], HIGH: [], MEDIUM: [] };
  const set      = [];

  for (const { key, level, desc } of VARS) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      missing[level].push({ key, desc });
    } else {
      set.push(key);
    }
  }

  const hasCritical = missing.CRITICAL.length > 0;
  const hasHigh     = missing.HIGH.length > 0;
  const hasMedium   = missing.MEDIUM.length > 0;

  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}  TezzNirmaan Environment Check${RESET}`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${GREEN}  ✓ Set (${set.length}):${RESET} ${DIM}${set.join(', ')}${RESET}`);

  if (hasCritical) {
    console.log(`\n${RED}${BOLD}  ✗ CRITICAL — App will not work correctly:${RESET}`);
    missing.CRITICAL.forEach(({ key, desc }) => console.log(`${RED}    • ${key}${RESET} ${DIM}(${desc})${RESET}`));
  }
  if (hasHigh) {
    console.log(`\n${YELLOW}${BOLD}  ⚠ HIGH — Important features will fail:${RESET}`);
    missing.HIGH.forEach(({ key, desc }) => console.log(`${YELLOW}    • ${key}${RESET} ${DIM}(${desc})${RESET}`));
  }
  if (hasMedium) {
    console.log(`\n${DIM}  ℹ MEDIUM — Features degrade gracefully:${RESET}`);
    missing.MEDIUM.forEach(({ key, desc }) => console.log(`${DIM}    • ${key} (${desc})${RESET}`));
  }

  if (!hasCritical && !hasHigh && !hasMedium) {
    console.log(`\n${GREEN}${BOLD}  ✓ All environment variables configured!${RESET}`);
  }

  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  if (hasCritical) {
    console.error(`${RED}${BOLD}FATAL: Missing CRITICAL env vars. Fix before deploying to production.${RESET}`);
    // Don't exit in dev — still allow startup for local dev
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}
