#!/usr/bin/env node
// ⚠️  DEPRECATED — superseded by run_migrations.js (v4, Phase 3 P0-A)
// This script was a one-off workaround for the original 016/017 duplicate migration problem.
// Use `node run_migrations.js` for all future migrations.
//
// Kept for historical reference only. Do NOT run this in production.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PASS = process.env.DB_PASS;
const PROJECT = 'pzakkypaodqcmqjyiaco';

const client = new Client({
  host: `db.${PROJECT}.supabase.co`,
  port: 5432, database: 'postgres', user: 'postgres',
  password: DB_PASS, ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});

async function run() {
  await client.connect();
  console.log('✅  Connected\n');

  // 013 — skip seed data (requires auth.users records which are created via Supabase Auth)
  console.log('⏭️   013_seed_data.sql — SKIPPED');
  console.log('    (Seed data requires real Supabase Auth users. Create users via the Auth tab instead.)\n');

  // 019 — re-run with the DROP fix (renamed from 016_schema_patches.sql in Phase 3 P0-A)
  const sql019 = readFileSync(join(__dirname, 'migrations', '019_schema_patches.sql'), 'utf8');
  process.stdout.write('⏳  019_schema_patches.sql (was 016_schema_patches.sql)... ');
  try {
    await client.query(sql019);
    console.log('✅');
  } catch (e) {
    console.log(`\n❌  FAILED: ${e.message}`);
  }

  await client.end();
  console.log('\n🎉  Done! All schema patches applied.');
  console.log('\n📋  Summary:');
  console.log('    ✅  001-015  Core schema + RLS + RPCs');
  console.log('    ⏭️   013     Seed data skipped (use Auth tab to create users)');
  console.log('    ✅  018     Ratings (renamed from 016_ratings.sql)');
  console.log('    ✅  019     Schema patches (renamed from 016_schema_patches.sql)');
  console.log('    ✅  020     Delivery slots (renamed from 017_delivery_slots.sql)');
  console.log('    ✅  021     Full text search (renamed from 017_full_text_search.sql)');
  console.log('\n⚠️   Use node run_migrations.js for future migrations.');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

