-- ────────────────────────────────────────────────────────────
-- Migration 034 — Cities Table (P4-4A)
--
-- 1. Creates `cities` table with Bihar seed data
-- 2. Adds city_id + city_center_lat/lng columns to `shops`
-- 3. Backfills all existing shops to Patna (the only live city)
--
-- This migration also closes B-09 fully: route.service.js
-- already reads city_center_lat/lng from shops — now those
-- columns actually exist in the database.
--
-- Run 035_city_waitlist.sql immediately after this.
-- ────────────────────────────────────────────────────────────

-- ── 1. Cities table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cities (
  id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT             NOT NULL,
  state              TEXT             NOT NULL DEFAULT 'Bihar',
  center_lat         DOUBLE PRECISION NOT NULL,
  center_lng         DOUBLE PRECISION NOT NULL,
  delivery_radius_km DOUBLE PRECISION NOT NULL DEFAULT 15,
  is_active          BOOLEAN          NOT NULL DEFAULT false,
  launch_date        DATE,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Unique city name per state prevents duplicate seeds
CREATE UNIQUE INDEX IF NOT EXISTS cities_name_state_uidx
  ON cities (name, state);

-- ── 2. Seed Bihar cities ──────────────────────────────────────

INSERT INTO cities (name, center_lat, center_lng, is_active, launch_date) VALUES
  ('Patna',       25.5941, 85.1376, true,  '2026-07-01'),
  ('Muzaffarpur', 26.1209, 85.3647, false, null),
  ('Bhagalpur',   25.2425, 87.0029, false, null),
  ('Gaya',        24.7955, 84.9994, false, null),
  ('Darbhanga',   26.1542, 85.8918, false, null)
ON CONFLICT (name, state) DO NOTHING;

-- ── 3. Link shops to cities ───────────────────────────────────

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS city_id          UUID             REFERENCES cities(id),
  ADD COLUMN IF NOT EXISTS city_center_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS city_center_lng  DOUBLE PRECISION;

-- Index for city-filtered shop queries
CREATE INDEX IF NOT EXISTS shops_city_id_idx ON shops (city_id);

-- ── 4. Backfill all existing shops → Patna ───────────────────

UPDATE shops
SET city_id = (SELECT id FROM cities WHERE name = 'Patna')
WHERE city_id IS NULL;

UPDATE shops s
SET
  city_center_lat = c.center_lat,
  city_center_lng = c.center_lng
FROM cities c
WHERE c.id = s.city_id
  AND (s.city_center_lat IS NULL OR s.city_center_lng IS NULL);

-- ── 5. RLS Policies for cities ────────────────────────────────

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

-- Public read: mobile city picker fetches this before login (no auth token)
CREATE POLICY cities_public_read ON cities
  FOR SELECT USING (true);

-- Only the service role (backend) can insert or modify city rows
CREATE POLICY cities_service_write ON cities
  FOR ALL USING (auth.role() = 'service_role');
