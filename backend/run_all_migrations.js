#!/usr/bin/env node
// ============================================================
// TezzNirmaan — Full Migration Runner (001-016)
// Uses pg direct connection to Supabase postgres database.
//
// Usage (PowerShell):
//   $env:DB_PASS="your-database-password"
//   node run_all_migrations.js
//
// DB password location:
//   Supabase Dashboard → Settings → Database → Database password
// ============================================================
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PASS    = process.env.DB_PASS;
const PROJECT    = 'pzakkypaodqcmqjyiaco';

if (!DB_PASS) {
  console.error('❌  Set your database password first:');
  console.error('    $env:DB_PASS="your-database-password"');
  console.error('    (Found at: Supabase Dashboard → Settings → Database → Database password)');
  process.exit(1);
}

// All migration files in order
const MIGRATIONS_DIR = join(__dirname, 'migrations');
const allFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.match(/^\d{3}_.*\.sql$/) && !f.includes('combined'))
  .sort();

console.log(`\n📋  Found ${allFiles.length} migration files:\n`);
allFiles.forEach(f => console.log(`    ${f}`));
console.log();

async function run() {
  const client = new Client({
    host:     `db.${PROJECT}.supabase.co`,
    port:     5432,
    database: 'postgres',
    user:     'postgres',
    password: DB_PASS,
    ssl:      { rejectUnauthorized: false },
    // Long timeout for large migrations (RLS policies, seed data)
    connectionTimeoutMillis: 30000,
    statement_timeout:       120000,
  });

  try {
    console.log('🔗  Connecting to Supabase postgres...');
    await client.connect();
    console.log('✅  Connected\n');
  } catch (e) {
    console.error(`❌  Connection failed: ${e.message}`);
    console.error('    Check your DB_PASS is correct.');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const file of allFiles) {
    const filePath = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(filePath, 'utf8');
    process.stdout.write(`⏳  ${file}... `);

    try {
      await client.query(sql);
      console.log('✅');
      passed++;
    } catch (e) {
      // Some migrations use IF NOT EXISTS / CREATE OR REPLACE — skip duplicate errors
      if (e.code === '42710' || e.code === '42P07') {
        // already exists — safe to skip
        console.log(`⚠️  Already exists (skipped)`);
        passed++;
      } else {
        console.log(`\n❌  FAILED: ${e.message}`);
        console.log(`    Code: ${e.code} | File: ${file}`);
        failed++;
        // Continue with next migration instead of aborting
      }
    }
  }

  await client.end();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅  Passed: ${passed}   ❌  Failed: ${failed}`);
  if (failed === 0) {
    console.log('🎉  All migrations completed successfully!');
    console.log('    Your TezzNirmaan database is ready.');
  } else {
    console.log('⚠️   Some migrations failed. Check errors above.');
  }
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
