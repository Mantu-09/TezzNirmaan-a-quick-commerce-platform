-- ────────────────────────────────────────────────────────────
-- Migration 042: B2B Contractor Accounts — P6-6  (FIXED)
--
-- Run this entire file in Supabase Dashboard → SQL Editor → New query
--
-- Tables created:
--   contractor_profiles  — verified B2B account with credit terms
--   b2b_orders           — links a regular order to a B2B context
--   gst_invoices         — generated GST invoices per B2B order
--
-- Helper functions:
--   increment_outstanding(contractor_id, paise)
--   decrement_outstanding(contractor_id, paise)
-- ────────────────────────────────────────────────────────────

-- ── 1. contractor_profiles ────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_profiles (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID          UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name              TEXT          NOT NULL,
  gst_number                TEXT,
  pan_number                TEXT,
  credit_limit_paise        BIGINT        NOT NULL DEFAULT 0,
  outstanding_credit_paise  BIGINT        NOT NULL DEFAULT 0,
  payment_terms_days        INTEGER       NOT NULL DEFAULT 0,
  discount_percent          NUMERIC(4,2)  NOT NULL DEFAULT 0.00,
  monthly_volume_band       TEXT          CHECK (monthly_volume_band IN ('under_50k','50k_to_200k','above_200k')),
  is_verified               BOOLEAN       NOT NULL DEFAULT false,
  rejection_reason          TEXT,
  verified_at               TIMESTAMPTZ,
  verified_by               UUID          REFERENCES profiles(id),
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_user_id     ON contractor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_is_verified ON contractor_profiles(is_verified);

-- ── 2. b2b_orders ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b_orders (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID    NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  contractor_id       UUID    NOT NULL REFERENCES contractor_profiles(id) ON DELETE RESTRICT,
  po_number           TEXT,
  gst_invoice_number  TEXT,
  payment_terms_days  INTEGER NOT NULL DEFAULT 0,
  due_date            DATE,
  payment_status      TEXT    NOT NULL DEFAULT 'pending'
                              CHECK (payment_status IN ('pending','paid','overdue')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_contractor_id   ON b2b_orders(contractor_id);
CREATE INDEX IF NOT EXISTS idx_b2b_payment_status  ON b2b_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_b2b_due_date        ON b2b_orders(due_date) WHERE payment_status = 'pending';

-- ── 3. gst_invoices ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gst_invoices (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  b2b_order_id      UUID    NOT NULL REFERENCES b2b_orders(id) ON DELETE RESTRICT,
  invoice_number    TEXT    UNIQUE NOT NULL,
  shop_id           UUID    NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  contractor_id     UUID    NOT NULL REFERENCES contractor_profiles(id) ON DELETE RESTRICT,
  subtotal_paise    BIGINT  NOT NULL,
  gst_rate          NUMERIC(4,2) NOT NULL DEFAULT 18.00,
  gst_amount_paise  BIGINT  NOT NULL,
  total_paise       BIGINT  NOT NULL,
  pdf_url           TEXT,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gst_inv_contractor ON gst_invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_gst_inv_shop       ON gst_invoices(shop_id);

-- ── 4. Credit management helper functions ─────────────────────
-- Called from b2b.service.js to atomically update outstanding balance.

CREATE OR REPLACE FUNCTION increment_contractor_outstanding(
  p_contractor_id UUID,
  p_amount_paise  BIGINT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE contractor_profiles
  SET outstanding_credit_paise = outstanding_credit_paise + p_amount_paise,
      updated_at = now()
  WHERE id = p_contractor_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_contractor_outstanding(
  p_contractor_id UUID,
  p_amount_paise  BIGINT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE contractor_profiles
  SET outstanding_credit_paise = GREATEST(0, outstanding_credit_paise - p_amount_paise),
      updated_at = now()
  WHERE id = p_contractor_id;
END;
$$;

-- ── 5. RLS ────────────────────────────────────────────────────
ALTER TABLE contractor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_invoices        ENABLE ROW LEVEL SECURITY;

-- contractor_profiles policies
DROP POLICY IF EXISTS "cp_select_own"          ON contractor_profiles;
DROP POLICY IF EXISTS "cp_insert_own"          ON contractor_profiles;
DROP POLICY IF EXISTS "cp_service_all"         ON contractor_profiles;

CREATE POLICY "cp_select_own" ON contractor_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cp_insert_own" ON contractor_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cp_service_all" ON contractor_profiles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- b2b_orders policies
DROP POLICY IF EXISTS "b2bo_select_own"    ON b2b_orders;
DROP POLICY IF EXISTS "b2bo_service_all"   ON b2b_orders;

CREATE POLICY "b2bo_select_own" ON b2b_orders
  FOR SELECT USING (
    contractor_id IN (
      SELECT id FROM contractor_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "b2bo_service_all" ON b2b_orders
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- gst_invoices policies
DROP POLICY IF EXISTS "gsti_select_contractor" ON gst_invoices;
DROP POLICY IF EXISTS "gsti_select_shop"       ON gst_invoices;
DROP POLICY IF EXISTS "gsti_service_all"       ON gst_invoices;

CREATE POLICY "gsti_select_contractor" ON gst_invoices
  FOR SELECT USING (
    contractor_id IN (
      SELECT id FROM contractor_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "gsti_select_shop" ON gst_invoices
  FOR SELECT USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff
       WHERE profile_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "gsti_service_all" ON gst_invoices
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
