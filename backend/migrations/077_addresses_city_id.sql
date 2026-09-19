-- 077_addresses_city_id.sql — P21 C2 fix
-- Adds city_id FK to addresses table so checkout can look up delivery zones + COD rules.
-- Without this, the checkout delivery-fee API call silently fails for all new addresses.
-- The city (text) column remains for display; city_id is for zone lookups.

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id) ON DELETE SET NULL;

COMMENT ON COLUMN addresses.city_id IS 'FK to cities(id) — used for delivery zone + COD validation in checkout. Null for legacy addresses (fallback: look up by city text name).';

-- Index for fast zone lookups
CREATE INDEX IF NOT EXISTS idx_addresses_city_id ON addresses(city_id) WHERE city_id IS NOT NULL;

-- Backfill: try to match existing text city values to the cities table (case-insensitive)
-- This is a best-effort update — unmatched rows stay null and fall back to city-name lookup.
UPDATE addresses a
SET city_id = c.id
FROM cities c
WHERE a.city_id IS NULL
  AND LOWER(TRIM(a.city)) = LOWER(TRIM(c.name));
