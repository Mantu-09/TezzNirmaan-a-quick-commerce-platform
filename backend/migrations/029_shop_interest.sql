-- ────────────────────────────────────────────────────────────
-- Migration 029: Shop Interest Registrations — P4-1A
--
-- Captures pre-registration interest from shop owners via the
-- /shop-signup marketing funnel page.
--
-- No RLS: admin-only table, accessed exclusively via service role.
-- Status workflow: new → contacted → onboarded | rejected
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shop_interest_registrations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name      TEXT        NOT NULL,
  owner_name     TEXT        NOT NULL,
  phone          TEXT        NOT NULL,
  city           TEXT        NOT NULL,
  shop_types     TEXT[]      NOT NULL DEFAULT '{}',
  monthly_orders TEXT,                           -- free-text range, e.g. "50–200 orders"
  status         TEXT        NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new', 'contacted', 'onboarded', 'rejected')),
  notes          TEXT,                           -- internal admin notes
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at fresh on every update
CREATE OR REPLACE FUNCTION update_shop_interest_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_interest_updated_at ON shop_interest_registrations;
CREATE TRIGGER trg_shop_interest_updated_at
  BEFORE UPDATE ON shop_interest_registrations
  FOR EACH ROW EXECUTE FUNCTION update_shop_interest_updated_at();

-- Indexes for common admin queries
CREATE INDEX IF NOT EXISTS idx_shop_interest_status       ON shop_interest_registrations (status);
CREATE INDEX IF NOT EXISTS idx_shop_interest_submitted_at ON shop_interest_registrations (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_interest_city         ON shop_interest_registrations (city);

-- Comment for clarity
COMMENT ON TABLE shop_interest_registrations IS
  'Pre-registration leads from the /shop-signup marketing funnel page. Admin-only via service role.';
COMMENT ON COLUMN shop_interest_registrations.status IS
  'Workflow status: new (just submitted) → contacted → onboarded | rejected';
COMMENT ON COLUMN shop_interest_registrations.shop_types IS
  'Array of shop type IDs: construction, paints, tiles, electrical, plumbing, hardware, decor';
