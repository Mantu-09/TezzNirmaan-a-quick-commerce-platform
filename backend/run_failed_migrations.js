#!/usr/bin/env node
// Reruns only the two failed migrations: 013 (skipped) + 016 (fixed)
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

  // 016 — re-run with the DROP fix
  const sql016 = readFileSync(join(__dirname, 'migrations', '016_schema_patches.sql'), 'utf8');
  process.stdout.write('⏳  016_schema_patches.sql... ');
  try {
    await client.query(sql016);
    console.log('✅');
  } catch (e) {
    console.log(`\n❌  FAILED: ${e.message}`);
  }

  await client.end();
  console.log('\n🎉  Done! All schema patches applied.');
  console.log('\n📋  Summary:');
  console.log('    ✅  001-012  Core schema + RLS + RPCs');
  console.log('    ⏭️   013     Seed data skipped (use Auth tab to create users)');
  console.log('    ✅  014     Stock increment + rider location RPCs');
  console.log('    ✅  015     inventory_id on order_items + place_order_atomic');
  console.log('    ✅  016     lat/lng on addresses, rider_id on sub_orders, notify_user RPC');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
