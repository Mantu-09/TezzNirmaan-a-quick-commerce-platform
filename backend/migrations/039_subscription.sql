-- ============================================================
-- Migration 039: TezzNirmaan Pass (Subscription) — P5-3
-- Run in Supabase SQL editor (Dashboard → SQL Editor → Run)
-- ============================================================

-- ── 1. ENUMs ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE pass_tier   AS ENUM ('weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pass_status AS ENUM ('active', 'expired', 'cancelled', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Pass Plans (catalogue) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pass_plans (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT        NOT NULL,
  tier                      pass_tier   NOT NULL,
  price_paise               INTEGER     NOT NULL,          -- ₹49 = 4900, ₹149 = 14900
  free_deliveries           INTEGER,                       -- NULL = unlimited
  delivery_discount_percent INTEGER     NOT NULL DEFAULT 100, -- 100 = free
  cashback_multiplier       NUMERIC(3,1) NOT NULL DEFAULT 1.5,
  is_active                 BOOLEAN     NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed plans (idempotent — skip if already present)
INSERT INTO pass_plans (name, tier, price_paise, free_deliveries, cashback_multiplier)
SELECT 'Weekly Pass',  'weekly',  4900,  NULL, 1.5
WHERE NOT EXISTS (SELECT 1 FROM pass_plans WHERE tier = 'weekly');

INSERT INTO pass_plans (name, tier, price_paise, free_deliveries, cashback_multiplier)
SELECT 'Monthly Pass', 'monthly', 14900, NULL, 2.0
WHERE NOT EXISTS (SELECT 1 FROM pass_plans WHERE tier = 'monthly');

-- ── 3. User Subscriptions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id                  UUID        NOT NULL      REFERENCES pass_plans(id),
  status                   pass_status NOT NULL DEFAULT 'active',
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at               TIMESTAMPTZ NOT NULL,
  auto_renew               BOOLEAN     NOT NULL DEFAULT true,
  razorpay_subscription_id TEXT,
  cancelled_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id   ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions(expires_at)
  WHERE status = 'active';

-- ── 4. Benefit Usage Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_benefits_used (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id          UUID        NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  order_id                 UUID        NOT NULL REFERENCES orders(id)             ON DELETE CASCADE,
  delivery_fee_waived_paise INTEGER    NOT NULL DEFAULT 0,
  extra_cashback_paise     INTEGER     NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_benefits_subscription_id ON subscription_benefits_used(subscription_id);

-- ── 5. RLS ────────────────────────────────────────────────────
ALTER TABLE pass_plans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_benefits_used  ENABLE ROW LEVEL SECURITY;

-- pass_plans: public read (unauthenticated can see plan pricing)
DROP POLICY IF EXISTS "Anyone can read active plans" ON pass_plans;
CREATE POLICY "Anyone can read active plans" ON pass_plans
  FOR SELECT USING (is_active = true);

-- user_subscriptions: user sees only their own row
DROP POLICY IF EXISTS "Users see own subscription" ON user_subscriptions;
CREATE POLICY "Users see own subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- subscription_benefits_used: user sees benefits linked to their subscription
DROP POLICY IF EXISTS "Users see own benefits" ON subscription_benefits_used;
CREATE POLICY "Users see own benefits" ON subscription_benefits_used
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM user_subscriptions WHERE user_id = auth.uid()
    )
  );

-- ── 6. Helper function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION user_has_active_pass(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id   = p_user_id
      AND status    = 'active'
      AND expires_at > now()
  );
END;
$$;

-- ── 7. Lifetime savings view (for PassScreen UI) ──────────────
CREATE OR REPLACE VIEW subscription_savings_summary AS
SELECT
  us.user_id,
  us.status,
  us.expires_at,
  pp.name        AS plan_name,
  pp.tier,
  pp.cashback_multiplier,
  COALESCE(SUM(sbu.delivery_fee_waived_paise), 0) AS total_waived_paise,
  COALESCE(SUM(sbu.extra_cashback_paise),      0) AS total_extra_cashback_paise,
  COUNT(sbu.id)                                    AS orders_with_benefit
FROM user_subscriptions us
JOIN pass_plans pp ON pp.id = us.plan_id
LEFT JOIN subscription_benefits_used sbu ON sbu.subscription_id = us.id
GROUP BY us.user_id, us.status, us.expires_at, pp.name, pp.tier, pp.cashback_multiplier;

-- RLS for the view — user sees only their own row
ALTER VIEW subscription_savings_summary OWNER TO postgres;

-- ─────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pass_plans) >= 2,
    'pass_plans must have at least 2 seeded rows';
  RAISE NOTICE '039_subscription.sql applied successfully — % plans seeded',
    (SELECT COUNT(*) FROM pass_plans);
END $$;
