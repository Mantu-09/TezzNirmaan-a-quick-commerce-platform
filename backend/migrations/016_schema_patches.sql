-- ============================================================================
-- Migration 016: Schema Patches (Track A critical fixes)
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- All patches are additive (IF NOT EXISTS / CREATE OR REPLACE) — safe to
-- run against a database that already has partial changes from development.
-- ============================================================================

-- ── 1. Add lat / lng / location to addresses ──────────────────────────────────
-- Required for:
--   - order.service.js:previewOrder  → geo delivery eligibility check
--   - customer address form GPS capture (expo-location)
-- GENERATED column auto-computes the geography value from lat/lng for PostGIS.
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS lat      double precision,
  ADD COLUMN IF NOT EXISTS lng      double precision;

-- PostGIS generated column: computed from lat/lng, stored for fast spatial queries
-- Only add if neither lat/lng columns exist YET — GENERATED requires a clean state.
-- (Use a DO block because ALTER TABLE ... ADD GENERATED requires specific syntax)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'addresses' AND column_name = 'location'
  ) THEN
    ALTER TABLE addresses
      ADD COLUMN location geography(Point, 4326)
        GENERATED ALWAYS AS (
          CASE
            WHEN lat IS NOT NULL AND lng IS NOT NULL
            THEN ST_MakePoint(lng, lat)::geography
          END
        ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_addresses_location ON addresses USING GIST(location)
  WHERE location IS NOT NULL;

-- ── 2. Add cancelled_at to delivery_assignments ──────────────────────────────
-- delivery.service.js:cancelDelivery writes this field.
-- 007_riders_and_delivery.sql already has this, but run IF NOT EXISTS for safety.
ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ── 3. Add rider_id to sub_orders ────────────────────────────────────────────
-- Dashboard order detail reads order.rider_id to show assigned rider name.
-- This is a denormalized convenience column — the authoritative source is
-- delivery_assignments (WHERE is_active = true), but this avoids a join on
-- every dashboard render.
ALTER TABLE sub_orders
  ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_suborders_rider ON sub_orders(rider_id)
  WHERE rider_id IS NOT NULL;

-- ── 4. add notify_user RPC ───────────────────────────────────────────────────
-- 012_notifications.sql already defines notify_user, but the column name in
-- the spec is 'body' while 012 uses 'message'. This version is consistent with
-- the notifications table schema (which uses 'message').
-- This is a CREATE OR REPLACE so it is safe to re-run.
-- Drop first to allow renaming parameter p_metadata → p_data
DROP FUNCTION IF EXISTS public.notify_user(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type    text,
  p_title   text,
  p_message text,
  p_data    jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, jsonb) TO service_role;

-- ── 5. Ensure notifications RLS is enabled ───────────────────────────────────
-- 012_notifications.sql already does this, included here for completeness.
-- IF NOT EXISTS equivalents: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is
-- idempotent in PostgreSQL, so safe to run again.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies are CREATE OR REPLACE in recent Postgres — use DROP IF EXISTS + CREATE
-- for older versions:
DROP POLICY IF EXISTS "notifications_user_read_own"   ON notifications;
DROP POLICY IF EXISTS "notifications_system_insert"   ON notifications;

CREATE POLICY "notifications_user_read_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_system_insert"
  ON notifications FOR INSERT
  WITH CHECK (true);  -- SECURITY DEFINER functions bypass RLS anyway

-- ── 6. increment_inventory_stock — spec-compliant signature ──────────────────
-- Spec A6 uses (p_inventory_id, p_amount) via shop_inventory.id.
-- Migration 014 defined (p_shop_id, p_product_id, p_amount).
-- Add both signatures so both code paths work.
CREATE OR REPLACE FUNCTION public.increment_inventory_stock(
  p_inventory_id uuid,
  p_amount       numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE shop_inventory
  SET stock_quantity = stock_quantity + p_amount,
      updated_at     = now()
  WHERE id = p_inventory_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_inventory_stock(uuid, numeric) TO service_role;
