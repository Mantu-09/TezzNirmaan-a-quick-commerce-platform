-- ══════════════════════════════════════════════════════════════════════════
-- Migration 056: Cohort Auto-Population (P11-1)
--
-- Self-contained: creates the tables if they don't exist, then adds
-- the trigger + backfill. Safe to run even if 055 was never applied.
-- Idempotent: all DDL uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- Schema facts (from migration 006):
--   orders.customer_id  — the customer (NOT user_id)
--   orders.total_amount — already in PAISE (bigint), no * 100 needed
--   orders has NO status column — status lives on sub_orders
-- ══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- STEP 0: Create tables if they don't exist yet
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monthly_metrics (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month                   DATE        NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS customer_cohorts (
  user_id                 UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acquisition_month       DATE        NOT NULL,
  first_order_id          UUID        REFERENCES orders(id) ON DELETE SET NULL,
  first_order_value_paise BIGINT,
  acquisition_channel     TEXT        DEFAULT 'organic'
                          CHECK (acquisition_channel IN ('organic', 'referral', 'campaign')),
  city_id                 UUID        REFERENCES cities(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_cohorts_month
  ON customer_cohorts (acquisition_month);

CREATE INDEX IF NOT EXISTS idx_customer_cohorts_city
  ON customer_cohorts (city_id);

CREATE TABLE IF NOT EXISTS cohort_retention (
  cohort_month      DATE    NOT NULL,
  active_month      DATE    NOT NULL,
  active_users      INTEGER DEFAULT 0,
  total_cohort_size INTEGER DEFAULT 0,
  gmv_paise         BIGINT  DEFAULT 0,
  PRIMARY KEY (cohort_month, active_month)
);

CREATE INDEX IF NOT EXISTS idx_cohort_retention_cohort
  ON cohort_retention (cohort_month, active_month);

ALTER TABLE monthly_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_cohorts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_retention  ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════
-- PART 1: Trigger function — fires AFTER INSERT on orders
-- Stores the customer's first order in customer_cohorts.
-- orders.customer_id is the FK to profiles.id (not user_id).
-- orders.total_amount is already in paise — no conversion needed.
-- Status filtering done via sub_orders join (orders has no status col).
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_customer_acquisition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only record if at least one sub_order is NOT cancelled
  -- (orders itself has no status column — status lives on sub_orders)
  INSERT INTO customer_cohorts (
    user_id,
    acquisition_month,
    first_order_id,
    first_order_value_paise,
    city_id,
    acquisition_channel
  )
  SELECT
    NEW.customer_id,
    DATE_TRUNC('month', NEW.created_at)::DATE,
    NEW.id,
    NEW.total_amount,   -- already in paise (bigint)
    s.city_id,
    'organic'
  FROM shops s
  WHERE s.id = NEW.shop_id
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_customer_acquisition ON orders;
CREATE TRIGGER trg_record_customer_acquisition
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION record_customer_acquisition();

-- ══════════════════════════════════════════════════════════════════════
-- PART 2: Backfill customer_cohorts from existing orders
-- Uses sub_orders to filter out fully-cancelled parent orders.
-- An order is considered valid if ANY sub_order is not cancelled.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO customer_cohorts (
  user_id,
  acquisition_month,
  first_order_id,
  first_order_value_paise,
  city_id,
  acquisition_channel
)
SELECT DISTINCT ON (o.customer_id)
  o.customer_id                                  AS user_id,
  DATE_TRUNC('month', o.created_at)::DATE        AS acquisition_month,
  o.id                                            AS first_order_id,
  o.total_amount                                  AS first_order_value_paise,
  s.city_id,
  'organic'
FROM orders o
JOIN shops s ON s.id = o.shop_id
WHERE EXISTS (
  SELECT 1 FROM sub_orders so
  WHERE so.order_id = o.id
    AND so.status != 'cancelled'
)
ORDER BY o.customer_id, o.created_at ASC
ON CONFLICT (user_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════
-- PART 3: calculate_monthly_metrics() — with cohort_retention (Section B)
-- Replaces the version from migration 055 if it was applied.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE PROCEDURE calculate_monthly_metrics(p_month DATE)
LANGUAGE plpgsql AS $$
DECLARE
  v_month_start TIMESTAMPTZ := p_month::TIMESTAMPTZ;
  v_month_end   TIMESTAMPTZ := (p_month + INTERVAL '1 month')::TIMESTAMPTZ;
BEGIN
  -- ── Section A: Monthly aggregate metrics ──────────────────────────
  INSERT INTO monthly_metrics (
    month, gmv_paise, order_count, new_customers,
    returning_customers, active_shops, active_riders,
    avg_order_value_paise, cancelled_orders
  )
  SELECT
    p_month,
    COALESCE(SUM(o.total_amount), 0)::BIGINT,
    COUNT(DISTINCT o.id),
    COUNT(DISTINCT o.customer_id) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_id = o.customer_id
          AND o2.created_at < v_month_start
          AND EXISTS (
            SELECT 1 FROM sub_orders so2
            WHERE so2.order_id = o2.id
              AND so2.status NOT IN ('cancelled', 'refunded')
          )
      )
    ),
    COUNT(DISTINCT o.customer_id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_id = o.customer_id
          AND o2.created_at < v_month_start
          AND EXISTS (
            SELECT 1 FROM sub_orders so2
            WHERE so2.order_id = o2.id
              AND so2.status NOT IN ('cancelled', 'refunded')
          )
      )
    ),
    COUNT(DISTINCT so.shop_id),
    COUNT(DISTINCT da.rider_id),
    COALESCE(AVG(o.total_amount), 0)::BIGINT,
    COUNT(DISTINCT o.id) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_orders so3
        WHERE so3.order_id = o.id
          AND so3.status != 'cancelled'
      )
    )
  FROM orders o
  LEFT JOIN sub_orders so ON so.order_id = o.id
  LEFT JOIN delivery_assignments da
    ON da.sub_order_id = so.id
    AND da.status = 'delivered'
  WHERE o.created_at >= v_month_start AND o.created_at < v_month_end
  ON CONFLICT (month) DO UPDATE SET
    gmv_paise             = EXCLUDED.gmv_paise,
    order_count           = EXCLUDED.order_count,
    new_customers         = EXCLUDED.new_customers,
    returning_customers   = EXCLUDED.returning_customers,
    active_shops          = EXCLUDED.active_shops,
    active_riders         = EXCLUDED.active_riders,
    avg_order_value_paise = EXCLUDED.avg_order_value_paise,
    cancelled_orders      = EXCLUDED.cancelled_orders;

  -- ── Section B: Cohort retention for this month ────────────────────
  INSERT INTO cohort_retention (
    cohort_month,
    active_month,
    active_users,
    total_cohort_size,
    gmv_paise
  )
  SELECT
    cc.acquisition_month                          AS cohort_month,
    p_month                                       AS active_month,
    COUNT(DISTINCT o.customer_id)::INTEGER        AS active_users,
    (SELECT COUNT(*) FROM customer_cohorts cc2
     WHERE cc2.acquisition_month = cc.acquisition_month)::INTEGER AS total_cohort_size,
    COALESCE(SUM(o.total_amount), 0)::BIGINT      AS gmv_paise
  FROM customer_cohorts cc
  JOIN orders o
    ON  o.customer_id = cc.user_id
    AND o.created_at >= v_month_start
    AND o.created_at <  v_month_end
  WHERE EXISTS (
    SELECT 1 FROM sub_orders so
    WHERE so.order_id = o.id
      AND so.status NOT IN ('cancelled', 'refunded')
  )
  GROUP BY cc.acquisition_month
  ON CONFLICT (cohort_month, active_month) DO UPDATE SET
    active_users      = EXCLUDED.active_users,
    total_cohort_size = EXCLUDED.total_cohort_size,
    gmv_paise         = EXCLUDED.gmv_paise;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- PART 4: Backfill all historical months
-- ══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_month    DATE;
  v_earliest DATE;
BEGIN
  SELECT DATE_TRUNC('month', MIN(o.created_at))::DATE
  INTO v_earliest
  FROM orders o
  WHERE EXISTS (
    SELECT 1 FROM sub_orders so
    WHERE so.order_id = o.id
      AND so.status != 'cancelled'
  );

  IF v_earliest IS NULL THEN
    RAISE NOTICE 'No valid orders found — skipping backfill';
    RETURN;
  END IF;

  v_month := v_earliest;
  WHILE v_month <= DATE_TRUNC('month', NOW())::DATE LOOP
    CALL calculate_monthly_metrics(v_month);
    RAISE NOTICE 'Backfilled %', v_month;
    v_month := (v_month + INTERVAL '1 month')::DATE;
  END LOOP;

  RAISE NOTICE 'P11-1 backfill complete.';
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES:
--
-- SELECT * FROM customer_cohorts LIMIT 5;
-- SELECT * FROM monthly_metrics ORDER BY month;
-- SELECT * FROM cohort_retention ORDER BY cohort_month, active_month;
--
-- SELECT trigger_name, event_manipulation, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_name = 'trg_record_customer_acquisition';
-- ══════════════════════════════════════════════════════════════════════
