-- ============================================================================
-- Migration 015: Add inventory_id to order_items
-- TezzNirmaan — Quick-commerce for construction materials
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
  'FK to shop_inventory — the specific inventory record purchased. '
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
-- NOTE: This is a CREATE OR REPLACE — safe to run multiple times.
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

  -- ── 1. Validate stock and lock inventory rows ─────────────────────────────
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

  -- ── 2. Decrement stock ───────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_inventory_id := (v_item->>'inventory_id')::uuid;

    UPDATE shop_inventory
       SET stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
           updated_at     = now()
     WHERE id = v_inventory_id;
  END LOOP;

  -- ── 3. Create parent order ───────────────────────────────────────────────
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

  -- ── 4. Create sub-orders (one per tier present) ──────────────────────────
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

  -- ── 5. Insert order items ────────────────────────────────────────────────
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

  -- ── 6. Create payment record ─────────────────────────────────────────────
  INSERT INTO payments (order_id, method, status, amount)
  VALUES (v_order_id, p_payment_method::payment_method, 'pending', v_total_amount);

  -- ── 7. Clear customer cart ───────────────────────────────────────────────
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
