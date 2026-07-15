-- ============================================================================
-- Migration 016: Ratings & Reviews (B4) — Corrected Schema
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Schema reality:
--   orders.customer_id → profiles(id)   (NOT user_id)
--   status lives on sub_orders.status (order_status enum)
--   sub_orders.status IN ('pending','accepted','preparing','out_for_delivery','delivered','cancelled')
--
-- Strategy: rate at the sub_order level (per delivery tier), but expose
-- a single order_rating record per parent order for simplicity.
-- We check sub_orders.status = 'delivered' before allowing rating.
-- ============================================================================

-- ── order_ratings table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_ratings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL REFERENCES orders(id)  ON DELETE CASCADE,
  customer_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shop_id          uuid        NOT NULL REFERENCES shops(id)   ON DELETE CASCADE,
  delivery_rating  integer     CHECK (delivery_rating BETWEEN 1 AND 5),
  product_rating   integer     CHECK (product_rating  BETWEEN 1 AND 5),
  review_text      text        CHECK (char_length(review_text) <= 1000),
  is_flagged       boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- One rating per customer per order
  CONSTRAINT uq_order_customer_rating UNIQUE (order_id, customer_id)
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE order_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can insert own rating"
  ON order_ratings FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can read own ratings"
  ON order_ratings FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY "Shop owners can read shop ratings"
  ON order_ratings FOR SELECT
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access"
  ON order_ratings FOR ALL
  USING (auth.role() = 'service_role');

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ratings_shop_id     ON order_ratings(shop_id);
CREATE INDEX IF NOT EXISTS idx_ratings_order_id    ON order_ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_customer_id ON order_ratings(customer_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at  ON order_ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_flagged     ON order_ratings(shop_id) WHERE is_flagged = true;

-- ── Materialized view: shop rating summary ───────────────────
-- Pre-aggregated per-shop averages so product listing never needs JOIN+GROUP BY.
DROP MATERIALIZED VIEW IF EXISTS shop_rating_summary;
CREATE MATERIALIZED VIEW shop_rating_summary AS
SELECT
  shop_id,
  ROUND(AVG(delivery_rating)::numeric, 1)  AS avg_delivery_rating,
  ROUND(AVG(product_rating)::numeric,  1)  AS avg_product_rating,
  ROUND(
    AVG(
      COALESCE(
        CASE
          WHEN delivery_rating IS NOT NULL AND product_rating IS NOT NULL
            THEN (delivery_rating + product_rating)::numeric / 2
          WHEN delivery_rating IS NOT NULL THEN delivery_rating::numeric
          ELSE product_rating::numeric
        END, NULL
      )
    )::numeric, 1
  )                                          AS avg_overall_rating,
  COUNT(*)                                   AS total_ratings,
  COUNT(review_text)                         AS total_reviews
FROM  order_ratings
GROUP BY shop_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_summary_shop ON shop_rating_summary(shop_id);

-- ── Auto-refresh trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_refresh_rating_summary()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY shop_rating_summary;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_rating_summary ON order_ratings;
CREATE TRIGGER trg_refresh_rating_summary
  AFTER INSERT OR UPDATE OR DELETE ON order_ratings
  FOR EACH STATEMENT
EXECUTE FUNCTION fn_refresh_rating_summary();

-- ── RPC: can_rate_order ──────────────────────────────────────
-- Atomically checks: order exists, belongs to caller, has a delivered
-- sub_order, and has not been rated yet.
CREATE OR REPLACE FUNCTION can_rate_order(p_order_id uuid, p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_id    uuid;
  v_cust_id    uuid;
  v_delivered  boolean := false;
  v_rated      boolean := false;
BEGIN
  -- Check order exists and belongs to customer
  SELECT customer_id, shop_id
  INTO   v_cust_id, v_shop_id
  FROM   orders
  WHERE  id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'order_not_found');
  END IF;

  IF v_cust_id != p_customer_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_your_order');
  END IF;

  -- Check at least one sub_order is delivered
  SELECT EXISTS(
    SELECT 1 FROM sub_orders
    WHERE order_id = p_order_id AND status = 'delivered'
  ) INTO v_delivered;

  IF NOT v_delivered THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'order_not_delivered');
  END IF;

  -- Check not already rated
  SELECT EXISTS(
    SELECT 1 FROM order_ratings
    WHERE order_id = p_order_id AND customer_id = p_customer_id
  ) INTO v_rated;

  IF v_rated THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_rated');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'shop_id', v_shop_id);
END;
$$;
