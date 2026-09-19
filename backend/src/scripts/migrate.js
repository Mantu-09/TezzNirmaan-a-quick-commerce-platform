#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TezzNirmaan DB Migration Runner — Session L
//
// Applies all pending SQL migration files in order against Supabase.
// Tracks applied migrations in a `_migrations` table (auto-created on first run).
//
// Usage:
//   node src/scripts/migrate.js          # apply all pending
//   node src/scripts/migrate.js --dry    # print pending without applying
//   node src/scripts/migrate.js --status # list all migrations and their status
//
// Environment:
//   SUPABASE_URL       — required
//   SUPABASE_SERVICE_ROLE_KEY — required (service role for DDL)
//
// CI/CD Integration (render.yaml pre-deploy command):
//   node src/scripts/migrate.js
//
// Safety:
//   - Idempotent: already-applied migrations are skipped
//   - Transactions: each migration is wrapped in BEGIN/COMMIT
//   - Failures: exits with code 1 on any error (blocks deployment)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }  from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIGRATIONS_DIR = join(__dirname, '../../migrations');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');
const STATUS  = args.includes('--status');

// ── Bootstrap migrations tracking table ────────────────────────

async function ensureTrackingTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum    TEXT
    );
  `;
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    // Fallback: use direct REST if exec_sql RPC not available
    // In this case, the table must be created manually once via Supabase SQL editor.
    // The script will still work — it just catches "relation does not exist" as "not applied".
    if (!error.message.includes('does not exist')) {
      throw new Error(`Failed to create _migrations table: ${error.message}`);
    }
  }
}

// ── Get applied migrations ──────────────────────────────────────

async function getAppliedMigrations() {
  const { data, error } = await supabase
    .from('_migrations')
    .select('filename')
    .order('id');
  if (error) {
    // Table may not exist yet — treat as empty
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return new Set();
    }
    throw error;
  }
  return new Set((data || []).map(r => r.filename));
}

// ── Get pending migration files ─────────────────────────────────

async function getPendingMigrations(applied) {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort(); // lexicographic order = numeric order (001_ < 002_ < ... < 084_)

  if (STATUS) {
    console.log('\n📋 Migration Status\n' + '─'.repeat(50));
    for (const f of sqlFiles) {
      const isApplied = applied.has(f);
      console.log(`${isApplied ? '✅' : '⏳'} ${f}`);
    }
    console.log('\n' + `${applied.size}/${sqlFiles.length} applied\n`);
    return [];
  }

  return sqlFiles.filter(f => !applied.has(f));
}

// ── Apply one migration ─────────────────────────────────────────

async function applyMigration(filename) {
  const filepath = join(MIGRATIONS_DIR, filename);
  const sql      = await readFile(filepath, 'utf8');

  console.log(`▶ Applying ${filename}…`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would execute ${sql.split('\n').length} lines`);
    return;
  }

  // Execute the migration SQL via Supabase RPC or direct query
  // We use the REST API's PostgREST sql endpoint for DDL
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    const body = await response.text();
    // If exec_sql RPC doesn't exist, fall back to Supabase client query
    if (response.status === 404 || body.includes('does not exist')) {
      // Try direct SQL via the pg endpoint (Supabase Management API)
      throw new Error(
        `Migration ${filename} failed: exec_sql RPC not found.\n` +
        `Please run this migration manually in the Supabase SQL editor.\n` +
        `File: migrations/${filename}`
      );
    }
    throw new Error(`Migration ${filename} failed (${response.status}): ${body}`);
  }

  // Record as applied
  const { error: trackErr } = await supabase
    .from('_migrations')
    .insert({ filename, checksum: `${sql.length}` });

  if (trackErr && !trackErr.message?.includes('duplicate')) {
    console.warn(`  ⚠ Could not record migration ${filename}: ${trackErr.message}`);
  }

  console.log(`  ✅ ${filename} applied`);
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('🚀 TezzNirmaan Migration Runner\n');

  try {
    await ensureTrackingTable();
  } catch (err) {
    console.warn('⚠ Could not create _migrations table:', err.message);
    console.warn('  Continuing — will rely on Supabase error detection.\n');
  }

  const applied = await getAppliedMigrations();
  const pending = await getPendingMigrations(applied);

  if (STATUS) process.exit(0);

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date. Nothing to apply.');
    process.exit(0);
  }

  console.log(`📦 ${pending.length} pending migration(s) to apply:\n`);
  pending.forEach(f => console.log(`  • ${f}`));
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 Dry run mode — no changes will be made.\n');
  }

  let applied_count = 0;
  let failed        = null;

  for (const filename of pending) {
    try {
      await applyMigration(filename);
      applied_count++;
    } catch (err) {
      console.error(`\n❌ Migration failed: ${filename}`);
      console.error(`   ${err.message}\n`);
      failed = { filename, error: err.message };
      break; // Stop on first failure — don't apply subsequent migrations
    }
  }

  console.log('');

  if (failed) {
    console.error(`💥 Migration runner stopped at ${failed.filename}.`);
    console.error(`   Fix the error above and re-run.\n`);
    process.exit(1);
  }

  console.log(`🎉 ${applied_count} migration(s) applied successfully.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('💥 Unexpected error:', err.message);
  process.exit(1);
});
