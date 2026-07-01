-- ============================================================================
-- Migration 010: Row-Level Security (RLS) Policies
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Enables RLS on all tables and creates fine-grained access policies.
--
-- Convention:
--   auth.uid()                          → current user's UUID
--   auth.jwt() -> 'app_metadata'        → custom claims (contains 'role')
--   (auth.jwt() -> 'app_metadata' ->> 'role')  → user's role string
--
-- Helper function to reduce repetition in policy definitions:
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: extract the current user's role from JWT app_metadata
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'customer');
$$;

-- ---------------------------------------------------------------------------
-- Helper: check if current user is staff (active) at a given shop
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_shop_staff(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM shop_staff
    WHERE shop_id = p_shop_id
      AND profile_id = auth.uid()
      AND is_active = true
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: check if current user is the owner of a given shop
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_shop_owner(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM shops
    WHERE id = p_shop_id
      AND owner_id = auth.uid()
  );
$$;


-- =====================================================================
-- 1. PROFILES
-- =====================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admin can read all profiles
DROP POLICY IF EXISTS profiles_select_admin ON profiles;
CREATE POLICY profiles_select_admin ON profiles
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

-- Users can update their own profile
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Users can insert their own profile (on signup)
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());


-- =====================================================================
-- 2. SHOPS
-- =====================================================================
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read active shops (for browsing)
DROP POLICY IF EXISTS shops_select_public ON shops;
CREATE POLICY shops_select_public ON shops
  FOR SELECT USING (is_active = true);

-- Admin can read all shops (including inactive)
DROP POLICY IF EXISTS shops_select_admin ON shops;
CREATE POLICY shops_select_admin ON shops
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

-- Owner can update their own shop
DROP POLICY IF EXISTS shops_update_owner ON shops;
CREATE POLICY shops_update_owner ON shops
  FOR UPDATE USING (owner_id = auth.uid());

-- Admin can insert/update any shop
DROP POLICY IF EXISTS shops_insert_admin ON shops;
CREATE POLICY shops_insert_admin ON shops
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS shops_update_admin ON shops;
CREATE POLICY shops_update_admin ON shops
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 3. CATEGORIES (public read, admin write)
-- =====================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select_public ON categories;
CREATE POLICY categories_select_public ON categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS categories_insert_admin ON categories;
CREATE POLICY categories_insert_admin ON categories
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS categories_update_admin ON categories;
CREATE POLICY categories_update_admin ON categories
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 4. BRANDS (public read, admin write)
-- =====================================================================
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brands_select_public ON brands;
CREATE POLICY brands_select_public ON brands
  FOR SELECT USING (true);

DROP POLICY IF EXISTS brands_insert_admin ON brands;
CREATE POLICY brands_insert_admin ON brands
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS brands_update_admin ON brands;
CREATE POLICY brands_update_admin ON brands
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 5. PRODUCTS (public read active, admin write)
-- =====================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select_public ON products;
CREATE POLICY products_select_public ON products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS products_select_admin ON products;
CREATE POLICY products_select_admin ON products
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS products_insert_admin ON products;
CREATE POLICY products_insert_admin ON products
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS products_update_admin ON products;
CREATE POLICY products_update_admin ON products
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 6. SHOP INVENTORY
-- =====================================================================
ALTER TABLE shop_inventory ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read listed, in-stock items (customer browsing)
DROP POLICY IF EXISTS inventory_select_public ON shop_inventory;
CREATE POLICY inventory_select_public ON shop_inventory
  FOR SELECT USING (is_listed = true AND is_in_stock = true);

-- Shop owner can read ALL their inventory (including unlisted/out-of-stock)
DROP POLICY IF EXISTS inventory_select_owner ON shop_inventory;
CREATE POLICY inventory_select_owner ON shop_inventory
  FOR SELECT USING (public.is_shop_owner(shop_id));

-- Shop staff can read all their shop's inventory
DROP POLICY IF EXISTS inventory_select_staff ON shop_inventory;
CREATE POLICY inventory_select_staff ON shop_inventory
  FOR SELECT USING (public.is_shop_staff(shop_id));

-- Admin can read all inventory
DROP POLICY IF EXISTS inventory_select_admin ON shop_inventory;
CREATE POLICY inventory_select_admin ON shop_inventory
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

-- Shop owner can insert/update/delete their own inventory
DROP POLICY IF EXISTS inventory_insert_owner ON shop_inventory;
CREATE POLICY inventory_insert_owner ON shop_inventory
  FOR INSERT WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS inventory_update_owner ON shop_inventory;
CREATE POLICY inventory_update_owner ON shop_inventory
  FOR UPDATE USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS inventory_delete_owner ON shop_inventory;
