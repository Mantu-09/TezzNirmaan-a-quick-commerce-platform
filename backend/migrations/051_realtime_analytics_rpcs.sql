-- ────────────────────────────────────────────────────────────
-- Migration 051: Real-Time Analytics RPCs — P9-3
--
-- Three RPCs called by GET /admin/analytics/live:
--   get_today_gmv(p_from)        → total GMV since p_from
--   get_city_breakdown(p_from)   → order count + GMV per city since p_from
--   get_hourly_orders(p_hours)   → hourly bucketed order count for chart
--
-- SCHEMA FACTS (verified against migrations 001, 006, 008):
--   orders.total_amount    → BIGINT in paise (column is named total_amount)
--   payment_status enum    → ('pending','authorized','captured',
--                             'failed','refund_initiated','refunded')
--                            'cod_pending' does NOT exist in the enum
--   payments.method        → payment_method enum ('upi','cod','card',...)
--   GMV filter             → p.status = 'captured'  (online paid)
--                            OR p.method = 'cod'    (COD orders — cash on delivery)
-- City join chain: orders → shops (shop_id) → cities (city_id)
-- ────────────────────────────────────────────────────────────

-- ── GMV for a time window ─────────────────────────────────────
DROP FUNCTION IF EXISTS get_today_gmv(TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION get_today_gmv(p_from TIMESTAMPTZ)
RETURNS TABLE (total BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(SUM(o.total_amount), 0)::BIGINT
  FROM   orders   o
  JOIN   payments p ON p.order_id = o.id
  WHERE  o.created_at >= p_from
  AND    (p.status = 'captured' OR p.method = 'cod');
END;
$$;

-- ── Orders by city for a time window ──────────────────────────
DROP FUNCTION IF EXISTS get_city_breakdown(TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION get_city_breakdown(p_from TIMESTAMPTZ)
RETURNS TABLE (
  city_name   TEXT,
  order_count BIGINT,
  gmv_paise   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.name                                      AS city_name,
    COUNT(DISTINCT o.id)::BIGINT                AS order_count,
    COALESCE(SUM(o.total_amount), 0)::BIGINT    AS gmv_paise
  FROM   orders   o
  JOIN   shops    s ON s.id = o.shop_id
  JOIN   cities   c ON c.id = s.city_id
  JOIN   payments p ON p.order_id = o.id
  WHERE  o.created_at >= p_from
  AND    (p.status = 'captured' OR p.method = 'cod')
  GROUP  BY c.name
  ORDER  BY order_count DESC;
END;
$$;

-- ── Hourly order count for sparkline chart ───────────────────
DROP FUNCTION IF EXISTS get_hourly_orders(INTEGER);
CREATE OR REPLACE FUNCTION get_hourly_orders(p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  hour        TIMESTAMPTZ,
  order_count BIGINT,
  gmv_paise   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('hour', o.created_at)            AS hour,
    COUNT(DISTINCT o.id)::BIGINT                AS order_count,
    COALESCE(SUM(o.total_amount), 0)::BIGINT    AS gmv_paise
  FROM   orders   o
  JOIN   payments p ON p.order_id = o.id
  WHERE  o.created_at >= now() - (p_hours || ' hours')::INTERVAL
  AND    (p.status = 'captured' OR p.method = 'cod')
  GROUP  BY date_trunc('hour', o.created_at)
  ORDER  BY hour;
END;
$$;

-- ── Support indexes for analytics query performance ───────────
CREATE INDEX IF NOT EXISTS idx_orders_created_at_analytics
  ON orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status_order
  ON payments (status, order_id);
