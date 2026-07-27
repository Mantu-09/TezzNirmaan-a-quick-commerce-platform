-- ────────────────────────────────────────────────────────────
-- Migration 031: Referral System — P4-2A
--
-- Two tables:
--   referral_codes   — one per user, auto-generated "TN-XXXXXX" code
--   referral_events  — tracks each referral pair and reward status
--
-- Reward flow:
--   1. New user signs up with a code → referred_reward_paise (₹100)
--      credited immediately (30-day expiry to incentivise first order)
--   2. Referred user places FIRST order → referrer_reward_paise (₹50)
--      credited to referrer; event status → 'rewarded'
-- ────────────────────────────────────────────────────────────

-- ── referral_codes ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_codes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code                TEXT        UNIQUE NOT NULL,   -- e.g. "TN-RJKX82"
  times_used          INTEGER     NOT NULL DEFAULT 0,
  total_earned_paise  INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code    ON referral_codes (code);
CREATE INDEX        IF NOT EXISTS idx_referral_codes_user_id ON referral_codes (user_id);

COMMENT ON TABLE referral_codes IS
  'One row per user. Auto-generated at first GET /customer/referral. Code format: TN-XXXXXX.';

-- ── referral_events ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code_id      UUID        NOT NULL REFERENCES referral_codes(id),
  trigger_order_id      UUID        REFERENCES orders(id),   -- order that triggered reward
  referrer_reward_paise INTEGER     NOT NULL DEFAULT 5000,   -- ₹50
  referred_reward_paise INTEGER     NOT NULL DEFAULT 10000,  -- ₹100
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'rewarded', 'expired')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewarded_at           TIMESTAMPTZ,
  UNIQUE (referrer_id, referred_id)  -- one referral per pair, ever
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referred_id ON referral_events (referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_id ON referral_events (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_status      ON referral_events (status);

COMMENT ON TABLE referral_events IS
  'Tracks each referral pair. Status: pending (signed up) → rewarded (first order placed) | expired.';
COMMENT ON COLUMN referral_events.status IS
  'pending: referred user signed up but has not yet placed first order.
   rewarded: first order placed — both parties have been credited.
   expired: 90 days passed without a first order (run via cron, future).';

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE referral_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own referral code (for the Referral Screen)
DROP POLICY IF EXISTS "Users see own referral code" ON referral_codes;
CREATE POLICY "Users see own referral code"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can see referral events they are part of (referrer or referred)
DROP POLICY IF EXISTS "Users see their referral events" ON referral_events;
CREATE POLICY "Users see their referral events"
  ON referral_events FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Service role bypasses RLS (backend uses supabaseAdmin)
-- No INSERT/UPDATE policies needed — all mutations go through service role.

-- ── Helper: increment referral code stats atomically ─────────
-- Called by processReferralReward() in referral.service.js after each reward.
-- Uses a separate RPC to avoid race conditions when multiple referral
-- rewards fire at the same time for different friends of the same user.

CREATE OR REPLACE FUNCTION increment_referral_stats(
  p_referrer_id        UUID,
  p_earned_paise_delta INTEGER DEFAULT 5000
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE referral_codes
  SET
    times_used         = times_used         + 1,
    total_earned_paise = total_earned_paise + p_earned_paise_delta
  WHERE user_id = p_referrer_id;
END;
$$;

COMMENT ON FUNCTION increment_referral_stats IS
  'Atomically increments times_used and total_earned_paise for the referral code
   belonging to p_referrer_id. Called after processReferralReward() credits wallet.';