CREATE POLICY inventory_delete_owner ON shop_inventory
  FOR DELETE USING (public.is_shop_owner(shop_id));

-- Shop staff can insert/update inventory (if they have permission — enforced at app layer)
DROP POLICY IF EXISTS inventory_insert_staff ON shop_inventory;
CREATE POLICY inventory_insert_staff ON shop_inventory
  FOR INSERT WITH CHECK (public.is_shop_staff(shop_id));

DROP POLICY IF EXISTS inventory_update_staff ON shop_inventory;
CREATE POLICY inventory_update_staff ON shop_inventory
  FOR UPDATE USING (public.is_shop_staff(shop_id));

-- Admin can write all inventory
DROP POLICY IF EXISTS inventory_insert_admin ON shop_inventory;
CREATE POLICY inventory_insert_admin ON shop_inventory
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS inventory_update_admin ON shop_inventory;
CREATE POLICY inventory_update_admin ON shop_inventory
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 7. ADDRESSES
-- =====================================================================
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Users can read their own addresses
DROP POLICY IF EXISTS addresses_select_own ON addresses;
CREATE POLICY addresses_select_own ON addresses
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own addresses
DROP POLICY IF EXISTS addresses_insert_own ON addresses;
CREATE POLICY addresses_insert_own ON addresses
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own addresses
DROP POLICY IF EXISTS addresses_update_own ON addresses;
CREATE POLICY addresses_update_own ON addresses
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own addresses
DROP POLICY IF EXISTS addresses_delete_own ON addresses;
CREATE POLICY addresses_delete_own ON addresses
  FOR DELETE USING (user_id = auth.uid());


-- =====================================================================
-- 8. CART ITEMS
-- =====================================================================
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Users can read their own cart
DROP POLICY IF EXISTS cart_select_own ON cart_items;
CREATE POLICY cart_select_own ON cart_items
  FOR SELECT USING (user_id = auth.uid());

-- Users can add to their own cart
DROP POLICY IF EXISTS cart_insert_own ON cart_items;
CREATE POLICY cart_insert_own ON cart_items
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own cart items
DROP POLICY IF EXISTS cart_update_own ON cart_items;
CREATE POLICY cart_update_own ON cart_items
  FOR UPDATE USING (user_id = auth.uid());

-- Users can remove from their own cart
DROP POLICY IF EXISTS cart_delete_own ON cart_items;
CREATE POLICY cart_delete_own ON cart_items
  FOR DELETE USING (user_id = auth.uid());


-- =====================================================================
-- 9. ORDERS (parent)
-- =====================================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Customer can read their own orders
DROP POLICY IF EXISTS orders_select_customer ON orders;
CREATE POLICY orders_select_customer ON orders
  FOR SELECT USING (customer_id = auth.uid());

-- Shop owner can read orders for their shop
DROP POLICY IF EXISTS orders_select_shop_owner ON orders;
CREATE POLICY orders_select_shop_owner ON orders
  FOR SELECT USING (public.is_shop_owner(shop_id));

-- Shop staff can read orders for their shop
DROP POLICY IF EXISTS orders_select_shop_staff ON orders;
CREATE POLICY orders_select_shop_staff ON orders
  FOR SELECT USING (public.is_shop_staff(shop_id));

-- Admin can read all orders
DROP POLICY IF EXISTS orders_select_admin ON orders;
CREATE POLICY orders_select_admin ON orders
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

-- Orders are created by the system (service role) during checkout.
-- No direct INSERT policy for authenticated users — the Express API
-- uses the Supabase service_role key to create orders.


-- =====================================================================
-- 10. SUB-ORDERS
-- =====================================================================
ALTER TABLE sub_orders ENABLE ROW LEVEL SECURITY;

-- Customer can read sub-orders for their orders
DROP POLICY IF EXISTS suborders_select_customer ON sub_orders;
CREATE POLICY suborders_select_customer ON sub_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = sub_orders.order_id
        AND orders.customer_id = auth.uid()
    )
  );

-- Shop owner can read sub-orders for their shop's orders
DROP POLICY IF EXISTS suborders_select_shop_owner ON sub_orders;
CREATE POLICY suborders_select_shop_owner ON sub_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = sub_orders.order_id
        AND public.is_shop_owner(orders.shop_id)
    )
  );

-- Shop staff can read sub-orders for their shop's orders
DROP POLICY IF EXISTS suborders_select_shop_staff ON sub_orders;
CREATE POLICY suborders_select_shop_staff ON sub_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = sub_orders.order_id
        AND public.is_shop_staff(orders.shop_id)
    )
  );

