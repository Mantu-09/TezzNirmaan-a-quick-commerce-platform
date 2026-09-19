-- 070_saved_payment_methods.sql - P16-5
-- Razorpay card tokenization for one-tap checkout.

CREATE TABLE IF NOT EXISTS saved_payment_methods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  razorpay_token_id TEXT NOT NULL,
  card_last4        TEXT,
  card_network      TEXT,   -- VISA, MASTERCARD, RUPAY, etc.
  card_issuer       TEXT,
  is_default        BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_pm_user ON saved_payment_methods (user_id, created_at DESC);
ALTER TABLE saved_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_payment_methods" ON saved_payment_methods FOR ALL USING (auth.uid() = (SELECT auth_id FROM profiles WHERE id = user_id LIMIT 1));

COMMENT ON TABLE saved_payment_methods IS 'Razorpay saved card tokens for one-tap checkout - P16-5';