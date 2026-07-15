#!/usr/bin/env node
// Enable Supabase Realtime on the notifications table (B1)
// Run once: node enable_realtime.js
import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: `db.pzakkypaodqcmqjyiaco.supabase.co`,
  port: 5432, database: 'postgres', user: 'postgres',
  password: process.env.DB_PASS,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('✅  Connected');

  // Enable Realtime replication for the notifications table
  // This adds it to supabase_realtime publication so Supabase Realtime
  // broadcasts INSERT/UPDATE/DELETE events to subscribed clients.
  const sql = `
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  `;

  try {
    await client.query(sql);
    console.log('✅  Realtime enabled on notifications table');
    console.log('');
    console.log('📋  What this means:');
    console.log('    - Mobile NotificationsScreen will receive live updates via Supabase Realtime');
    console.log('    - Dashboard NotificationBell will receive live updates');
    console.log('    - No polling needed — events are pushed instantly');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('ℹ️   notifications already in supabase_realtime publication — no action needed');
    } else {
      console.log(`❌  Failed: ${e.message}`);
    }
  }

  await client.end();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
