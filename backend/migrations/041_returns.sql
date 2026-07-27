-- ────────────────────────────────────────────────────────────
-- Migration 041: Returns & Refunds
--
-- Creates the return_requests table, associated enums, indexes,
-- and RLS policies.  The existing `refunds` table (025_refunds.sql)
-- is the financial ledger; return_requests is the business-process
-- layer that drives approval flow and maps to refunds.
-- ────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE return_reason AS ENUM (
    'wrong_item_delivered',
    'damaged_item',
    'quality_not_as_described',
    'quantity_short',
    'item_missing',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE return_status AS ENUM (
    'requested',     -- Customer filed return
    'under_review',  -- Shop owner reviewing
    'approved',      -- Shop approved, refund initiated
    'rejected',      -- Shop rejected with reason
    'refunded'       -- Refund completed (Razorpay webhook confirmed)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS return_requests (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID          NOT NULL REFERENCES orders(id)     ON DELETE RESTRICT,
  sub_order_id          UUID          NOT NULL REFERENCES sub_orders(id) ON DELETE RESTRICT,
  user_id               UUID          NOT NULL REFERENCES profiles(id)   ON DELETE RESTRICT,
  shop_id               UUID          NOT NULL REFERENCES shops(id)      ON DELETE RESTRICT,
  reason                return_reason NOT NULL,
  description           TEXT,
  photo_urls            TEXT[]        NOT NULL DEFAULT '{}',
  status                return_status NOT NULL DEFAULT 'requested',
  refund_amount_paise   INTEGER       CHECK (refund_amount_paise > 0),
  refund_method         TEXT          CHECK (refund_method IN ('wallet', 'original_payment_method')),
  rejection_reason      TEXT,
  refund_id             UUID          REFERENCES refunds(id),
  requested_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reviewed_at           TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_return_requests_user_id     ON return_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_shop_id     ON return_requests(shop_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_sub_order   ON return_requests(sub_order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_status      ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_requested_at ON return_requests(requested_at DESC);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;

-- Customers see only their own returns
CREATE POLICY "Customers see own returns"
  ON return_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Customers can create returns (server validates eligibility)
CREATE POLICY "Customers can create returns"
  ON return_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Shop owners/staff see returns for their shop
CREATE POLICY "Shop staff see their shop returns"
  ON return_requests FOR SELECT
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE profile_id = auth.uid() AND is_active = true
    )
  );

-- Shop owners/staff can update return status
CREATE POLICY "Shop staff can update return status"
  ON return_requests FOR UPDATE
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM shop_staff WHERE profile_id = auth.uid() AND is_active = true
    )
  );

-- Service role has full access (backend only)
CREATE POLICY "Service role manages return requests"
  ON return_requests FOR ALL
  USING    (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Storage bucket for return photos ─────────────────────────
-- Run this separately in Supabase dashboard or via supabase CLI:
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('return-photos', 'return-photos', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- RLS for bucket: authenticated users can upload to return-photos/{their user_id}/
--
-- CREATE POLICY "Customers upload return photos"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'return-photos'
--     AND auth.uid()::text = (string_to_array(name, '/'))[1]
--   );
--
-- CREATE POLICY "Return photos are publicly readable"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'return-photos');
