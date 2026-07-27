-- ────────────────────────────────────────────────────────────
-- Migration 035 — City Waitlist (P4-4A)
--
-- Depends on: 034_cities.sql (cities table must exist first)
--
-- Creates `city_waitlist` table for customers who sign up to
-- be notified when TezzNirmaan launches in their city.
--
-- The mobile app shows an inline waitlist form when:
--   - The user's GPS location resolves to a coming-soon city
--   - The user taps a "Coming Soon" city in the city picker
--
-- Endpoint: POST /public/city-waitlist
--   Body: { city_id, name, phone }
--   Idempotent — duplicate (phone, city_id) pairs are silently
--   ignored so double-taps never show an error to the user.
-- ────────────────────────────────────────────────────────────

-- ── 1. City Waitlist table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS city_waitlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID        NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Unique constraint ──────────────────────────────────────
-- One signup per phone number per city.
-- The backend uses ON CONFLICT DO NOTHING so the API stays
-- idempotent — safe to call multiple times.

CREATE UNIQUE INDEX IF NOT EXISTS city_waitlist_phone_city_uidx
  ON city_waitlist (phone, city_id);

-- Index for admin queries: list all signups for a given city
CREATE INDEX IF NOT EXISTS city_waitlist_city_id_idx
  ON city_waitlist (city_id);

-- ── 3. RLS Policies ──────────────────────────────────────────

ALTER TABLE city_waitlist ENABLE ROW LEVEL SECURITY;

-- Anonymous users (pre-login) can insert their own signup.
-- No auth token required — this is called before OTP login.
CREATE POLICY city_waitlist_anon_insert ON city_waitlist
  FOR INSERT WITH CHECK (true);

-- Only the service role (backend) can read waitlist rows.
-- Admin dashboard reads via the Node backend (service key),
-- never directly from the browser.
CREATE POLICY city_waitlist_service_read ON city_waitlist
  FOR SELECT USING (auth.role() = 'service_role');

-- Service role can also delete rows (e.g. GDPR erasure)
CREATE POLICY city_waitlist_service_delete ON city_waitlist
  FOR DELETE USING (auth.role() = 'service_role');
