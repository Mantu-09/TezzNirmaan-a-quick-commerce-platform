-- ────────────────────────────────────────────────────────────
-- Migration 044 — Bhagalpur Activation (P6-7)
--
-- Activates Bhagalpur city (is_active = true, launch_date = today).
--
-- NOTE: Prefer using POST /admin/cities/:cityId/activate via the
-- admin dashboard so city-notification.service fires the waitlist
-- SMS blast automatically. Run this SQL only as a fallback.
--
-- TC-52 fix: Migration 034 seeded Bhagalpur with is_active=false.
-- No subsequent migration activated it. This migration corrects that.
-- ────────────────────────────────────────────────────────────

-- ── 1. Activate Bhagalpur ─────────────────────────────────────

UPDATE cities
SET
  is_active   = true,
  launch_date = CURRENT_DATE
WHERE name  = 'Bhagalpur'
  AND state = 'Bihar';

-- ── 2. Verify ─────────────────────────────────────────────────
-- Run after applying: expected output → is_active = true, launch_date set

-- SELECT name, is_active, launch_date, delivery_radius_km
-- FROM cities
-- WHERE name = 'Bhagalpur';
