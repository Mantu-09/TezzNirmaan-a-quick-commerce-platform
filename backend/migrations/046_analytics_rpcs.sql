-- ────────────────────────────────────────────────────────────
-- Migration 046: Analytics RPCs — P7-6 Performance Hardening
--
-- SCHEMA NOTE: sub_orders does NOT have shop_id directly.
-- The join chain is:
--   order_items → sub_orders (via sub_order_id)
--              → orders      (via order_id)
--              → orders.shop_id
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_top_products(
  p_shop_id UUID,
  p_from    TIMESTAMPTZ,
  p_to      TIMESTAMPTZ,
  p_limit   INTEGER DEFAULT 5
)
RETURNS TABLE (
  product_id   UUID,
  product_name TEXT,
  units_sold   BIGINT,
  revenue      BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.product_id,
    oi.product_name,
    SUM(oi.quantity)::BIGINT    AS units_sold,
    SUM(oi.total_price)::BIGINT AS revenue
  FROM order_items oi
  JOIN sub_orders  so ON so.id   = oi.sub_order_id
  JOIN orders       o  ON o.id   = so.order_id
  WHERE
    o.shop_id      = p_shop_id
    AND so.status  = 'delivered'
    AND so.created_at BETWEEN p_from AND p_to
  GROUP BY oi.product_id, oi.product_name
  ORDER BY units_sold DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Support indexes
-- sub_orders: filter by order_id + status + created_at (replaces wrong shop_id index)
CREATE INDEX IF NOT EXISTS idx_sub_orders_shop_status_created
  ON sub_orders (order_id, status, created_at DESC);

-- order_items: fast JOIN on sub_order_id
CREATE INDEX IF NOT EXISTS idx_order_items_sub_order_id
  ON order_items (sub_order_id);
