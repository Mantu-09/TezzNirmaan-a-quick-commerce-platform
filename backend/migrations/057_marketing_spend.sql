-- ─────────────────────────────────────────────────────────────
-- 057_marketing_spend.sql — P11-6
--
-- Marketing spend tracking table.
-- Purpose: populate real CAC in investor analytics once paid
-- campaigns begin. Until then, all rows have amount_paise=0
-- and the service returns cac_paise=0 (same as today).
--
-- Also adds UTM columns to customer_cohorts for channel attribution.
-- ─────────────────────────────────────────────────────────────

-- ── marketing_spend ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_spend (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month                     DATE        NOT NULL,           -- First day of month (e.g. 2026-08-01)
  channel                   TEXT        NOT NULL,           -- 'meta' | 'google' | 'influencer' | 'whatsapp' | 'other'
  campaign_name             TEXT,                           -- Optional: 'Patna launch' etc.
  amount_paise              BIGINT      NOT NULL DEFAULT 0, -- Spend in paise (₹1 = 100 paise)
  new_customers_attributed  INTEGER     NOT NULL DEFAULT 0, -- Customers from this campaign (manual/UTM)
  notes                     TEXT,
  created_by                UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (month, channel, campaign_name)
);

-- ── Channel constraint ────────────────────────────────────────
ALTER TABLE marketing_spend
  DROP CONSTRAINT IF EXISTS marketing_spend_channel_check;

ALTER TABLE marketing_spend
  ADD CONSTRAINT marketing_spend_channel_check
  CHECK (channel IN ('meta', 'google', 'influencer', 'whatsapp', 'other'));

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_marketing_spend_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_spend_updated_at ON marketing_spend;
CREATE TRIGGER trg_marketing_spend_updated_at
  BEFORE UPDATE ON marketing_spend
  FOR EACH ROW EXECUTE FUNCTION update_marketing_spend_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE marketing_spend ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage marketing spend" ON marketing_spend;
CREATE POLICY "Admins manage marketing spend"
  ON marketing_spend
  FOR ALL
  USING  ((auth.jwt() ->> 'role') = 'platform_admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'platform_admin');

-- ── UTM attribution columns on customer_cohorts ───────────────
-- Allows tracking which channel acquired each customer (from UTM params on first order)
ALTER TABLE customer_cohorts
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_marketing_spend_month   ON marketing_spend (month DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_spend_channel ON marketing_spend (channel);
