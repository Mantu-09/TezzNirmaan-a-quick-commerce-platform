-- ============================================================================
-- Migration 014: Stock Increment RPC
-- TezzNirmaan â€” Quick-commerce for construction materials
-- ============================================================================
-- Helper function for atomic stock restoration on order cancellation.
-- Called from order.service.js:cancelOrder to restore stock quantities.
--
-- WHY NOT use UPDATE SET stock_quantity = stock_quantity + N directly?
-- The Supabase JS SDK's .update() takes a value object â€” you cannot
-- embed a SQL expression like "stock_quantity + N" in it. This RPC
-- wraps the operation cleanly and can be called from the service layer.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_inventory_stock(
  p_shop_id    uuid,
  p_product_id uuid,
  p_amount     numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE shop_inventory
  SET stock_quantity = stock_quantity + p_amount,
      updated_at     = now()
  WHERE shop_id    = p_shop_id
    AND product_id = p_product_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_inventory_stock(uuid, uuid, numeric) TO service_role;

-- ============================================================================
-- Migration 016: Rider Location Update RPC
-- ============================================================================
-- Helper to update rider geography column via PostGIS.
-- The Supabase JS SDK cannot call ST_MakePoint in .update() â€” this RPC
-- wraps the raw SQL so rider.controller.js can update location cleanly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_rider_location(
  p_profile_id uuid,
  p_lng        float8,
  p_lat        float8
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE riders
  SET current_location = ST_MakePoint(p_lng, p_lat)::geography,
      updated_at       = now()
  WHERE profile_id = p_profile_id;
$$;

GRANT EXECUTE ON FUNCTION public.update_rider_location(uuid, float8, float8) TO service_role;
-- ============================================================================
-- Migration 015: Add inventory_id to order_items
-- TezzNirmaan â€” Quick-commerce for construction materials
-- ============================================================================
-- Adds a reference to the specific shop_inventory row that was purchased.
-- Required by:
--   - mobile OrderHistoryScreen.jsx: reads item.inventory_id for reorder
--     (adds item back to cart with the correct shop's inventory record)
--   - order.service.js:cancelOrder: used in stock restore loop
--
-- Nullable because existing orders pre-migration won't have this column set.
-- New orders: place_order_atomic stores inventory_id via the items JSON payload
-- (see the updated function comment below).
-- ============================================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES shop_inventory(id) ON DELETE SET NULL;

COMMENT ON COLUMN order_items.inventory_id IS
  'FK to shop_inventory â€” the specific inventory record purchased. '
  'Nullable for backward compatibility with pre-migration orders. '
  'Used for: reorder (mobile) and stock restore on cancellation.';

-- ============================================================================
-- Update place_order_atomic to write inventory_id
-- ============================================================================
-- The existing stored procedure in 011_geo_rpc_functions.sql inserts order_items
-- from the p_items JSON array. We extend it to include inventory_id if present
-- in the item object.
--
-- The JS service already passes inventory_id in the items array (order.service.js
-- line 173: inventory_id: item.inventoryId). The Postgres function just needs to
-- read it from the JSON. We replace the function here to add that field.
--
-- NOTE: This is a CREATE OR REPLACE â€” safe to run multiple times.
-- It replaces the function from 011_geo_rpc_functions.sql in-place.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.place_order_atomic(
  p_customer_id       uuid,
  p_shop_id           uuid,
  p_address_id        uuid,
  p_address_snapshot  jsonb,
  p_payment_method    text,
  p_notes             text,
  p_order_number      text,
  p_items             jsonb,
  p_quick_subtotal    bigint,
  p_quick_delivery_fee bigint,
  p_quick_tax         bigint,
  p_sched_subtotal    bigint,
  p_sched_delivery_fee bigint,
  p_sched_tax         bigint,
  p_sched_slot_start  timestamptz DEFAULT NULL,
  p_sched_slot_end    timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id           uuid;
  v_quick_sub_id       uuid;
  v_sched_sub_id       uuid;
  v_item               jsonb;
  v_inventory_id       uuid;
  v_product_id         uuid;
  v_delivery_tier      text;
  v_sub_order_id       uuid;
  v_stock              numeric;
  v_db_price           bigint;
  v_total_amount       bigint;
  v_quick_total        bigint;
  v_sched_total        bigint;
  v_quick_sub_number   text;
  v_sched_sub_number   text;
BEGIN
  -- Compute totals
  v_quick_total := p_quick_subtotal + p_quick_delivery_fee + p_quick_tax;
  v_sched_total := p_sched_subtotal + p_sched_delivery_fee + p_sched_tax;
  v_total_amount := v_quick_total + v_sched_total;

  -- â”€â”€ 1. Validate stock and lock inventory rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_inventory_id := (v_item->>'inventory_id')::uuid;
    v_product_id   := (v_item->>'product_id')::uuid;

    -- Lock the inventory row for update
    SELECT stock_quantity, price
      INTO v_stock, v_db_price
      FROM shop_inventory
     WHERE id = v_inventory_id
       AND shop_id = p_shop_id
       AND is_listed = true
       AND is_in_stock = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: % is no longer available', v_item->>'product_name';
    END IF;

    IF v_stock < (v_item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'STOCK_UNAVAILABLE: Insufficient stock for %', v_item->>'product_name';
    END IF;

    -- Re-verify server-side price hasn't changed
    IF v_db_price <> (v_item->>'unit_price_paise')::bigint THEN
      RAISE EXCEPTION 'PRICE_CHANGED: Price changed for %. Refresh your cart.', v_item->>'product_name';
    END IF;
  END LOOP;

  -- â”€â”€ 2. Decrement stock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_inventory_id := (v_item->>'inventory_id')::uuid;

    UPDATE shop_inventory
       SET stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
           updated_at     = now()
     WHERE id = v_inventory_id;
  END LOOP;

  -- â”€â”€ 3. Create parent order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO orders (
    order_number, customer_id, shop_id,
    delivery_address_id, delivery_address_snapshot,
    subtotal, delivery_fee, tax_amount, total_amount,
    notes
  )
  VALUES (
    p_order_number, p_customer_id, p_shop_id,
    p_address_id, p_address_snapshot,
    p_quick_subtotal + p_sched_subtotal,
    p_quick_delivery_fee + p_sched_delivery_fee,
    p_quick_tax + p_sched_tax,
    v_total_amount,
    p_notes
  )
  RETURNING id INTO v_order_id;

  -- â”€â”€ 4. Create sub-orders (one per tier present) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  IF p_quick_subtotal > 0 THEN
    v_quick_sub_number := p_order_number || '-Q';
    INSERT INTO sub_orders (
      order_id, sub_order_number, delivery_tier, status,
      subtotal, delivery_fee, tax_amount, total_amount,
      estimated_delivery_at
    )
    VALUES (
      v_order_id, v_quick_sub_number, 'quick', 'pending',
      p_quick_subtotal, p_quick_delivery_fee, p_quick_tax, v_quick_total,
      now() + interval '90 minutes'
    )
    RETURNING id INTO v_quick_sub_id;
  END IF;

  IF p_sched_subtotal > 0 THEN
    v_sched_sub_number := p_order_number || '-S';
    INSERT INTO sub_orders (
      order_id, sub_order_number, delivery_tier, status,
      subtotal, delivery_fee, tax_amount, total_amount,
      estimated_delivery_at,
      delivery_slot_start, delivery_slot_end
    )
    VALUES (
      v_order_id, v_sched_sub_number, 'scheduled', 'pending',
      p_sched_subtotal, p_sched_delivery_fee, p_sched_tax, v_sched_total,
      COALESCE(p_sched_slot_end, now() + interval '24 hours'),
      p_sched_slot_start, p_sched_slot_end
    )
    RETURNING id INTO v_sched_sub_id;
  END IF;

  -- â”€â”€ 5. Insert order items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_delivery_tier := v_item->>'delivery_tier';
    v_sub_order_id  := CASE
      WHEN v_delivery_tier = 'quick'     THEN v_quick_sub_id
      WHEN v_delivery_tier = 'scheduled' THEN v_sched_sub_id
      ELSE NULL
    END;

    IF v_sub_order_id IS NULL THEN
      RAISE EXCEPTION 'No sub-order found for delivery_tier: %', v_delivery_tier;
    END IF;

    INSERT INTO order_items (
      sub_order_id, product_id, inventory_id,
      product_name, product_image_url, unit, delivery_tier,
      quantity, unit_price, tax_percent, tax_amount, total_price
    )
    VALUES (
      v_sub_order_id,
      (v_item->>'product_id')::uuid,
      -- inventory_id is now stored with each order item (migration 015)
      NULLIF(v_item->>'inventory_id', '')::uuid,
      v_item->>'product_name',
      v_item->>'product_image_url',
      (v_item->>'unit')::unit_of_measure,
      v_delivery_tier::delivery_tier,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_paise')::bigint,
      (v_item->>'tax_percent')::numeric,
      (v_item->>'tax_amount_paise')::bigint,
      (v_item->>'total_price_paise')::bigint
    );
  END LOOP;

  -- â”€â”€ 6. Create payment record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO payments (order_id, method, status, amount)
  VALUES (v_order_id, p_payment_method::payment_method, 'pending', v_total_amount);

  -- â”€â”€ 7. Clear customer cart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  DELETE FROM cart_items WHERE user_id = p_customer_id AND shop_id = p_shop_id;

  -- Return order identifiers for the service layer
  RETURN jsonb_build_object(
    'order_id',          v_order_id,
    'order_number',      p_order_number,
    'total_amount_paise', v_total_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order_atomic(
  uuid, uuid, uuid, jsonb, text, text, text, jsonb,
  bigint, bigint, bigint, bigint, bigint, bigint,
  timestamptz, timestamptz
) TO service_role;
-- ============================================================================
-- Migration 016: Schema Patches (Track A critical fixes)
-- TezzNirmaan â€” Quick-commerce for construction materials
-- ============================================================================
-- All patches are additive (IF NOT EXISTS / CREATE OR REPLACE) â€” safe to
-- run against a database that already has partial changes from development.
-- ============================================================================

-- â”€â”€ 1. Add lat / lng / location to addresses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Required for:
--   - order.service.js:previewOrder  â†’ geo delivery eligibility check
--   - customer address form GPS capture (expo-location)
-- GENERATED column auto-computes the geography value from lat/lng for PostGIS.
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS lat      double precision,
  ADD COLUMN IF NOT EXISTS lng      double precision;

-- PostGIS generated column: computed from lat/lng, stored for fast spatial queries
-- Only add if neither lat/lng columns exist YET â€” GENERATED requires a clean state.
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

-- â”€â”€ 2. Add cancelled_at to delivery_assignments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- delivery.service.js:cancelDelivery writes this field.
-- 007_riders_and_delivery.sql already has this, but run IF NOT EXISTS for safety.
ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- â”€â”€ 3. Add rider_id to sub_orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Dashboard order detail reads order.rider_id to show assigned rider name.
-- This is a denormalized convenience column â€” the authoritative source is
-- delivery_assignments (WHERE is_active = true), but this avoids a join on
-- every dashboard render.
ALTER TABLE sub_orders
  ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_suborders_rider ON sub_orders(rider_id)
  WHERE rider_id IS NOT NULL;

-- â”€â”€ 4. add notify_user RPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 012_notifications.sql already defines notify_user, but the column name in
-- the spec is 'body' while 012 uses 'message'. This version is consistent with
-- the notifications table schema (which uses 'message').
-- This is a CREATE OR REPLACE so it is safe to re-run.
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type    text,
  p_title   text,
  p_message text,           -- maps to notifications.message column
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

-- â”€â”€ 5. Ensure notifications RLS is enabled â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 012_notifications.sql already does this, included here for completeness.
-- IF NOT EXISTS equivalents: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is
-- idempotent in PostgreSQL, so safe to run again.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies are CREATE OR REPLACE in recent Postgres â€” use DROP IF EXISTS + CREATE
-- for older versions:
DROP POLICY IF EXISTS "notifications_user_read_own"   ON notifications;
DROP POLICY IF EXISTS "notifications_system_insert"   ON notifications;

CREATE POLICY "notifications_user_read_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_system_insert"
  ON notifications FOR INSERT
  WITH CHECK (true);  -- SECURITY DEFINER functions bypass RLS anyway

-- â”€â”€ 6. increment_inventory_stock â€” spec-compliant signature â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
