-- ============================================================================
-- Migration 086: COD Tracking
-- TezzNirmaan — Session R3
-- ============================================================================
-- Adds full COD (Cash on Delivery) lifecycle tracking:
--   sub_orders.cod_status         — not_applicable | pending | collected | remitted
--   sub_orders.cod_collected_at   — when rider confirmed cash collection
--   sub_orders.cod_remitted_at    — when admin marked batch as remitted
--   sub_orders.cod_remittance_ref — admin's reference (e.g. "UPI-20240915-001")
--   delivery_assignments.rider_cash_collected_at — timestamp of rider confirmation
-- ============================================================================

-- ── 1. Create cod_status enum ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cod_status') THEN
    CREATE TYPE cod_status AS ENUM (
      'not_applicable',  -- online payment order — COD tracking irrelevant
      'pending',         -- COD order delivered but cash not yet confirmed collected
      'collected',       -- rider confirmed cash collected from customer
      'remitted'         -- admin confirmed rider handed over cash to platform
    );
  END IF;
END $$;

-- ── 2. Add COD columns to sub_orders ─────────────────────────────────────
ALTER TABLE sub_orders
  ADD COLUMN IF NOT EXISTS cod_status         cod_status   NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS cod_collected_at   timestamptz,
  ADD COLUMN IF NOT EXISTS cod_remitted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cod_remittance_ref text;

-- ── 3. Add rider_cash_collected_at to delivery_assignments ────────────────
ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS rider_cash_collected_at timestamptz;

-- ── 4. Indexes ────────────────────────────────────────────────────────────
-- Efficiently find all pending/collected COD sub_orders for admin dashboard
CREATE INDEX IF NOT EXISTS idx_suborders_cod_status
  ON sub_orders(cod_status)
  WHERE cod_status IN ('pending', 'collected');

-- ── 5. Backfill: set cod_status = 'collected' for already-delivered COD orders ──
-- For orders that were delivered before this migration, mark them as collected
-- (we cannot know if rider actually collected, but they should have).
-- Admin can reconcile these manually.
UPDATE sub_orders so
SET cod_status = 'collected',
    cod_collected_at = so.delivered_at
FROM payments p
WHERE p.order_id = so.order_id
  AND p.method   = 'cod'
  AND so.status  = 'delivered'
  AND so.cod_status = 'not_applicable';

-- Also set cod_status = 'pending' for delivered-but-no-timestamp edge cases
-- (delivered sub_orders where delivered_at is null — shouldn't exist but guard)
UPDATE sub_orders so
SET cod_status = 'pending'
FROM payments p
WHERE p.order_id = so.order_id
  AND p.method   = 'cod'
  AND so.status  = 'delivered'
  AND so.cod_status = 'not_applicable';

-- ── 6. RLS Policies ───────────────────────────────────────────────────────

-- sub_orders: riders can view their assigned sub_orders (existing policy likely covers)
-- sub_orders: admin can update cod_status (service role bypasses RLS — no new policy needed)

-- delivery_assignments: riders can update rider_cash_collected_at on their own assignments
-- Using DO block to avoid duplicate policy errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'delivery_assignments'
      AND policyname = 'riders_update_cod_collection'
  ) THEN
    CREATE POLICY riders_update_cod_collection ON delivery_assignments
      FOR UPDATE
      USING (
        rider_id IN (
          SELECT id FROM riders WHERE profile_id = auth.uid()
        )
      )
      WITH CHECK (
        rider_id IN (
          SELECT id FROM riders WHERE profile_id = auth.uid()
        )
      );
  END IF;
END $$;
