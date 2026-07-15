// ────────────────────────────────────────────────────────────
// Supabase Client — B7 Hardened
//
// Connection strategy:
//   All Supabase JS queries go through PostgREST (HTTP) — NOT through
//   direct Postgres connections — so PgBouncer (Supabase's built-in
//   connection pooler) is automatically used. No special config needed.
//
//   However, if you add direct `pg` queries (e.g. complex migrations),
//   use SUPABASE_DB_POOLER_URL (Transaction mode, port 6543), NOT
//   SUPABASE_DB_DIRECT_URL (direct, port 5432). This is critical:
//
//   Transaction mode (PgBouncer):
//     postgresql://postgres.xxx:password@aws-x.pooler.supabase.com:6543/postgres
//   Direct (no pooler — exhausts connections at scale):
//     postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres
//
// At Render (single dyno, free tier), this is not critical. But as soon
// as you add a second instance or worker, direct connections will fail
// under load. Use pooler URLs from day 1.
// ────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL             = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY        = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Check SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env'
  );
}

/**
 * Public Supabase client — uses the anon key.
 * All queries through this client respect Row Level Security (RLS) policies.
 * Use for customer-facing reads and any operation where RLS enforcement is desired.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }, // Server-side: no session persistence needed
});

/**
 * Admin Supabase client — uses the service role key.
 * BYPASSES RLS. Use only for admin operations, background jobs,
 * and server-side mutations that need unrestricted access.
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