-- Rider can read sub-orders they have an active assignment for
DROP POLICY IF EXISTS suborders_select_rider ON sub_orders;
CREATE POLICY suborders_select_rider ON sub_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery_assignments da
        JOIN riders r ON r.id = da.rider_id
      WHERE da.sub_order_id = sub_orders.id
        AND da.is_active = true
        AND r.profile_id = auth.uid()
    )
  );

-- Admin can read all sub-orders
DROP POLICY IF EXISTS suborders_select_admin ON sub_orders;
CREATE POLICY suborders_select_admin ON sub_orders
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 11. ORDER ITEMS (access through sub_orders)
-- =====================================================================
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Customer can read order items for their sub-orders
DROP POLICY IF EXISTS order_items_select_customer ON order_items;
CREATE POLICY order_items_select_customer ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = order_items.sub_order_id
        AND o.customer_id = auth.uid()
    )
  );

-- Shop owner can read order items for their shop's sub-orders
DROP POLICY IF EXISTS order_items_select_shop_owner ON order_items;
CREATE POLICY order_items_select_shop_owner ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = order_items.sub_order_id
        AND public.is_shop_owner(o.shop_id)
    )
  );

-- Shop staff can read order items for their shop's sub-orders
DROP POLICY IF EXISTS order_items_select_shop_staff ON order_items;
CREATE POLICY order_items_select_shop_staff ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = order_items.sub_order_id
        AND public.is_shop_staff(o.shop_id)
    )
  );

-- Rider can read order items for sub-orders they're delivering
DROP POLICY IF EXISTS order_items_select_rider ON order_items;
CREATE POLICY order_items_select_rider ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery_assignments da
        JOIN riders r ON r.id = da.rider_id
      WHERE da.sub_order_id = order_items.sub_order_id
        AND da.is_active = true
        AND r.profile_id = auth.uid()
    )
  );

-- Admin can read all order items
DROP POLICY IF EXISTS order_items_select_admin ON order_items;
CREATE POLICY order_items_select_admin ON order_items
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 12. DELIVERY ASSIGNMENTS
-- =====================================================================
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;

-- Rider can read their own assignments
DROP POLICY IF EXISTS assignments_select_rider ON delivery_assignments;
CREATE POLICY assignments_select_rider ON delivery_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM riders
      WHERE riders.id = delivery_assignments.rider_id
        AND riders.profile_id = auth.uid()
    )
  );

-- Shop owner can read assignments for their shop's sub-orders
DROP POLICY IF EXISTS assignments_select_shop_owner ON delivery_assignments;
CREATE POLICY assignments_select_shop_owner ON delivery_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = delivery_assignments.sub_order_id
        AND public.is_shop_owner(o.shop_id)
    )
  );

-- Shop staff can read assignments for their shop's sub-orders
DROP POLICY IF EXISTS assignments_select_shop_staff ON delivery_assignments;
CREATE POLICY assignments_select_shop_staff ON delivery_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = delivery_assignments.sub_order_id
        AND public.is_shop_staff(o.shop_id)
    )
  );

-- Admin can read all delivery assignments
DROP POLICY IF EXISTS assignments_select_admin ON delivery_assignments;
CREATE POLICY assignments_select_admin ON delivery_assignments
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 13. RIDERS
-- =====================================================================
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;

-- Rider can read their own record
DROP POLICY IF EXISTS riders_select_own ON riders;
CREATE POLICY riders_select_own ON riders
  FOR SELECT USING (profile_id = auth.uid());

-- Rider can update their own record (location, status)
DROP POLICY IF EXISTS riders_update_own ON riders;
CREATE POLICY riders_update_own ON riders
  FOR UPDATE USING (profile_id = auth.uid());

-- Admin can read all riders
DROP POLICY IF EXISTS riders_select_admin ON riders;
CREATE POLICY riders_select_admin ON riders
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

-- Admin can create and update riders
DROP POLICY IF EXISTS riders_insert_admin ON riders;
CREATE POLICY riders_insert_admin ON riders
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS riders_update_admin ON riders;
CREATE POLICY riders_update_admin ON riders
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');

-- Shop owner/staff can read riders assigned to their shop (for assignment UI)
DROP POLICY IF EXISTS riders_select_shop_owner ON riders;
CREATE POLICY riders_select_shop_owner ON riders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rider_shop_assignments rsa
        JOIN shops s ON s.id = rsa.shop_id
      WHERE rsa.rider_id = riders.id
        AND rsa.is_active = true
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS riders_select_shop_staff ON riders;
CREATE POLICY riders_select_shop_staff ON riders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rider_shop_assignments rsa
      WHERE rsa.rider_id = riders.id
        AND rsa.is_active = true
        AND public.is_shop_staff(rsa.shop_id)
    )
  );


