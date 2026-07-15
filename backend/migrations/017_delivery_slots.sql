-- ============================================================================
-- Migration 017: Delivery Slot Management (B6)
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- delivery_slot_templates  — shop owner defines reusable slot patterns per day
-- delivery_slot_bookings   — one record per sub_order that took a scheduled slot
-- ============================================================================

-- ── Slot templates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_slot_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day_of_week  integer     CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon … 6=Sat
  start_time   time        NOT NULL,
  end_time     time        NOT NULL,
  max_orders   integer     NOT NULL DEFAULT 10
                           CHECK (max_orders > 0),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Prevent two active templates with same day+window for same shop
  CONSTRAINT uq_slot_template UNIQUE (shop_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_slot_tmpl_shop ON delivery_slot_templates(shop_id);
CREATE INDEX IF NOT EXISTS idx_slot_tmpl_day  ON delivery_slot_templates(shop_id, day_of_week)
  WHERE is_active = true;

-- ── Slot bookings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_slot_bookings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id uuid        NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
  shop_id      uuid        NOT NULL REFERENCES shops(id)       ON DELETE CASCADE,
  slot_date    date        NOT NULL,
  slot_start   time        NOT NULL,
  slot_end     time        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- One booking per sub_order (a sub_order can only be in one slot)
  CONSTRAINT uq_booking_sub_order UNIQUE (sub_order_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_bookings_date_shop
  ON delivery_slot_bookings(shop_id, slot_date);

CREATE INDEX IF NOT EXISTS idx_slot_bookings_sub_order
  ON delivery_slot_bookings(sub_order_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE delivery_slot_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_slot_bookings  ENABLE ROW LEVEL SECURITY;

-- Templates: shop owner can manage their own
CREATE POLICY "Shop owner manages own templates"
  ON delivery_slot_templates FOR ALL
  USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Templates: customers can read active templates (for slot picker)
CREATE POLICY "Public read active templates"
  ON delivery_slot_templates FOR SELECT
  USING (is_active = true);

-- Bookings: service role manages all (customer/shop read via service)
CREATE POLICY "Service role full access to bookings"
  ON delivery_slot_bookings FOR ALL
  USING (auth.role() = 'service_role');

-- Bookings: shop owner reads their shop's bookings
CREATE POLICY "Shop owner reads own bookings"
  ON delivery_slot_bookings FOR SELECT
  USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- ── RPC: get_available_slots ──────────────────────────────────
-- Returns slot templates for a shop+date, enriched with current
-- booking_count, so the mobile app knows how full each slot is.
CREATE OR REPLACE FUNCTION get_available_slots(
  p_shop_id uuid,
  p_date    date
)
RETURNS TABLE (
  template_id   uuid,
  start_time    time,
  end_time      time,
  max_orders    integer,
  booking_count bigint,
  available     boolean,
  label         text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id                                                    AS template_id,
    t.start_time,
    t.end_time,
    t.max_orders,
    COALESCE(b.cnt, 0)                                      AS booking_count,
    COALESCE(b.cnt, 0) < t.max_orders                      AS available,
    -- Format: "9:00 AM – 12:00 PM (6 left)"
    to_char(t.start_time, 'HH12:MI AM')
      || ' – '
      || to_char(t.end_time, 'HH12:MI AM')
      || CASE
           WHEN COALESCE(b.cnt, 0) >= t.max_orders
             THEN ' (Full)'
           ELSE
             ' (' || (t.max_orders - COALESCE(b.cnt, 0))::text || ' left)'
         END                                                AS label
  FROM delivery_slot_templates t
  LEFT JOIN (
    SELECT slot_start, slot_end, shop_id, COUNT(*) AS cnt
    FROM   delivery_slot_bookings
    WHERE  shop_id   = p_shop_id
      AND  slot_date = p_date
    GROUP  BY slot_start, slot_end, shop_id
  ) b ON b.shop_id   = t.shop_id
      AND b.slot_start = t.start_time
      AND b.slot_end   = t.end_time
  WHERE t.shop_id    = p_shop_id
    AND t.is_active  = true
    -- 0=Sunday … match to the date's dow
    AND t.day_of_week = EXTRACT(DOW FROM p_date)::integer
  ORDER BY t.start_time;
$$;
