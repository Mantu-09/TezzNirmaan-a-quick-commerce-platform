-- 067_emi_plans.sql - P15-4
-- EMI installment plans for B2B large orders.

CREATE TABLE IF NOT EXISTS emi_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   UUID NOT NULL REFERENCES contractor_profiles(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  total_paise     BIGINT NOT NULL,
  installments    INTEGER NOT NULL CHECK (installments IN (3, 6, 12)),
  frequency       TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','monthly')),
  per_emi_paise   BIGINT NOT NULL,
  next_due_date   DATE,
  paid_count      INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','defaulted')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emi_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES emi_plans(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL,
  due_date    DATE NOT NULL,
  paid_at     TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','paid','overdue')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emi_plans_contractor  ON emi_plans (contractor_id);
CREATE INDEX IF NOT EXISTS idx_emi_plans_status      ON emi_plans (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_emi_payments_plan     ON emi_payments (plan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_emi_payments_overdue  ON emi_payments (due_date) WHERE status = 'pending';

COMMENT ON TABLE emi_plans     IS 'B2B EMI installment plans - P15-4';
COMMENT ON TABLE emi_payments  IS 'Individual EMI payment schedule - P15-4';
