-- ============================================================================
-- Migration 014: Stock Increment RPC
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Helper function for atomic stock restoration on order cancellation.
-- Called from order.service.js:cancelOrder to restore stock quantities.
--
-- WHY NOT use UPDATE SET stock_quantity = stock_quantity + N directly?
-- The Supabase JS SDK's .update() takes a value object — you cannot
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
-- The Supabase JS SDK cannot call ST_MakePoint in .update() — this RPC
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