-- =====================================================================
-- 14. PAYMENTS
-- =====================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Customer can read payments for their own orders
DROP POLICY IF EXISTS payments_select_customer ON payments;
CREATE POLICY payments_select_customer ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payments.order_id
        AND orders.customer_id = auth.uid()
    )
  );

-- Admin can read all payments
DROP POLICY IF EXISTS payments_select_admin ON payments;
CREATE POLICY payments_select_admin ON payments
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 15. RIDER SHOP ASSIGNMENTS
-- =====================================================================
ALTER TABLE rider_shop_assignments ENABLE ROW LEVEL SECURITY;

-- Rider can read their own shop assignments
DROP POLICY IF EXISTS rsa_select_rider ON rider_shop_assignments;
CREATE POLICY rsa_select_rider ON rider_shop_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM riders
      WHERE riders.id = rider_shop_assignments.rider_id
        AND riders.profile_id = auth.uid()
    )
  );

-- Shop owner can read/write assignments for their shop
DROP POLICY IF EXISTS rsa_select_shop_owner ON rider_shop_assignments;
CREATE POLICY rsa_select_shop_owner ON rider_shop_assignments
  FOR SELECT USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS rsa_insert_shop_owner ON rider_shop_assignments;
CREATE POLICY rsa_insert_shop_owner ON rider_shop_assignments
  FOR INSERT WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS rsa_update_shop_owner ON rider_shop_assignments;
CREATE POLICY rsa_update_shop_owner ON rider_shop_assignments
  FOR UPDATE USING (public.is_shop_owner(shop_id));

-- Admin can manage all rider-shop assignments
DROP POLICY IF EXISTS rsa_select_admin ON rider_shop_assignments;
CREATE POLICY rsa_select_admin ON rider_shop_assignments
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS rsa_insert_admin ON rider_shop_assignments;
CREATE POLICY rsa_insert_admin ON rider_shop_assignments
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS rsa_update_admin ON rider_shop_assignments;
CREATE POLICY rsa_update_admin ON rider_shop_assignments
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 16. SUB-ORDER STATUS HISTORY
-- =====================================================================
ALTER TABLE sub_order_status_history ENABLE ROW LEVEL SECURITY;

-- Access follows sub_orders: customer, shop owner/staff, admin
DROP POLICY IF EXISTS status_history_select_customer ON sub_order_status_history;
CREATE POLICY status_history_select_customer ON sub_order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = sub_order_status_history.sub_order_id
        AND o.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS status_history_select_shop_owner ON sub_order_status_history;
CREATE POLICY status_history_select_shop_owner ON sub_order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = sub_order_status_history.sub_order_id
        AND public.is_shop_owner(o.shop_id)
    )
  );

DROP POLICY IF EXISTS status_history_select_shop_staff ON sub_order_status_history;
CREATE POLICY status_history_select_shop_staff ON sub_order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sub_orders so
        JOIN orders o ON o.id = so.order_id
      WHERE so.id = sub_order_status_history.sub_order_id
        AND public.is_shop_staff(o.shop_id)
    )
  );

DROP POLICY IF EXISTS status_history_select_admin ON sub_order_status_history;
CREATE POLICY status_history_select_admin ON sub_order_status_history
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- =====================================================================
-- 17. SHOP STAFF
-- =====================================================================
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;

-- Staff can read their own record
DROP POLICY IF EXISTS shop_staff_select_own ON shop_staff;
CREATE POLICY shop_staff_select_own ON shop_staff
  FOR SELECT USING (profile_id = auth.uid());

-- Shop owner can manage staff for their shop
DROP POLICY IF EXISTS shop_staff_select_owner ON shop_staff;
CREATE POLICY shop_staff_select_owner ON shop_staff
  FOR SELECT USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS shop_staff_insert_owner ON shop_staff;
CREATE POLICY shop_staff_insert_owner ON shop_staff
  FOR INSERT WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS shop_staff_update_owner ON shop_staff;
CREATE POLICY shop_staff_update_owner ON shop_staff
  FOR UPDATE USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS shop_staff_delete_owner ON shop_staff;
CREATE POLICY shop_staff_delete_owner ON shop_staff
  FOR DELETE USING (public.is_shop_owner(shop_id));

-- Admin can manage all shop staff
DROP POLICY IF EXISTS shop_staff_select_admin ON shop_staff;
CREATE POLICY shop_staff_select_admin ON shop_staff
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS shop_staff_insert_admin ON shop_staff;
CREATE POLICY shop_staff_insert_admin ON shop_staff
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS shop_staff_update_admin ON shop_staff;
CREATE POLICY shop_staff_update_admin ON shop_staff
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');
