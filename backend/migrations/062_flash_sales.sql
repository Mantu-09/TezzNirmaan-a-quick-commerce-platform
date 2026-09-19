-- 062_flash_sales.sql — P13-5
-- Flash sales: time-limited deep discount promotions.
-- Used for "Deal of the Hour" sections on homepage.
-- City-scoped or global. Can target specific products or categories.

CREATE TABLE IF NOT EXISTS flash_sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,                    -- "Deal of the Hour 🔥"
  discount_pct     INTEGER NOT NULL CHECK (discount_pct > 0 AND discount_pct <= 100),
  max_discount_paise BIGINT,                         -- Cap at e.g. 20000 = Rs.200
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  product_ids      UUID[],                           -- Specific products or NULL = all
  category         TEXT,                             -- Or all products in category
  city_id          UUID REFERENCES cities(id) ON DELETE SET NULL, -- NULL = global
  is_active        BOOLEAN DEFAULT true,
  usage_count      INTEGER DEFAULT 0,
  max_usage        INTEGER,                          -- NULL = unlimited
  created_at       TIMESTAMPTZ DEFAULT now(),
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_flash_sales_active ON flash_sales (starts_at, ends_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flash_sales_city   ON flash_sales (city_id) WHERE is_active = true;

COMMENT ON TABLE flash_sales IS 'Time-limited promotional sales — P13-5';
