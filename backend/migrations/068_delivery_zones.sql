-- 068_delivery_zones.sql - P15-6
-- City delivery zones with base fees and surge pricing.

CREATE TABLE IF NOT EXISTS delivery_zones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  polygon             JSONB,                   -- GeoJSON polygon for zone boundary
  base_fee_paise      BIGINT NOT NULL DEFAULT 2000,  -- Rs.20 default
  surge_multiplier    NUMERIC(3,2) DEFAULT 1.0,       -- 1.5 = 50% surge
  surge_start_hour    INTEGER DEFAULT 18,       -- 6 PM
  surge_end_hour      INTEGER DEFAULT 21,       -- 9 PM
  max_distance_km     NUMERIC(5,2) DEFAULT 10,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_city ON delivery_zones (city_id) WHERE is_active = true;

-- Seed example zones for Muzaffarpur (adjust city_id after insert)
-- Admin UI will manage these.

COMMENT ON TABLE delivery_zones IS 'Delivery zones per city with surge pricing - P15-6';
