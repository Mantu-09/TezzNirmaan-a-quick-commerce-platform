-- 066_bulk_quotes.sql - P15-1
-- Contractor bulk quote requests before committing to large orders.

CREATE TABLE IF NOT EXISTS bulk_quote_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id       UUID NOT NULL REFERENCES contractor_profiles(id) ON DELETE CASCADE,
  items               JSONB NOT NULL,          -- [{product_id, name, qty, unit}]
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','quoted','accepted','rejected','expired')),
  quoted_total_paise  BIGINT,                  -- Admin fills this on approval
  discount_pct        NUMERIC(4,2) DEFAULT 0,
  valid_until         TIMESTAMPTZ,             -- Quote expiry
  admin_notes         TEXT,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_quotes_contractor ON bulk_quote_requests (contractor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_quotes_status     ON bulk_quote_requests (status) WHERE status = 'pending';

COMMENT ON TABLE bulk_quote_requests IS 'B2B contractor bulk price quote requests - P15-1';
