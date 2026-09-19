-- ─────────────────────────────────────────────────────────────
-- 059_product_reviews.sql — P12-5
--
-- Product-level reviews table. Distinct from order_ratings (018)
-- which is delivery/shop experience ratings. This tracks product
-- quality reviews with text and star ratings for product pages.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id      UUID        REFERENCES orders(id) ON DELETE SET NULL,  -- Verified purchase
  rating        SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         TEXT,
  body          TEXT,
  is_verified   BOOLEAN     GENERATED ALWAYS AS (order_id IS NOT NULL) STORED,
  is_approved   BOOLEAN     NOT NULL DEFAULT false,  -- Admin moderation gate
  helpful_count INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, customer_id)  -- One review per customer per product
);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_product_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_product_reviews_updated_at ON product_reviews;
CREATE TRIGGER trg_product_reviews_updated_at
  BEFORE UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_reviews_updated_at();

-- ── Materialized stats view on products ──────────────────────
-- Add review columns to products if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'review_count') THEN
    ALTER TABLE products ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'avg_rating') THEN
    ALTER TABLE products ADD COLUMN avg_rating NUMERIC(3,2) DEFAULT NULL;
  END IF;
END $$;

-- ── Function: update product review stats on insert/update/delete ──
CREATE OR REPLACE FUNCTION sync_product_review_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  p_id UUID;
BEGIN
  p_id := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products
  SET
    review_count = (SELECT COUNT(*) FROM product_reviews WHERE product_id = p_id AND is_approved = true),
    avg_rating   = (SELECT AVG(rating)::NUMERIC(3,2) FROM product_reviews WHERE product_id = p_id AND is_approved = true)
  WHERE id = p_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_review_stats ON product_reviews;
CREATE TRIGGER trg_sync_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION sync_product_review_stats();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- Approved reviews are public
DROP POLICY IF EXISTS "Anyone reads approved reviews" ON product_reviews;
CREATE POLICY "Anyone reads approved reviews"
  ON product_reviews FOR SELECT
  USING (is_approved = true);

-- Customers can read their own (even unapproved)
DROP POLICY IF EXISTS "Customers read own reviews" ON product_reviews;
CREATE POLICY "Customers read own reviews"
  ON product_reviews FOR SELECT
  USING (auth.uid() = customer_id);

-- Customers can submit one review per product
DROP POLICY IF EXISTS "Customers insert reviews" ON product_reviews;
CREATE POLICY "Customers insert reviews"
  ON product_reviews FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Customers can update their own review
DROP POLICY IF EXISTS "Customers update own reviews" ON product_reviews;
CREATE POLICY "Customers update own reviews"
  ON product_reviews FOR UPDATE
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- Admins manage all
DROP POLICY IF EXISTS "Admins manage all reviews" ON product_reviews;
CREATE POLICY "Admins manage all reviews"
  ON product_reviews FOR ALL
  USING ((auth.jwt() ->> 'role') = 'platform_admin');

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_reviews_product   ON product_reviews (product_id, is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_customer  ON product_reviews (customer_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_order     ON product_reviews (order_id) WHERE order_id IS NOT NULL;
