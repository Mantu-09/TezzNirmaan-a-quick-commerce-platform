-- ────────────────────────────────────────────────────────────
-- Migration 038: rider_locations — P5-1 Real-Time Rider Tracking
--
-- The WebSocket server persists every location ping from a rider
-- to this table. It serves two purposes:
--   1. History/audit trail for dispute resolution
--   2. "Last known location" for customers who reconnect mid-delivery
--      (websocket.js queries the most recent row on WS connect)
--
-- Design notes:
--   • INSERT-only — we never UPDATE rows. Old rows are pruned by the
--     nightly cron (see below) to prevent unbounded growth.
--   • No PostGIS dependency — lat/lng stored as DOUBLE PRECISION.
--     The riders table (migration 016) stores the current_location
--     as a PostGIS geography; this table is a lightweight append log.
--   • rider_id references profiles(id) — matches the rest of the app.
--
-- Run in: Supabase SQL Editor → paste → Run
-- ────────────────────────────────────────────────────────────

-- ── 1. Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_locations (
  id          BIGSERIAL    PRIMARY KEY,
  rider_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat  BETWEEN -90  AND  90),
  lng         DOUBLE PRECISION NOT NULL CHECK (lng  BETWEEN -180 AND 180),
  recorded_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────
-- Primary access pattern: latest location for a given rider
CREATE INDEX IF NOT EXISTS idx_rider_locations_rider_recorded
  ON rider_locations(rider_id, recorded_at DESC);

-- ── 3. RLS ────────────────────────────────────────────────────
-- Only the backend service role writes here.
-- No public read — location data is sensitive.
ALTER TABLE rider_locations ENABLE ROW LEVEL SECURITY;

-- Riders can see their own location history (future rider-facing history feature)
DROP POLICY IF EXISTS "Riders can read own locations" ON rider_locations;
CREATE POLICY "Riders can read own locations"
  ON rider_locations
  FOR SELECT
  USING (auth.uid() = rider_id);

-- Platform admins can read all (for ops/dispute)
DROP POLICY IF EXISTS "Admins can read all rider locations" ON rider_locations;
CREATE POLICY "Admins can read all rider locations"
  ON rider_locations
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'platform_admin'
    OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- ── 4. Auto-prune old rows (keep 7 days) ──────────────────────
-- Supabase doesn't have native scheduled jobs in SQL.
-- Pruning is done by the pg-boss cron in jobQueue.js (P5-1).
-- This function is called by that cron:
CREATE OR REPLACE FUNCTION prune_old_rider_locations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rider_locations
  WHERE recorded_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ── 5. Verify ─────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name = 'rider_locations';
-- Expected: 1 row

-- SELECT relrowsecurity FROM pg_class WHERE relname = 'rider_locations';
-- Expected: true
