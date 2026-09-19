-- Migration 082: Rider Earnings & Payout Batches
-- (renamed from duplicate 027_rider_earnings.sql — fixed CREATE POLICY syntax)

-- payout_batches first (rider_earnings FK references it)
CREATE TABLE IF NOT EXISTS payout_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id          UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  total_paise       INTEGER NOT NULL CHECK (total_paise >= 0),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','paid')),
  payment_reference TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rider_earnings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id                UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  delivery_assignment_id  UUID NOT NULL REFERENCES delivery_assignments(id) ON DELETE CASCADE,
  base_earning_paise      INTEGER NOT NULL CHECK (base_earning_paise >= 0),
  bonus_paise             INTEGER NOT NULL DEFAULT 0 CHECK (bonus_paise >= 0),
  total_paise             INTEGER GENERATED ALWAYS AS (base_earning_paise + bonus_paise) STORED,
  payment_status          TEXT NOT NULL DEFAULT 'pending'
                            CHECK (payment_status IN ('pending','paid')),
  earned_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,
  payout_batch_id         UUID REFERENCES payout_batches(id) ON DELETE SET NULL,
  UNIQUE (delivery_assignment_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_rider_earnings_payout_batch'
  ) THEN
    ALTER TABLE rider_earnings
      ADD CONSTRAINT fk_rider_earnings_payout_batch
      FOREIGN KEY (payout_batch_id) REFERENCES payout_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rider_earnings_rider_id     ON rider_earnings(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_earned_at    ON rider_earnings(earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_status       ON rider_earnings(payment_status);
CREATE INDEX IF NOT EXISTS idx_payout_batches_rider_id     ON payout_batches(rider_id);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status       ON payout_batches(status);

ALTER TABLE rider_earnings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "riders_own_earnings"  ON rider_earnings;
DROP POLICY IF EXISTS "riders_own_payouts"   ON payout_batches;
DROP POLICY IF EXISTS "admin_all_earnings"   ON rider_earnings;
DROP POLICY IF EXISTS "admin_all_payouts"    ON payout_batches;

CREATE POLICY "riders_own_earnings"
  ON rider_earnings FOR SELECT
  USING (rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid()));

CREATE POLICY "riders_own_payouts"
  ON payout_batches FOR SELECT
  USING (rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid()));

CREATE POLICY "admin_all_earnings"
  ON rider_earnings FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin'));

CREATE POLICY "admin_all_payouts"
  ON payout_batches FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin'));
