-- ────────────────────────────────────────────────────────────
-- Migration 048: Razorpay Route — Automated Settlement (P8-2)
--
-- Creates:
--   shop_bank_accounts   — stores bank details + Razorpay linked account IDs
--   route_transfers      — one record per order transfer via Razorpay Route
--
-- Alters:
--   settlement_batches   — adds settlement_method + route_transfer_ids columns
--
-- RLS:
--   Shop owners see only their own bank account and transfers.
--   Service role (backend) has full access via supabaseAdmin.
-- ────────────────────────────────────────────────────────────

-- ── Shop bank accounts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_bank_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               UUID UNIQUE NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Razorpay Route linked account (populated after createLinkedAccount() call)
  razorpay_account_id   TEXT UNIQUE,    -- e.g. acc_XYZ123

  -- Bank details (stored in plaintext — account number can be masked in UI)
  account_name          TEXT NOT NULL,
  account_number        TEXT NOT NULL,
  ifsc_code             TEXT NOT NULL,
  bank_name             TEXT,
  account_type          TEXT NOT NULL DEFAULT 'savings' CHECK (account_type IN ('savings', 'current')),

  -- PAN — optional but improves Razorpay KYC
  pan_number            TEXT,

  -- Verification state
  is_verified           BOOLEAN NOT NULL DEFAULT false,
  verified_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Route transfers (one per order payment captured) ──────────
CREATE TABLE IF NOT EXISTS route_transfers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  shop_id                 UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,

  -- Razorpay references
  razorpay_payment_id     TEXT NOT NULL,
  razorpay_transfer_id    TEXT UNIQUE,   -- NULL until Razorpay responds / confirmed

  -- Amounts (all in paise)
  gross_amount_paise      BIGINT NOT NULL CHECK (gross_amount_paise > 0),
  commission_paise        BIGINT NOT NULL CHECK (commission_paise >= 0),
  net_amount_paise        BIGINT NOT NULL CHECK (net_amount_paise > 0),
  commission_percent      NUMERIC(5,2) NOT NULL DEFAULT 5.00,

  -- Status lifecycle: pending → processed | failed | reversed
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processed', 'failed', 'reversed')),
  error_message           TEXT,
  transferred_at          TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: look up transfers by order (payment webhook uses this)
CREATE INDEX IF NOT EXISTS idx_route_transfers_order_id
  ON route_transfers(order_id);

-- Index: look up transfers by shop (dashboard history page)
CREATE INDEX IF NOT EXISTS idx_route_transfers_shop_id
  ON route_transfers(shop_id);

-- Index: find transfers by Razorpay payment ID (webhook dedup)
CREATE INDEX IF NOT EXISTS idx_route_transfers_razorpay_payment_id
  ON route_transfers(razorpay_payment_id);

-- ── Alter settlement_batches ──────────────────────────────────
-- Adds metadata columns so we can track whether a batch was paid
-- via the old manual flow or via Razorpay Route automation.
ALTER TABLE settlement_batches
  ADD COLUMN IF NOT EXISTS settlement_method  TEXT DEFAULT 'manual'
    CHECK (settlement_method IN ('manual', 'razorpay_route')),
  ADD COLUMN IF NOT EXISTS route_transfer_ids TEXT[];  -- Razorpay transfer IDs for this batch

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE shop_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_transfers     ENABLE ROW LEVEL SECURITY;

-- Shop owners can SELECT their own bank account only
CREATE POLICY "shop_bank_accounts_owner_select"
  ON shop_bank_accounts
  FOR SELECT
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

-- Shop owners can INSERT/UPDATE their own bank account
CREATE POLICY "shop_bank_accounts_owner_write"
  ON shop_bank_accounts
  FOR ALL
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

-- Shop owners can SELECT their own Route transfers
CREATE POLICY "route_transfers_owner_select"
  ON route_transfers
  FOR SELECT
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

-- ── Updated_at trigger ────────────────────────────────────────
-- Reuse the existing trigger function if available, otherwise create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$;
  END IF;
END $$;

CREATE TRIGGER shop_bank_accounts_updated_at
  BEFORE UPDATE ON shop_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER route_transfers_updated_at
  BEFORE UPDATE ON route_transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
