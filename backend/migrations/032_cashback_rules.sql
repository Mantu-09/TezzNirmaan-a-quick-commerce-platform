-- ────────────────────────────────────────────────────────────
-- Migration 032: Cashback Rules — P4-2B
--
-- cashback_rules: configurable tiers (edited from admin UI,
--   never needs a migration to change percentages).
--
-- Seeded with 3 platform-wide default tiers:
--   1% on orders < ₹500
--   2% on ₹500–₹2000
--   3% on orders ₹2000+
--
-- shop_id = NULL → platform-wide rule
-- shop_id = <uuid> → shop-specific override (higher precedence)
--
-- Cashback expires 90 days after award.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cashback_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  min_order_paise   INTEGER     NOT NULL DEFAULT 0,
  max_order_paise   INTEGER,                              -- NULL = no upper bound
  cashback_percent  NUMERIC(4,2) NOT NULL
                    CHECK (cashback_percent >= 0 AND cashback_percent <= 100),
  shop_id           UUID        REFERENCES shops(id) ON DELETE CASCADE, -- NULL = platform-wide
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until       TIMESTAMPTZ,                          -- NULL = no expiry
  created_by        UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashback_rules_active      ON cashback_rules (is_active);
CREATE INDEX IF NOT EXISTS idx_cashback_rules_shop_id     ON cashback_rules (shop_id);
CREATE INDEX IF NOT EXISTS idx_cashback_rules_min_order   ON cashback_rules (min_order_paise);

COMMENT ON TABLE cashback_rules IS
  'Configurable cashback tiers. shop_id=NULL means platform-wide.
   Shop-specific rules override platform rules for that shop.
   Edit via admin UI without migrations.';
COMMENT ON COLUMN cashback_rules.cashback_percent IS
  'Percentage of order total to credit as cashback. e.g. 2.00 = 2%.';
COMMENT ON COLUMN cashback_rules.shop_id IS
  'NULL = applies to all orders. Non-null = only for orders from this shop.';

-- ── Auto-update updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_cashback_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashback_rules_updated_at ON cashback_rules;
CREATE TRIGGER trg_cashback_rules_updated_at
  BEFORE UPDATE ON cashback_rules
  FOR EACH ROW EXECUTE FUNCTION update_cashback_rules_updated_at();

-- ── Seed default platform-wide rules ─────────────────────────
INSERT INTO cashback_rules (min_order_paise, max_order_paise, cashback_percent) VALUES
  (0,      49999,  1.00),   -- 1% on orders < ₹500
  (50000,  199999, 2.00),   -- 2% on ₹500–₹1999
  (200000, NULL,   3.00)    -- 3% on orders ₹2000+
ON CONFLICT DO NOTHING;
