#!/usr/bin/env node
// ============================================================
// TezzNirmaan — Migration Runner v4 (Phase 3 P0-A)
//
// Sequential, idempotent migration runner backed by the
// schema_migrations tracking table (022_migration_tracking.sql).
//
// Usage:
//   node run_migrations.js
//
// Env vars required (copy .env.example → .env):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('❌  ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false },
  db:   { schema: 'public' },
});

// Extract project ref from URL (e.g. 'pzakkypaodqcmqjyiaco' from 'https://pzakkypaodqcmqjyiaco.supabase.co')
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const MGMT_API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

// ── Helpers ─────────────────────────────────────────────────

/**
 * Split SQL text into individual statements.
 * Handles dollar-quote blocks (DO $$ … $$) correctly so they
 * are not split mid-block at a stray semicolon.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    // Track dollar-quote blocks (DO $$ ... $$ or $body$ ... $body$)
    const dollarMatch = trimmed.match(/\$[a-zA-Z_]*\$/g);
    if (dollarMatch) {
      for (const tag of dollarMatch) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
        }
      }
    }

    // Skip pure comment lines outside dollar-quote blocks
    if (!inDollarQuote && trimmed.startsWith('--')) continue;

    current += line + '\n';

    // Statement ends at a semicolon outside any dollar-quote block
    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') statements.push(stmt);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(s => s.length > 0);
}

/**
 * Execute a raw SQL string.
 * Tries the Supabase Management API v2 which accepts sb_secret_ keys.
 * Falls back to the pg/query endpoint (JWT service_role keys).
 */
async function runRawSQL(sql) {
  // Try Management API first (works with sb_secret_ keys)
  const mgmtRes = await fetch(MGMT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (mgmtRes.ok) return await mgmtRes.json();
  const mgmtErr = await mgmtRes.text();

  // Fallback: /pg/query endpoint (JWT service_role keys, eyJ...)
  const pgRes = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SECRET_KEY,
      'Authorization': `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (pgRes.ok) return await pgRes.json();
  const pgErr = await pgRes.text();

  throw new Error(`Management API: HTTP ${mgmtRes.status}: ${mgmtErr} | Fallback pg/query: HTTP ${pgRes.status}: ${pgErr}`);
}

// ── Main ─────────────────────────────────────────────────────

async function runMigrations() {
  console.log('🔗  TezzNirmaan Migration Runner v4');
  console.log(`    URL: ${SUPABASE_URL}\n`);

  // Discover all migration files — 3-digit prefix, alphabetical = numerical order
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort();

  if (files.length === 0) {
    console.log('⚠️  No migration files found in', migrationsDir);
    return;
  }

  // Fetch already-applied versions from tracking table.
  // If schema_migrations doesn't exist yet (very first run), we'll catch the error
  // and treat the applied set as empty — the first migration must create it.
  let appliedVersions = new Set();
  try {
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('version');
    if (!error) {
      appliedVersions = new Set((data || []).map(r => r.version));
      console.log(`📋  Already applied: ${appliedVersions.size} migration(s)\n`);
    }
  } catch {
    console.log('ℹ️  schema_migrations table not found yet — will be created by migration 022\n');
  }

  let applied = 0;
  let skipped = 0;

  for (const filename of files) {
    const version = filename.split('_')[0]; // e.g. '022' from '022_migration_tracking.sql'

    if (appliedVersions.has(version)) {
      console.log(`⏭  ${filename} — already applied`);
      skipped++;
      continue;
    }

    const filePath = path.join(migrationsDir, filename);
    const sql      = fs.readFileSync(filePath, 'utf8');
    const checksum = crypto.createHash('md5').update(sql).digest('hex');

    console.log(`▶  Applying ${filename}...`);

    // Run each statement individually (Supabase REST doesn't support multi-statement batches)
    const statements = splitStatements(sql);
    for (const stmt of statements) {
      try {
        await runRawSQL(stmt);
      } catch (err) {
        console.error(`❌  Failed at statement in ${filename}:\n${stmt.slice(0, 200)}...\n`);
        console.error(`    Error: ${err.message}`);
        process.exit(1);
      }
    }

    // Record in tracking table (best-effort; if schema_migrations doesn't exist yet
    // for migration 022 itself, this insert will succeed after the CREATE TABLE above ran)
    try {
      await supabase.from('schema_migrations').insert({ version, filename, checksum });
    } catch {
      // Tracking insert failure is non-fatal for the current run but will cause
      // re-application on next run — acceptable for the very first migration.
    }

    console.log(`✅  Applied ${filename} (${statements.length} statement${statements.length !== 1 ? 's' : ''})`);
    applied++;
  }

  console.log(`\n✅  Done — ${applied} applied, ${skipped} skipped.`);
}

runMigrations().catch(err => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
