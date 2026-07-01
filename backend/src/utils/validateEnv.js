// ────────────────────────────────────────────────────────────
// Environment Variable Validator
//
// Called ONCE at server startup — before any routes are registered.
// If a required variable is missing, the process exits immediately
// with a clear error message rather than failing at runtime with a
// cryptic "cannot read property of undefined" error.
//
// NEVER log the actual values — only the variable names.
// ────────────────────────────────────────────────────────────

const REQUIRED_VARS = [
  // Supabase
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  // Razorpay
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

const SENSITIVE_PATTERNS = [
  // Catch cases where someone accidentally pastes a real key into the wrong var
  { pattern: /^rzp_live_/, name: 'Razorpay live key in wrong variable' },
  { pattern: /^your-/, name: 'Placeholder value still set (starts with "your-")' },
  { pattern: /^your_/, name: 'Placeholder value still set (starts with "your_")' },
  { pattern: /xxxxx/,  name: 'Placeholder value still set (contains "xxxxx")' },
];

export function validateEnv() {
  const missing = [];
  const suspicious = [];

  for (const varName of REQUIRED_VARS) {
    const value = process.env[varName];

    if (!value || value.trim() === '') {
      missing.push(varName);
      continue;
    }

    // In production, warn if a value still looks like a placeholder
    if (process.env.NODE_ENV === 'production') {
      for (const { pattern, name } of SENSITIVE_PATTERNS) {
        if (pattern.test(value)) {
          suspicious.push(`${varName}: ${name}`);
        }
      }
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ FATAL: Missing required environment variables:\n');
    missing.forEach(v => console.error(`   • ${v}`));
    console.error('\n   Copy backend/.env.example → backend/.env and fill in the values.');
    console.error('   NEVER commit the .env file — it is already in .gitignore.\n');
    process.exit(1);
  }

  if (suspicious.length > 0) {
    console.error('\n⚠️  WARNING: Suspicious environment variable values detected:');
    suspicious.forEach(s => console.error(`   • ${s}`));
    console.error('   These look like placeholder values. Update them before going live.\n');
    // Do not exit — allow running in production with a warning for debugging
  }

  // Validate SUPABASE_URL format
  try {
    const url = new URL(process.env.SUPABASE_URL);
    if (!url.hostname.includes('supabase')) {
      console.warn('⚠️  SUPABASE_URL does not look like a Supabase URL. Double-check it.');
    }
  } catch {
    console.error('❌ FATAL: SUPABASE_URL is not a valid URL');
    process.exit(1);
  }

  // All good
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Environment variables validated successfully.');
  }
}
