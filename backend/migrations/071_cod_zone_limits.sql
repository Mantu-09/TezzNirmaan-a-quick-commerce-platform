-- 071_cod_zone_limits.sql - P16-8
-- Add COD limit and enabled flag to delivery zones.

ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS cod_enabled      BOOLEAN DEFAULT true;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS cod_limit_paise  BIGINT  DEFAULT 50000;  -- Default Rs.500 COD limit

COMMENT ON COLUMN delivery_zones.cod_enabled     IS 'Whether Cash on Delivery is allowed in this zone';
COMMENT ON COLUMN delivery_zones.cod_limit_paise IS 'Max order value in paise eligible for COD in this zone';