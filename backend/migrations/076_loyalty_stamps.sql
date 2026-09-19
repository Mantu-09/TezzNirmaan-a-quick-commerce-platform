-- 076_loyalty_stamps.sql - P19-5
CREATE TABLE IF NOT EXISTS loyalty_stamps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_profile ON loyalty_stamps (profile_id, created_at DESC);
COMMENT ON TABLE loyalty_stamps IS 'Loyalty stamp card — 1 stamp per delivered order. 5 stamps = reward';