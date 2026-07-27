-- ────────────────────────────────────────────────────────────
-- Migration 040 — Muzaffarpur Activation (P5-6)
--
-- 1. Adds `notified` column to city_waitlist so we can track
--    which signups have already received the launch SMS.
--    (The column was referenced in the service but never existed
--     in the original 035_city_waitlist.sql.)
--
-- 2. Sets Muzaffarpur delivery_radius_km = 10
--    (smaller than Patna's 15 km — city is more compact)
--
-- 3. Activates Muzaffarpur (is_active = true, launch_date = today)
--    NOTE: Do NOT run step 3 until at least 2 shops are live
--    in Patna. Use the admin dashboard (POST /admin/cities/:id/activate)
--    for the actual go-live to trigger the waitlist SMS blast.
--    This SQL is for the DB schema change only; activation should
--    happen via the API endpoint so city-notification fires.
-- ────────────────────────────────────────────────────────────

-- ── 1. Add `notified` column to city_waitlist ─────────────────
-- Tracks whether the launch-day SMS has been sent to this signup.
-- Default false — all existing signups are un-notified.

ALTER TABLE city_waitlist
  ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT false;

-- Index for the worker query: SELECT WHERE notified = false
CREATE INDEX IF NOT EXISTS city_waitlist_notified_idx
  ON city_waitlist (city_id, notified)
  WHERE notified = false;

-- ── 2. Set Muzaffarpur delivery radius to 10 km ──────────────
-- Muzaffarpur is more compact than Patna (city core ≈ 10 km²).
-- Can be widened later via admin panel as shop coverage grows.

UPDATE cities
SET delivery_radius_km = 10
WHERE name = 'Muzaffarpur'
  AND state = 'Bihar';

-- ── 3. (OPTIONAL — see note above) Activate Muzaffarpur ───────
-- Uncomment ONLY when ready to go live AND you want to skip
-- the admin dashboard flow (e.g., for hotfix / backfill).
-- Prefer using POST /admin/cities/:cityId/activate instead.

-- UPDATE cities
-- SET   is_active   = true,
--       launch_date = CURRENT_DATE
-- WHERE name = 'Muzaffarpur'
--   AND state = 'Bihar';
