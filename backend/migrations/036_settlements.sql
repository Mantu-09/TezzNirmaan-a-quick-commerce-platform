-- ────────────────────────────────────────────────────────────
-- Migration 036 — Settlement Engine (P4-4B)
--
-- Tracks weekly payouts from TezzNirmaan to shop owners.
--
-- Tables:
--   commission_rules    — configurable per-shop commission %
--   settlement_batches  — one row per weekly payout per shop
--   settlement_items    — one row per order within a batch
--
-- RPC:
--   get_orders_for_settlement(p_start, p_end)
--     Returns delivered orders grouped by shop for the period,
--     with the shop owner profile_id so notifications can be sent.
--
-- Run after 035_city_waitlist.sql.
-- ────────────────────────────────────────────────────────────

-- ── 1. Commission Rules ───────────────────────────────────────
-- shop_id NULL = platform default (applies to all shops unless
-- overridden by a shop-specific rule).

CREATE TABLE IF NOT EXISTS commission_rules (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            UUID         REFERENCES shops(id) ON DELETE CASCADE,
  commission_percent NUMERIC(4,2) NOT NULL DEFAULT 5.00,
  valid_from         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  valid_until        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Only one active default rule (shop_id IS NULL) and one per shop
  CONSTRAINT commission_rules_unique_default  UNIQUE NULLS NOT DISTINCT (shop_id)
);

-- Seed: 5% platform default
INSERT INTO commission_rules (commission_percent)
VALUES (5.00)
ON CONFLICT DO NOTHING;

-- ── 2. Settlement Batches ─────────────────────────────────────
-- One row per shop per weekly settlement run.
-- status: pending → processing → paid | failed

CREATE TABLE IF NOT EXISTS settlement_batches (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id              UUID        NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  period_start         DATE        NOT NULL,
  period_end           DATE        NOT NULL,
  gross_amount_paise   BIGINT      NOT NULL,   -- Total order value in paise
  commission_paise     BIGINT      NOT NULL,   -- TezzNirmaan cut
  net_amount_paise     BIGINT      NOT NULL,   -- What the shop receives
  order_count          INTEGER     NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','processing','paid','failed')),
  payment_method       TEXT        CHECK (payment_method IN ('upi','bank_transfer')),
  payment_reference    TEXT,
  notes                TEXT,
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate batch for the same shop + period
  CONSTRAINT settlement_batches_shop_period_uidx UNIQUE (shop_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS settlement_batches_shop_id_idx  ON settlement_batches (shop_id);
CREATE INDEX IF NOT EXISTS settlement_batches_status_idx   ON settlement_batches (status);
CREATE INDEX IF NOT EXISTS settlement_batches_period_idx   ON settlement_batches (period_start, period_end);

-- ── 3. Settlement Items ───────────────────────────────────────
-- One row per order within a settlement batch.
-- Allows admin to audit exactly which orders are included.

CREATE TABLE IF NOT EXISTS settlement_items (
  id                  UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID   NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
  order_id            UUID   NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  sub_order_id        UUID   REFERENCES sub_orders(id) ON DELETE SET NULL,
  gross_amount_paise  BIGINT NOT NULL,
  commission_paise    BIGINT NOT NULL,
  net_amount_paise    BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_items_batch_id_idx ON settlement_items (batch_id);
CREATE INDEX IF NOT EXISTS settlement_items_order_id_idx ON settlement_items (order_id);

-- ── 4. RLS Policies ──────────────────────────────────────────

ALTER TABLE commission_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_items   ENABLE ROW LEVEL SECURITY;

-- commission_rules: shop owners can read their own rule + default
CREATE POLICY commission_rules_shop_read ON commission_rules
  FOR SELECT USING (
    shop_id IS NULL OR
    shop_id IN (
      SELECT s.id FROM shops s WHERE s.owner_id = auth.uid()
    )
  );

-- Service role manages commission rules
CREATE POLICY commission_rules_service_all ON commission_rules
  FOR ALL USING (auth.role() = 'service_role');

-- settlement_batches: shop owner sees own batches via shops.owner_id
CREATE POLICY settlement_batches_owner_read ON settlement_batches
  FOR SELECT USING (
    shop_id IN (
      SELECT s.id FROM shops s WHERE s.owner_id = auth.uid()
    )
  );

-- Service role has full access (backend uses service key)
CREATE POLICY settlement_batches_service_all ON settlement_batches
  FOR ALL USING (auth.role() = 'service_role');

-- settlement_items: shop owner sees items for their own batches
CREATE POLICY settlement_items_owner_read ON settlement_items
  FOR SELECT USING (
    batch_id IN (
      SELECT sb.id
      FROM settlement_batches sb
      JOIN shops s ON s.id = sb.shop_id
      WHERE s.owner_id = auth.uid()
    )
  );

CREATE POLICY settlement_items_service_all ON settlement_items
  FOR ALL USING (auth.role() = 'service_role');

-- ── 5. RPC: get_orders_for_settlement ────────────────────────
-- Returns delivered sub_orders grouped by shop for a date range.
-- Called by settlement.service.js weekly cron.
-- Returns JSONB so Node can iterate without multiple round-trips.

CREATE OR REPLACE FUNCTION get_orders_for_settlement(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  shop_id       UUID,
  owner_id      UUID,
  shop_name     TEXT,
  order_count   BIGINT,
  gross_paise   BIGINT,
  order_ids     UUID[],
  sub_order_ids UUID[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    o.shop_id,
    sh.owner_id,
    sh.name              AS shop_name,
    COUNT(so.id)         AS order_count,
    SUM(so.total_amount)::BIGINT AS gross_paise,
    ARRAY_AGG(DISTINCT o.id) AS order_ids,
    ARRAY_AGG(so.id)         AS sub_order_ids
  FROM sub_orders so
  JOIN orders o  ON o.id  = so.order_id
  JOIN shops  sh ON sh.id = o.shop_id
  WHERE so.status = 'delivered'
    AND so.updated_at >= p_start
    AND so.updated_at <  p_end
    AND NOT EXISTS (
      SELECT 1
      FROM settlement_items si
      JOIN settlement_batches sb ON sb.id = si.batch_id
      WHERE si.sub_order_id = so.id
        AND sb.status IN ('pending','processing','paid')
    )
  GROUP BY o.shop_id, sh.owner_id, sh.name;
$$;
