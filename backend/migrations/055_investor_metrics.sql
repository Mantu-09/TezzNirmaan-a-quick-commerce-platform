-- ────────────────────────────────────────────────────────────
-- Migration 055: Investor Metrics Schema — P10-6
--
-- Creates:
--   monthly_metrics    — nightly GMV/order/customer snapshots
--   customer_cohorts   — one row per customer (acquisition month)
--   cohort_retention   — monthly active status per cohort
--
-- Also creates:
--   calculate_monthly_metrics() stored procedure (called nightly)
--   pg_cron schedule (1 AM IST daily)
--
-- Run after: 052_payout_requests_and_delivery_issues.sql
-- ────────────────────────────────────────────────────────────

-- ── monthly_metrics ───────────────────────────────────────────
-- Nightly snapshot of platform-level metrics per calendar month.
-- Populated by calculate_monthly_metrics() stored procedure.
-- Backfill: call SELECT calculate_monthly_metrics('2026-01-01'::date)
--           for each past month you want to seed.
CREATE TABLE IF NOT EXISTS monthly_metrics (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month                   DATE        NOT NULL UNIQUE,   -- First day of month (e.g. 2026-08-01)
  gmv_paise               BIGINT      DEFAULT 0,
  order_count             INTEGER     DEFAULT 0,
  new_customers           INTEGER     DEFAULT 0,
  returning_customers     INTEGER     DEFAULT 0,
  active_shops            INTEGER     DEFAULT 0,
  active_riders           INTEGER     DEFAULT 0,
  avg_order_value_paise   BIGINT      DEFAULT 0,
  cancelled_orders        INTEGER     DEFAULT 0,
  refunded_amount_paise   BIGINT      DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_metrics_month
  ON monthly_metrics (month DESC);

-- ── customer_cohorts ──────────────────────────────────────────
-- One row per customer. Created/updated on first order.
-- Used to build cohort retention curves for investors.
CREATE TABLE IF NOT EXISTS customer_cohorts (
  user_id                 UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acquisition_month       DATE        NOT NULL,           -- First order month (date_trunc('month', first_order_at))
  first_order_id          UUID        REFERENCES orders(id) ON DELETE SET NULL,
  first_order_value_paise BIGINT,
  acquisition_channel     TEXT        DEFAULT 'organic'   -- 'organic' | 'referral' | 'campaign'
                          CHECK (acquisition_channel IN ('organic', 'referral', 'campaign')),
  city_id                 UUID        REFERENCES cities(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_cohorts_month
  ON customer_cohorts (acquisition_month);

CREATE INDEX IF NOT EXISTS idx_customer_cohorts_city
  ON customer_cohorts (city_id);

-- ── cohort_retention ──────────────────────────────────────────
-- Aggregated monthly active counts per acquisition cohort.
-- One row per (cohort_month, active_month) pair.
-- active_month >= cohort_month always.
CREATE TABLE IF NOT EXISTS cohort_retention (
  cohort_month      DATE    NOT NULL,
  active_month      DATE    NOT NULL,
  active_users      INTEGER DEFAULT 0,
  total_cohort_size INTEGER DEFAULT 0,   -- Total customers in this cohort (denominator)
  gmv_paise         BIGINT  DEFAULT 0,
  PRIMARY KEY (cohort_month, active_month)
);

CREATE INDEX IF NOT EXISTS idx_cohort_retention_cohort
  ON cohort_retention (cohort_month, active_month);

-- ── Row-Level Security ────────────────────────────────────────
-- These tables contain aggregate/anonymised data only.
-- Platform admin reads via service_role (bypasses RLS).
-- No customer-facing RLS needed.
ALTER TABLE monthly_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_cohorts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_retention  ENABLE ROW LEVEL SECURITY;

-- ── calculate_monthly_metrics stored procedure ─────────────────
-- Upserts one row into monthly_metrics for the given calendar month.
-- Safe to call repeatedly (ON CONFLICT DO UPDATE).
--
-- Usage:
--   CALL calculate_monthly_metrics('2026-08-01'::DATE);
--   CALL calculate_monthly_metrics(date_trunc('month', now())::DATE);
CREATE OR REPLACE PROCEDURE calculate_monthly_metrics(p_month DATE)
LANGUAGE plpgsql AS $$
DECLARE
  v_month_start TIMESTAMPTZ := p_month::TIMESTAMPTZ;
  v_month_end   TIMESTAMPTZ := (p_month + INTERVAL '1 month')::TIMESTAMPTZ;
BEGIN
  INSERT INTO monthly_metrics (
    month,
    gmv_paise,
    order_count,
    new_customers,
    returning_customers,
    active_shops,
    active_riders,
    avg_order_value_paise,
    cancelled_orders
  )
  SELECT
    p_month,
    -- GMV: orders.total_amount is stored in rupees (integer), convert to paise
    COALESCE(SUM(o.total_amount) * 100, 0)::BIGINT,
    COUNT(o.id),
    -- New customers: first order ever in this month
    COUNT(DISTINCT o.user_id) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.user_id = o.user_id
          AND o2.created_at < v_month_start
          AND o2.status NOT IN ('cancelled', 'refunded')
      )
    ),
    -- Returning customers: ordered before + ordered this month
    COUNT(DISTINCT o.user_id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.user_id = o.user_id
          AND o2.created_at < v_month_start
          AND o2.status NOT IN ('cancelled', 'refunded')
      )
    ),
    -- Unique shops with at least one completed order
    COUNT(DISTINCT so.shop_id),
    -- Unique riders with at least one completed delivery
    COUNT(DISTINCT da.rider_id),
    -- Average order value in paise (excluding cancelled)
    COALESCE(
      AVG(o.total_amount * 100) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')),
      0
    )::BIGINT,
    COUNT(o.id) FILTER (WHERE o.status = 'cancelled')
  FROM orders o
  LEFT JOIN sub_orders so
    ON so.order_id = o.id
  LEFT JOIN delivery_assignments da
    ON da.sub_order_id = so.id
    AND da.status = 'delivered'
  WHERE o.created_at >= v_month_start
    AND o.created_at <  v_month_end
  ON CONFLICT (month) DO UPDATE SET
    gmv_paise             = EXCLUDED.gmv_paise,
    order_count           = EXCLUDED.order_count,
    new_customers         = EXCLUDED.new_customers,
    returning_customers   = EXCLUDED.returning_customers,
    active_shops          = EXCLUDED.active_shops,
    active_riders         = EXCLUDED.active_riders,
    avg_order_value_paise = EXCLUDED.avg_order_value_paise,
    cancelled_orders      = EXCLUDED.cancelled_orders;
END;
$$;

-- ── pg_cron: nightly recalculation at 1 AM UTC (≈ 6:30 AM IST) ──
-- Recalculates the current month every night so today's orders appear.
-- Requires pg_cron extension enabled in Supabase (Database → Extensions).
-- If pg_cron is not enabled, comment this block out and run manually.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'calculate-monthly-metrics',
      '0 1 * * *',
      $$CALL calculate_monthly_metrics(date_trunc('month', now())::DATE);$$
    );
  END IF;
END;
$$;

-- ── Backfill helper comment ────────────────────────────────────
-- To backfill historical months after running this migration:
--
--   DO $$
--   DECLARE m DATE := '2026-01-01'; -- Change to your earliest month
--   BEGIN
--     WHILE m <= date_trunc('month', now()) LOOP
--       CALL calculate_monthly_metrics(m);
--       m := m + INTERVAL '1 month';
--     END LOOP;
--   END;
--   $$;
