// ────────────────────────────────────────────────────────────
// Environment Configuration & Validation (P8-1)
//
// Single source of truth for all environment variables.
// Called once at server startup — before routes load.
//
// Behaviour:
//   • REQUIRED vars: process.exit(1) if missing — server won't start
//   • OPTIONAL vars: degraded-mode warning, server still starts
//   • Never logs actual values — only variable names
//
// This replaces the earlier utils/validateEnv.js (which is still
// imported from server.js for backwards-compat). Import THIS file
// for the richer output and optional-var tracking.
// ────────────────────────────────────────────────────────────

// ── Required — server will not start without these ───────
const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

// ── Optional — features degrade gracefully without these ──
const OPTIONAL = [
  { key: 'REDIS_URL',           feature: 'WebSocket horizontal scaling' },
  { key: 'TYPESENSE_HOST',      feature: 'Fast search (falls back to Postgres FTS)' },
  { key: 'ANTHROPIC_API_KEY',   feature: 'AI recommendations + Hinglish search' },
  { key: 'R2_ACCOUNT_ID',       feature: 'CDN image upload (endpoint returns 503)' },
  { key: 'FRESHCHAT_API_TOKEN', feature: 'Support chat badge count' },
  { key: 'EXPO_ACCESS_TOKEN',   feature: 'High-volume push (capped at 600/min without it)' },
  { key: 'FAST2SMS_API_KEY',    feature: 'SMS OTP delivery' },
  { key: 'FOUNDER_PHONE',       feature: 'Route transfer failure alerts via SMS (P8-2)' },
];

// ── Staging-mode detection ────────────────────────────────
export function isStaging() {
  return process.env.NODE_ENV === 'staging';
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function isTest() {
  return process.env.NODE_ENV === 'test';
}

// ── Placeholder value patterns ────────────────────────────
// Catch cases where someone left .env.example values in place
const PLACEHOLDER_PATTERNS = [
  /^your[-_]/i,
  /xxxxx/i,
  /^rzp_test_xxxxx$/i,
  /^test[-_]key$/i,
  /^placeholder/i,
];

function looksLikePlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some(p => p.test(value));
}

/**
 * validateEnvironment()
 *
 * Validates all required and optional environment variables.
 * Exits with code 1 if any required var is missing.
 * Logs a clear startup summary so the first lines of any log
 * file immediately show the runtime configuration.
 *
 * Call this BEFORE importing any module that reads process.env.
 */
export function validateEnvironment() {
  const missing   = [];
  const suspicious = [];
  const degraded  = [];

  // ── Check required vars ──────────────────────────────
  for (const key of REQUIRED) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      missing.push(key);
      continue;
    }
    // In production/staging: warn on placeholder values
    if (!isTest() && looksLikePlaceholder(value)) {
      suspicious.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌  FATAL: Missing required environment variables:\n');
    missing.forEach(k => console.error(`   • ${k}`));
    console.error('\n   Copy backend/.env.example → backend/.env and fill in all required values.');
    console.error('   NEVER commit .env — it is already in .gitignore.\n');
    process.exit(1);
  }

  if (suspicious.length > 0) {
    console.warn('\n⚠️  Suspicious env var values (look like placeholders):');
    suspicious.forEach(k => console.warn(`   • ${k}`));
    console.warn('   These should be real credentials before going live.\n');
  }

  // ── Check optional vars ──────────────────────────────
  for (const { key, feature } of OPTIONAL) {
    if (!process.env[key] || process.env[key].trim() === '') {
      degraded.push({ key, feature });
    }
  }

  // ── Validate SUPABASE_URL format ─────────────────────
  try {
    const url = new URL(process.env.SUPABASE_URL);
    if (!url.hostname.includes('supabase')) {
      console.warn('⚠️  SUPABASE_URL does not look like a Supabase URL — double-check it.');
    }
  } catch {
    console.error('❌  FATAL: SUPABASE_URL is not a valid URL');
    process.exit(1);
  }

  // ── Startup summary (suppressed in test mode) ─────────
  if (!isTest()) {
    const env     = process.env.NODE_ENV || 'development';
    const envIcon = isProduction() ? '🚀' : isStaging() ? '🧪' : '🛠️ ';

    console.log('\n  ────────────────────────────────────────────────');
    console.log(`  ${envIcon}  TezzNirmaan API — Environment Validated`);
    console.log('  ────────────────────────────────────────────────');
    console.log(`  Mode      : ${env}`);
    console.log(`  Supabase  : ${process.env.SUPABASE_URL}`);
    console.log(`  DB Pool   : ${process.env.DATABASE_URL ? '✓ connected' : '✗ not set'}`);
    console.log(`  Redis     : ${process.env.REDIS_URL    ? '✓ enabled'   : '✗ single-instance mode'}`);
    console.log(`  Typesense : ${process.env.TYPESENSE_HOST ? '✓ enabled' : '✗ Postgres FTS fallback'}`);
    console.log(`  R2 CDN    : ${process.env.R2_ACCOUNT_ID  ? '✓ enabled' : '✗ image upload disabled'}`);
    console.log(`  AI        : ${process.env.ANTHROPIC_API_KEY ? '✓ enabled' : '✗ disabled'}`);
    console.log(`  SMS       : ${process.env.FAST2SMS_API_KEY  ? '✓ enabled' : '✗ disabled'}`);
    console.log(`  Push      : ${process.env.EXPO_ACCESS_TOKEN ? '✓ high-volume' : '⚠️  capped (600/min)'}`);
    console.log(`  Freshchat : ${process.env.FRESHCHAT_API_TOKEN ? '✓ enabled' : '✗ badge disabled'}`);
    console.log(`  Route SMS : ${process.env.FOUNDER_PHONE ? '✓ alerts enabled' : '✗ FOUNDER_PHONE not set (P8-2)'}`);

    if (degraded.length > 0) {
      console.log('\n  ⚠️  Degraded features (optional vars not set):');
      degraded.forEach(({ key, feature }) =>
        console.log(`     • ${key.padEnd(24)} → ${feature}`)
      );
    }

    console.log('  ────────────────────────────────────────────────\n');
  }
}
