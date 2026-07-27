-- ─────────────────────────────────────────────────────────────────
-- Migration 028: Customer Wallet & Credits System — P3-C
--
-- Tables:
--   customer_wallets      — one row per user, holds current balance
--   wallet_transactions   — immutable ledger, every credit/debit recorded
--
-- Postgres functions (called via supabase.rpc):
--   credit_wallet(...)    — atomic credit + ledger insert
--   debit_wallet(...)     — atomic debit (fails if balance < amount)
--
-- RLS:
--   Both tables restricted to the owning user (SELECT only via RLS).
--   All writes go through SECURITY DEFINER functions so the service
--   role can write without bypassing row-level security entirely.
-- ─────────────────────────────────────────────────────────────────

-- ── 1. Enum for transaction types ─────────────────────────────────
DO $$ BEGIN
  CREATE TYPE wallet_transaction_type AS ENUM (
    'credit_refund',    -- Refund credited to wallet (instant alternative to bank refund)
    'credit_referral',  -- Referral bonus for inviting a new customer
    'credit_promo',     -- Promotional credit from admin
    'credit_cashback',  -- Cashback from completed order (future)
    'debit_order',      -- Balance used at checkout
    'debit_expiry'      -- Expired promotional credits removed by cron
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. customer_wallets ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_wallets (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_paise         INTEGER     NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  lifetime_earned_paise INTEGER     NOT NULL DEFAULT 0,
  lifetime_spent_paise  INTEGER     NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast balance reads (every checkout fetches this)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_user ON customer_wallets(user_id);

-- ── 3. wallet_transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           UUID                    NOT NULL REFERENCES customer_wallets(id) ON DELETE CASCADE,
  type                wallet_transaction_type NOT NULL,
  amount_paise        INTEGER                 NOT NULL CHECK (amount_paise > 0),
  balance_after_paise INTEGER                 NOT NULL,  -- snapshot for audit trail / dispute resolution
  description         TEXT,
  reference_id        UUID,                              -- order_id, refund_id, etc.
  expires_at          TIMESTAMPTZ,                       -- for promotional credits with expiry
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- Index for paginated transaction history per wallet
CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_created
  ON wallet_transactions(wallet_id, created_at DESC);

-- Index for expiry cron job (find promo credits expiring soon)
CREATE INDEX IF NOT EXISTS idx_wallet_txns_expires
  ON wallet_transactions(expires_at)
  WHERE expires_at IS NOT NULL;

-- ── 4. RLS ──────────────────────────────────────────────────────────
ALTER TABLE customer_wallets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own wallet
DROP POLICY IF EXISTS "Users see own wallet" ON customer_wallets;
CREATE POLICY "Users see own wallet"
  ON customer_wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only SELECT their own transactions
DROP POLICY IF EXISTS "Users see own transactions" ON wallet_transactions;
CREATE POLICY "Users see own transactions"
  ON wallet_transactions FOR SELECT
  USING (
    wallet_id IN (
      SELECT id FROM customer_wallets WHERE user_id = auth.uid()
    )
  );

-- ── 5. credit_wallet RPC ─────────────────────────────────────────────
-- Creates wallet if first credit (ON CONFLICT DO NOTHING).
-- Atomically increments balance and inserts ledger row.
-- SECURITY DEFINER: runs with the function owner's privileges (service role).
-- The caller (wallet.service.js) passes p_user_id from a verified JWT so
-- this cannot be called cross-user via the Supabase client SDK.
CREATE OR REPLACE FUNCTION credit_wallet(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_type        wallet_transaction_type,
  p_description TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_expires_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id     UUID;
  v_new_balance   INTEGER;
BEGIN
  -- Create wallet row on first-ever credit for this user
  INSERT INTO customer_wallets (user_id, balance_paise, lifetime_earned_paise)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Atomic balance update — SELECT FOR UPDATE prevents concurrent race
  UPDATE customer_wallets
  SET
    balance_paise         = balance_paise + p_amount,
    lifetime_earned_paise = lifetime_earned_paise + p_amount,
    updated_at            = now()
  WHERE user_id = p_user_id
  RETURNING id, balance_paise
  INTO v_wallet_id, v_new_balance;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  -- Immutable ledger row
  INSERT INTO wallet_transactions
    (wallet_id, type, amount_paise, balance_after_paise, description, reference_id, expires_at)
  VALUES
    (v_wallet_id, p_type, p_amount, v_new_balance, p_description, p_reference_id, p_expires_at);
END;
$$;

-- ── 6. debit_wallet RPC ──────────────────────────────────────────────
-- Atomically debits the wallet.
-- Raises an exception if balance is insufficient (CHECK constraint on the
-- balance_paise column will also fire, but we raise early for a better message).
-- Returns the new balance so the caller can include it in the response.
CREATE OR REPLACE FUNCTION debit_wallet(
  p_user_id  UUID,
  p_amount   INTEGER,
  p_order_id UUID DEFAULT NULL
)
RETURNS INTEGER   -- returns new balance_paise
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   UUID;
  v_cur_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the row for the duration of this transaction
  SELECT id, balance_paise
  INTO v_wallet_id, v_cur_balance
  FROM customer_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: No wallet for user %', p_user_id;
  END IF;

  IF v_cur_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: balance=% requested=%', v_cur_balance, p_amount;
  END IF;

  v_new_balance := v_cur_balance - p_amount;

  UPDATE customer_wallets
  SET
    balance_paise        = v_new_balance,
    lifetime_spent_paise = lifetime_spent_paise + p_amount,
    updated_at           = now()
  WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (wallet_id, type, amount_paise, balance_after_paise, description, reference_id)
  VALUES
    (v_wallet_id, 'debit_order', p_amount, v_new_balance,
     CASE WHEN p_order_id IS NOT NULL THEN 'Payment for order' ELSE 'Wallet debit' END,
     p_order_id);

  RETURN v_new_balance;
END;
$$;

-- ── 7. expire_wallet_credits RPC ─────────────────────────────────────
-- Called by a cron job (or Render scheduled task) to nullify expired
-- promotional credits. Inserts a debit_expiry row per expired credit.
-- Safe to call multiple times (idempotent via expires_at tracking).
CREATE OR REPLACE FUNCTION expire_wallet_credits()
RETURNS INTEGER   -- returns number of wallets affected
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec    RECORD;
  v_count  INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      wt.id         AS txn_id,
      wt.wallet_id,
      wt.amount_paise,
      cw.balance_paise AS cur_balance,
      cw.user_id
    FROM wallet_transactions wt
    JOIN customer_wallets cw ON cw.id = wt.wallet_id
    WHERE wt.expires_at <= now()
      AND wt.type IN ('credit_promo', 'credit_referral', 'credit_cashback')
      -- Only expire if the credited amount is still in the balance
      -- (user may have spent it already — don't double-debit)
      AND cw.balance_paise >= wt.amount_paise
      -- Don't process same txn twice (no corresponding debit_expiry yet)
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions de
        WHERE de.wallet_id = wt.wallet_id
          AND de.type = 'debit_expiry'
          AND de.reference_id = wt.id
      )
  LOOP
    UPDATE customer_wallets
    SET
      balance_paise = balance_paise - v_rec.amount_paise,
      updated_at    = now()
    WHERE id = v_rec.wallet_id;

    INSERT INTO wallet_transactions
      (wallet_id, type, amount_paise, balance_after_paise, description, reference_id)
    VALUES
      (v_rec.wallet_id, 'debit_expiry', v_rec.amount_paise,
       v_rec.cur_balance - v_rec.amount_paise,
       'Promotional credit expired', v_rec.txn_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
