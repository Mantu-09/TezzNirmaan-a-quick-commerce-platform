-- 061_address_latlng.sql — P13-3
-- Adds lat/lng/place_id to addresses table for Google Maps autocomplete
-- These columns allow delivery distance calculation and map pin display.

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS lat      NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lng      NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS place_id TEXT;

COMMENT ON COLUMN addresses.lat      IS 'Latitude from Google Places — set on address creation/update';
COMMENT ON COLUMN addresses.lng      IS 'Longitude from Google Places — set on address creation/update';
COMMENT ON COLUMN addresses.place_id IS 'Google Places ID — used to avoid duplicate address geocoding';
