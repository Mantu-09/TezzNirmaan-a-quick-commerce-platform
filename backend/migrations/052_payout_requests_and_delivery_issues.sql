-- ────────────────────────────────────────────────────────────
-- Migration 052: Payout Requests + Delivery Issue Columns — P9-4
-- ────────────────────────────────────────────────────────────

-- ── payout_requests table ─────────────────────────────────────
-- Rider-initiated payout requests, processed by platform_admin.
CREATE TABLE IF NOT EXISTS payout_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id     uuid        NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  amount_paise bigint      NOT NULL CHECK (amount_paise > 0),
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'processing', 'paid', 'rejected')),
  notes        TEXT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_rider
  ON payout_requests (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payout_requests_status
  ON payout_requests (status) WHERE status = 'pending';

-- ── delivery_assignments: issue reporting columns ─────────────
-- Riders can flag a delivery issue (wrong address, not home, etc.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_assignments' AND column_name = 'issue_reported'
  ) THEN
    ALTER TABLE delivery_assignments ADD COLUMN issue_reported    BOOLEAN     DEFAULT FALSE;
    ALTER TABLE delivery_assignments ADD COLUMN issue_type        TEXT;
    ALTER TABLE delivery_assignments ADD COLUMN issue_description TEXT;
    ALTER TABLE delivery_assignments ADD COLUMN issue_reported_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_issue
  ON delivery_assignments (issue_reported)
  WHERE issue_reported = TRUE;
