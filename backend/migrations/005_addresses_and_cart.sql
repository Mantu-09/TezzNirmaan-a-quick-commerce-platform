-- ============================================================================
-- Migration 005: Addresses & Cart
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Customer addresses with optional PostGIS location (pin-drop or geocoded)
-- and server-side cart scoped to (user, shop, product).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Addresses: customer delivery locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label         text        NOT NULL DEFAULT 'Home',  -- "Home", "Site", "Office"
  full_name     text        NOT NULL,
  phone         text        NOT NULL,
  address_line1 text        NOT NULL,
  address_line2 text,

  -- Landmark is critical in Patna for last-mile navigation
  -- ("Near Kankarbagh Golumbar", "Opposite Boring Road Chauraha")
  landmark      text,

  city          text        NOT NULL DEFAULT 'Patna',
  state         text        NOT NULL DEFAULT 'Bihar',
  pincode       text        NOT NULL,

  -- Geo: precise location from customer pin-drop or geocoding
  -- Nullable because a customer may save an address before dropping a pin
  location      geography(Point, 4326),

  is_default    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- ---------------------------------------------------------------------------
-- Cart Items: server-side cart for cross-device sync
-- ---------------------------------------------------------------------------
-- Scoped to (user_id, shop_id, product_id). In V1 with one shop, shop_id
-- is always the same. When multi-shop launches, this naturally supports
-- per-shop carts without schema changes.
CREATE TABLE IF NOT EXISTS cart_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shop_id       uuid        NOT NULL REFERENCES shops(id),
  product_id    uuid        NOT NULL REFERENCES products(id),
  quantity      numeric(12,3) NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- A user can have only one cart entry per product per shop
  CONSTRAINT uq_cart_item UNIQUE (user_id, shop_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
