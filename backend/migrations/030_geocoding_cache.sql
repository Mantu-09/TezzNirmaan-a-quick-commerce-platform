-- ────────────────────────────────────────────────────────────
-- Migration 030: Geocoding Cache + Shop City Centre — P4-1C
--
-- Fix B-08: Cache dropoff coordinates on delivery_assignments so
-- optimizeRiderRoute() never re-geocodes the same address twice.
--
-- Fix B-09: Add city_center_lat/lng to shops so the route service
-- can fall back to the shop's actual city instead of a hardcoded
-- Patna coordinate. Useful when expanding to Muzaffarpur, Gaya, etc.
-- ────────────────────────────────────────────────────────────

-- ── Geocoding cache on delivery assignments (B-08) ────────────

ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS dropoff_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dropoff_lng  DOUBLE PRECISION;

-- Partial index: only index rows that have coordinates cached.
-- Keeps the index tiny and makes cache-hit lookups fast.
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_dropoff_coords
  ON delivery_assignments (id)
  WHERE dropoff_lat IS NOT NULL AND dropoff_lng IS NOT NULL;

COMMENT ON COLUMN delivery_assignments.dropoff_lat IS
  'Cached geocoded latitude of the delivery dropoff address. Set on assignment creation. Avoids repeated Google Maps API calls.';
COMMENT ON COLUMN delivery_assignments.dropoff_lng IS
  'Cached geocoded longitude of the delivery dropoff address.';

-- ── Shop city-centre fallback (B-09) ─────────────────────────

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS city_center_lat DOUBLE PRECISION DEFAULT 25.5941,
  ADD COLUMN IF NOT EXISTS city_center_lng DOUBLE PRECISION DEFAULT 85.1376;

-- Populate defaults for existing shops (Patna centre)
UPDATE shops
SET
  city_center_lat = 25.5941,
  city_center_lng = 85.1376
WHERE city_center_lat IS NULL OR city_center_lng IS NULL;

COMMENT ON COLUMN shops.city_center_lat IS
  'Latitude of the city centre for this shop. Used as rider-location fallback when no GPS fix is available. Default: Patna (25.5941°N).';
COMMENT ON COLUMN shops.city_center_lng IS
  'Longitude of the city centre for this shop. Default: Patna (85.1376°E).';
