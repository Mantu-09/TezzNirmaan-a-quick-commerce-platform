-- 069_low_stock_alerts.sql - P15-8 (FIXED: shop_inventory not inventory)
-- Per-product low-stock alert thresholds for shops.

CREATE TABLE IF NOT EXISTS low_stock_thresholds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id    UUID NOT NULL UNIQUE REFERENCES shop_inventory(id) ON DELETE CASCADE,
  threshold_qty   INTEGER NOT NULL DEFAULT 5,
  alert_sent_at   TIMESTAMPTZ,               -- Prevents re-alerting within 24h
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_low_stock_inventory ON low_stock_thresholds (inventory_id);

COMMENT ON TABLE low_stock_thresholds IS 'Shop product low-stock alert configuration - P15-8';
