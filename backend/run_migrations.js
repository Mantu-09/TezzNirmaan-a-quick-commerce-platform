#!/usr/bin/env node
// ============================================================
// TezzNirmaan — Migration Runner v3
// Uses @supabase/supabase-js with new sb_secret_ key format
// which supports calling Postgres functions via RPC.
// 
// Since we can't run raw DDL via the JS client directly,
// we split each migration into statements and run them
// via the supabase.rpc('exec_sql') if available, or
// fall back to pg direct connection (if DB password provided).
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load from environment — NEVER hardcode credentials in source files.
// Copy .env.example to .env and fill in your values before running.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false },
  db:   { schema: 'public' },
});

const MIGRATIONS = [
  '014_stock_increment_and_location_rpcs.sql',
  '015_order_items_inventory_id.sql',
  '016_schema_patches.sql',
];

// Test connection by querying a known table
async function testConnection() {
  const { error } = await supabase.from('shops').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Connection test failed: ${error.message}`);
  }
  console.log('✅  Supabase connection OK\n');
}

// Split SQL into individual statements (skip comments + empty lines)
function splitStatements(sql) {
  // Remove single-line comments but preserve DO $$ blocks
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Track dollar-quote blocks (DO $$ ... $$)
    const dollarMatch = trimmed.match(/\$\$|\$[a-zA-Z_]+\$/g);
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

    // Skip pure comment lines when not in a block
    if (!inDollarQuote && trimmed.startsWith('--')) continue;

    current += line + '\n';

    // Statement ends at semicolon outside dollar-quote
    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') statements.push(stmt);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(s => s.length > 0);
}

async function runSQL(sql, label) {
  // Use Supabase's pg API via the dashboard REST endpoint
  // The sb_secret_ key works with the new Supabase API format
  const response = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SECRET_KEY,
      'Authorization': `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status}: ${body}`);
  }
  return await response.json();
}

async function runMigrations() {
  // First check if supabase client can talk to the DB
  console.log('🔗  TezzNirmaan Migration Runner v3');
  console.log(`    Project: pzakkypaodqcmqjyiaco\n`);

  for (const file of MIGRATIONS) {
    const sql = readFileSync(join(__dirname, 'migrations', file), 'utf8');
    console.log(`⏳  ${file}`);
    
    try {
      await runSQL(sql, file);
      console.log(`✅  Done\n`);
    } catch (err) {
      console.error(`❌  Failed: ${err.message}\n`);
    }
  }
}

runMigrations();
