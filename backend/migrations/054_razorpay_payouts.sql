-- ────────────────────────────────────────────────────────────
-- Migration 054: RazorpayX Payout Infrastructure — P10-4
--
-- Run after: 052_payout_requests_and_delivery_issues.sql
--            (payout_requests table must exist)
--
-- Creates:
--   rider_fund_accounts  — RazorpayX contact + fund account IDs per rider
--   rider_payouts        — individual payout records (one per approved request)
--
-- Critical: idempotency_key is UNIQUE and mandatory (RazorpayX March 2025)
-- ────────────────────────────────────────────────────────────

-- ── rider_fund_accounts ───────────────────────────────────────
-- Stores the RazorpayX contact_id and fund_account_id for each rider.
-- One row per rider (UNIQUE rider_id). Created when the rider submits
-- their bank details via POST /rider/bank-account.
CREATE TABLE IF NOT EXISTS rider_fund_accounts (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- rider_id here matches payout_requests.rider_id (= auth.uid() / profile id)
  -- because the riders table uses profile_id as FK, and req.user.id = profile id
  rider_id                    UUID        UNIQUE NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  razorpay_contact_id         TEXT,                  -- RazorpayX contact ID (cont_xxx)
  razorpay_fund_account_id    TEXT        UNIQUE,     -- RazorpayX fund account ID (fa_xxx)
  account_name                TEXT        NOT NULL,
  account_number_last4        TEXT,                  -- Last 4 digits only (never store full)
  ifsc_code                   TEXT        NOT NULL,
  bank_name                   TEXT,
  is_verified                 BOOLEAN     DEFAULT false,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_fund_accounts_rider
  ON rider_fund_accounts (rider_id);

CREATE INDEX IF NOT EXISTS idx_rider_fund_accounts_fa_id
  ON rider_fund_accounts (razorpay_fund_account_id)
  WHERE razorpay_fund_account_id IS NOT NULL;

-- ── rider_payouts ─────────────────────────────────────────────
-- One row per payout attempt (tied to a payout_request).
-- idempotency_key is deterministic: sha256(payout-{requestId}-{riderId})
-- so retrying a failed payout never creates a duplicate payment.
CREATE TABLE IF NOT EXISTS rider_payouts (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id        UUID        NOT NULL REFERENCES payout_requests(id) ON DELETE CASCADE,
  -- rider_id = profile id (consistent with payout_requests)
  rider_id                 UUID        NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  razorpay_payout_id       TEXT        UNIQUE,          -- RazorpayX pout_xxx (null until initiated)
  razorpay_fund_account_id TEXT        NOT NULL,         -- fa_xxx
  amount_paise             BIGINT      NOT NULL CHECK (amount_paise > 0),
  idempotency_key          TEXT        UNIQUE NOT NULL,  -- MANDATORY from March 2025
  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','queued','processing','processed','failed','reversed')),
  utr                      TEXT,                          -- UTR on success
  failure_reason           TEXT,
  initiated_at             TIMESTAMPTZ DEFAULT now(),
  processed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rider_payouts_request
  ON rider_payouts (payout_request_id);

CREATE INDEX IF NOT EXISTS idx_rider_payouts_rider
  ON rider_payouts (rider_id, initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rider_payouts_rzp_id
  ON rider_payouts (razorpay_payout_id)
  WHERE razorpay_payout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_payouts_status
  ON rider_payouts (status);

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE rider_fund_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_payouts       ENABLE ROW LEVEL SECURITY;

-- Riders can read their own fund account
CREATE POLICY "rider_fund_accounts_select"
  ON rider_fund_accounts FOR SELECT
  USING (auth.uid() = rider_id);

-- Riders can read their own payout history
CREATE POLICY "rider_payouts_select"
  ON rider_payouts FOR SELECT
  USING (auth.uid() = rider_id);

-- Service role (backend) bypasses RLS — no explicit policy needed
-- (supabaseAdmin uses service_role key)
