-- ============================================================================
-- Migration 011: PostGIS RPC Functions + Atomic Checkout Stored Procedure
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- This file creates three Postgres functions:
--   1. find_nearby_shops        — customer geo-matching
--   2. check_shop_delivery_range — eligibility check per tier
--   3. place_order_atomic        — full checkout in one transaction
--                                  (stock decrement + order creation)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. find_nearby_shops
--    Given a customer lat/lng, find all active shops that can deliver to them.
--    Uses PostGIS ST_DWithin on the geography(Point) column with GIST index.
--    Returns shops annotated with distance_km + per-tier eligibility flags.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_nearby_shops(
  customer_lat  float8,
  customer_lng  float8
)
RETURNS TABLE(
  id                          uuid,
  name                        text,
  slug                        text,
  phone                       text,
  address_line1               text,
  city                        text,
  pincode                     text,
  is_accepting_orders         boolean,
  quick_delivery_radius_km    numeric,
  scheduled_delivery_radius_km numeric,
  operating_hours             jsonb,
  distance_km                 float8,
  can_quick_deliver           boolean,
  can_scheduled_deliver       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.slug,
    s.phone,
    s.address_line1,
    s.city,
    s.pincode,
    s.is_accepting_orders,
    s.quick_delivery_radius_km,
    s.scheduled_delivery_radius_km,
    s.operating_hours,
    -- Distance in km from customer to shop
    ST_Distance(
      s.location,
      ST_MakePoint(customer_lng, customer_lat)::geography
    ) / 1000.0 AS distance_km,
    -- Can quick-deliver? (within quick radius)
    ST_DWithin(
      s.location,
      ST_MakePoint(customer_lng, customer_lat)::geography,
      s.quick_delivery_radius_km * 1000.0
    ) AS can_quick_deliver,
    -- Can scheduled-deliver? (within scheduled radius)
    ST_DWithin(
      s.location,
      ST_MakePoint(customer_lng, customer_lat)::geography,
      s.scheduled_delivery_radius_km * 1000.0
    ) AS can_scheduled_deliver
  FROM shops s
  WHERE
    s.is_active = true
    AND s.is_accepting_orders = true
    -- Only return shops within the larger (scheduled) delivery radius
    AND ST_DWithin(
      s.location,
      ST_MakePoint(customer_lng, customer_lat)::geography,
      s.scheduled_delivery_radius_km * 1000.0
    )
  ORDER BY distance_km ASC;
$$;

-- ---------------------------------------------------------------------------
-- 2. check_shop_delivery_range
--    Check if a customer address is within delivery range of a specific shop
--    for a given tier radius (in km).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_shop_delivery_range(
  p_shop_id     uuid,
  customer_lat  float8,
  customer_lng  float8,
  radius_km     numeric
)
RETURNS TABLE(
  within_range  boolean,
  distance_km   float8
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ST_DWithin(
      s.location,
      ST_MakePoint(customer_lng, customer_lat)::geography,
      radius_km * 1000.0
    ) AS within_range,
    ST_Distance(
      s.location,
      ST_MakePoint(customer_lng, customer_lat)::geography
    ) / 1000.0 AS distance_km
  FROM shops s
  WHERE s.id = p_shop_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. place_order_atomic
--    The core checkout transaction. Everything inside is atomic:
--    - Validates and decrements stock (with row-level locking)
--    - Creates parent order + sub_orders (one per tier present)
--    - Creates order_items with SNAPSHOTTED prices (not trusted from client)
--    - Creates the payment record
--    - Inserts initial status_history entries
--    - Clears the customer's cart
--
--    IMPORTANT: unit_price in p_items must come from the server-side
--    price lookup — never from the client. The service layer must
--    re-read prices from shop_inventory before calling this function.
--
--    All money values (prices, fees, tax) are in PAISE (bigint).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order_atomic(
  p_customer_id          uuid,
  p_shop_id              uuid,
  p_address_id           uuid,
  p_address_snapshot     jsonb,
  p_payment_method       text,
  p_notes                text,
  p_order_number         text,
  -- Items array: each element must have:
  --   inventory_id, product_id, product_name, product_image_url,
  --   unit, delivery_tier, quantity,
  --   unit_price_paise, tax_percent, tax_amount_paise, total_price_paise
  p_items                jsonb,
  -- Quick tier totals (0 if no quick items)
  p_quick_subtotal       bigint,
  p_quick_delivery_fee   bigint,
  p_quick_tax            bigint,
  -- Scheduled tier totals (0 if no scheduled items)
  p_sched_subtotal       bigint,
  p_sched_delivery_fee   bigint,
  p_sched_tax            bigint,
  -- Scheduled delivery slot (nullable if no scheduled items)
  p_sched_slot_start     timestamptz DEFAULT NULL,
  p_sched_slot_end       timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id             uuid;
  v_quick_so_id          uuid;
  v_sched_so_id          uuid;
  v_item                 jsonb;
  v_rows_updated         int;
  v_has_quick            boolean := false;
  v_has_sched            boolean := false;
  v_quick_total          bigint;
  v_sched_total          bigint;
  v_total_amount         bigint;
  v_db_price             bigint;
BEGIN
  -- ── Determine which tiers are present ────────────────────────────────────
  SELECT
    bool_or((v.item->>'delivery_tier') = 'quick'),
    bool_or((v.item->>'delivery_tier') = 'scheduled')
  INTO v_has_quick, v_has_sched
  FROM jsonb_array_elements(p_items) AS v(item);

  -- ── Calculate totals ──────────────────────────────────────────────────────
  v_quick_total  := p_quick_subtotal  + p_quick_delivery_fee  + p_quick_tax;
  v_sched_total  := p_sched_subtotal  + p_sched_delivery_fee  + p_sched_tax;
  v_total_amount := v_quick_total + v_sched_total;

  -- ── STEP 1: Atomic stock decrement ────────────────────────────────────────
  -- For each item, attempt to decrement stock.
  -- The WHERE clause (stock_quantity >= quantity) is the race-condition guard:
  -- if two customers order the last unit simultaneously, only one UPDATE
  -- will return ROW_COUNT=1. The other gets 0 and we abort the transaction.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- ALSO: re-verify the server-side price matches what we computed
    -- (defence against price changes between preview and place)
    SELECT price INTO v_db_price
    FROM shop_inventory
    WHERE id = (v_item->>'inventory_id')::uuid
      AND shop_id = p_shop_id
      AND is_listed = true;

    IF v_db_price IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: % is no longer available in this shop',
        v_item->>'product_name'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_db_price != (v_item->>'unit_price_paise')::bigint THEN
      RAISE EXCEPTION 'PRICE_CHANGED: Price for % has changed. Please refresh your cart.',
        v_item->>'product_name'
        USING ERRCODE = 'P0003';
    END IF;

    -- Decrement stock atomically
    UPDATE shop_inventory
    SET
      stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
      updated_at     = now()
    WHERE
      id             = (v_item->>'inventory_id')::uuid
      AND shop_id    = p_shop_id
      AND is_listed  = true
      AND stock_quantity >= (v_item->>'quantity')::numeric;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      RAISE EXCEPTION 'STOCK_UNAVAILABLE: % is out of stock or requested quantity unavailable.',
        v_item->>'product_name'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- ── STEP 2: Create parent order ───────────────────────────────────────────
  INSERT INTO orders (
    order_number,
    customer_id, shop_id,
    delivery_address_id, delivery_address_snapshot,
    subtotal, delivery_fee, tax_amount, discount_amount, total_amount,
    notes
  ) VALUES (
    p_order_number,
    p_customer_id, p_shop_id,
    p_address_id,  p_address_snapshot,
    p_quick_subtotal  + p_sched_subtotal,
    p_quick_delivery_fee + p_sched_delivery_fee,
    p_quick_tax + p_sched_tax,
    0,
    v_total_amount,
    p_notes
  )
  RETURNING id INTO v_order_id;

  -- ── STEP 3: Create quick sub_order ────────────────────────────────────────
  IF v_has_quick AND v_quick_total > 0 THEN
    INSERT INTO sub_orders (
      order_id, sub_order_number, delivery_tier, status,
      subtotal, delivery_fee, tax_amount, discount_amount, total_amount,
      estimated_delivery_at
    ) VALUES (
      v_order_id, p_order_number || '-Q', 'quick', 'pending',
      p_quick_subtotal, p_quick_delivery_fee, p_quick_tax, 0, v_quick_total,
      now() + interval '90 minutes'
    )
    RETURNING id INTO v_quick_so_id;

    INSERT INTO sub_order_status_history (sub_order_id, from_status, to_status, changed_by)
    VALUES (v_quick_so_id, NULL, 'pending', p_customer_id);
  END IF;

  -- ── STEP 4: Create scheduled sub_order ───────────────────────────────────
  IF v_has_sched AND v_sched_total > 0 THEN
    INSERT INTO sub_orders (
      order_id, sub_order_number, delivery_tier, status,
      subtotal, delivery_fee, tax_amount, discount_amount, total_amount,
      estimated_delivery_at, delivery_slot_start, delivery_slot_end
    ) VALUES (
      v_order_id, p_order_number || '-S', 'scheduled', 'pending',
      p_sched_subtotal, p_sched_delivery_fee, p_sched_tax, 0, v_sched_total,
      COALESCE(p_sched_slot_start, now() + interval '24 hours'),
      p_sched_slot_start,
      p_sched_slot_end
    )
    RETURNING id INTO v_sched_so_id;

    INSERT INTO sub_order_status_history (sub_order_id, from_status, to_status, changed_by)
    VALUES (v_sched_so_id, NULL, 'pending', p_customer_id);
  END IF;

  -- ── STEP 5: Create order items ────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      sub_order_id,
      product_id,
      product_name, product_image_url,
      unit, delivery_tier,
      quantity,
      unit_price, tax_percent, tax_amount, total_price
    ) VALUES (
      CASE (v_item->>'delivery_tier')
        WHEN 'quick' THEN v_quick_so_id
        ELSE v_sched_so_id
      END,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      v_item->>'product_image_url',
      (v_item->>'unit')::unit_of_measure,
      (v_item->>'delivery_tier')::delivery_tier,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_paise')::bigint,
      (v_item->>'tax_percent')::numeric,
      (v_item->>'tax_amount_paise')::bigint,
      (v_item->>'total_price_paise')::bigint
    );
  END LOOP;

  -- ── STEP 6: Create payment record ─────────────────────────────────────────
  INSERT INTO payments (order_id, method, status, amount, currency)
  VALUES (
    v_order_id,
    p_payment_method::payment_method,
    'pending',
    v_total_amount,
    'INR'
  );

  -- ── STEP 7: Insert order-placed notification for customer ─────────────────
  INSERT INTO notifications (user_id, type, title, message, metadata)
  VALUES (
    p_customer_id,
    'order_placed',
    'Order Placed!',
    'Your order ' || p_order_number || ' has been placed successfully.',
    jsonb_build_object('order_id', v_order_id, 'order_number', p_order_number)
  );

  -- ── STEP 8: Clear customer's cart for this shop ───────────────────────────
  DELETE FROM cart_items
  WHERE user_id = p_customer_id AND shop_id = p_shop_id;

  -- ── Return the created IDs so the service layer can fetch full detail ─────
  RETURN jsonb_build_object(
    'order_id',            v_order_id,
    'order_number',        p_order_number,
    'total_amount_paise',  v_total_amount,
    'quick_sub_order_id',  v_quick_so_id,
    'sched_sub_order_id',  v_sched_so_id
  );
END;
$$;

-- Grant execute to service role (called from Express with supabaseAdmin)
GRANT EXECUTE ON FUNCTION public.find_nearby_shops(float8, float8) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_shop_delivery_range(uuid, float8, float8, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_order_atomic TO service_role;
