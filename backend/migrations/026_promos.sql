-- ────────────────────────────────────────────────────────────
-- Migration 026: Promo Codes & Discount Engine
--
-- promo_codes   — defines each discount rule
-- promo_redemptions — tracks which user used which code on which order
-- ────────────────────────────────────────────────────────────

CREATE TYPE promo_type AS ENUM ('percentage', 'flat', 'free_delivery');

CREATE TABLE promo_codes (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   TEXT          UNIQUE NOT NULL,
  type                   promo_type    NOT NULL,
  value                  INTEGER       NOT NULL CHECK (value >= 0),
  -- percentage (0-100) OR flat amount in paise
  min_order_amount_paise INTEGER       NOT NULL DEFAULT 0,
  max_discount_paise     INTEGER,       -- cap for percentage discounts; NULL = no cap
  applicable_tier        TEXT          CHECK (applicable_tier IN ('quick', 'scheduled')),
  -- NULL = applies to both tiers
  usage_limit            INTEGER,       -- NULL = unlimited
  usage_count            INTEGER       NOT NULL DEFAULT 0,
  per_user_limit         INTEGER       NOT NULL DEFAULT 1,
  valid_from             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  valid_until            TIMESTAMPTZ,   -- NULL = never expires
  is_active              BOOLEAN       NOT NULL DEFAULT true,
  created_by             UUID          REFERENCES auth.users(id),
  shop_id                UUID          REFERENCES shops(id),
  -- NULL = platform-wide; non-null = shop-specific
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE promo_redemptions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id       UUID          NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
  user_id        UUID          NOT NULL REFERENCES auth.users(id),
  order_id       UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  discount_paise INTEGER       NOT NULL CHECK (discount_paise >= 0),
  redeemed_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (promo_id, user_id, order_id)
);

-- Fast code lookup at checkout (only active codes indexed)
CREATE INDEX idx_promo_codes_code ON promo_codes(code) WHERE is_active = true;
CREATE INDEX idx_promo_redemptions_user ON promo_redemptions(user_id, promo_id);

-- ── RLS ────────────────────────────────────────────────────

ALTER TABLE promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can look up active promo codes at checkout
CREATE POLICY "Anyone can read active promos"
  ON promo_codes FOR SELECT
  USING (is_active = true);

-- Admins / service_role can manage promos
CREATE POLICY "Service role manages promos"
  ON promo_codes FOR ALL
  USING    (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Each user can see their own redemptions
CREATE POLICY "Users see own redemptions"
  ON promo_redemptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service_role can insert/update redemptions (backend enforces per-user limit)
CREATE POLICY "Service role manages redemptions"
  ON promo_redemptions FOR ALL
  USING    (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
