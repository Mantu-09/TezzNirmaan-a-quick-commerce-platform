-- ────────────────────────────────────────────────────────────
-- 033_multi_shop_cart.sql — P4-3B: Multi-Shop Cart Support
--
-- Architecture: One basket → one order per shop → single payment.
-- A basket groups multiple per-shop orders under one Razorpay order.
-- Single-shop orders (basket_id IS NULL) continue to work unchanged.
--
-- Run in: Supabase SQL Editor → paste → Run
-- ────────────────────────────────────────────────────────────

-- 1. Basket table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_baskets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_amount_paise  BIGINT      NOT NULL CHECK (total_amount_paise >= 0),
  payment_status      TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (payment_status IN ('pending','paid','failed','refunded')),
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  promo_code_id       UUID        REFERENCES promo_codes(id),
  discount_paise      BIGINT      NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  shop_count          INTEGER     NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Link orders to baskets ───────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS basket_id UUID REFERENCES order_baskets(id) ON DELETE SET NULL;

-- 3. RLS ──────────────────────────────────────────────────────
ALTER TABLE order_baskets ENABLE ROW LEVEL SECURITY;

-- Customers see only their own baskets
CREATE POLICY "Users see own baskets"
  ON order_baskets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Customers can insert their own basket rows
CREATE POLICY "Users insert own baskets"
  ON order_baskets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Customers can update payment_status on their own baskets
CREATE POLICY "Users update own basket payment status"
  ON order_baskets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_baskets_user_id
  ON order_baskets(user_id);

CREATE INDEX IF NOT EXISTS idx_order_baskets_razorpay_order_id
  ON order_baskets(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_basket_id
  ON orders(basket_id)
  WHERE basket_id IS NOT NULL;

-- 5. Auto-update updated_at ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'moddatetime'
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER handle_updated_at_baskets
        BEFORE UPDATE ON order_baskets
        FOR EACH ROW
        EXECUTE PROCEDURE moddatetime(updated_at);
    $trigger$;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 6. Verify ───────────────────────────────────────────────────
-- After running, confirm with:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'orders' AND column_name = 'basket_id';
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name = 'order_baskets';
