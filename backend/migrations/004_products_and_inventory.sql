-- ============================================================================
-- Migration 004: Products & Shop Inventory
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Master product catalog (platform-wide) + per-shop inventory with pricing.
-- Includes full-text search via tsvector + trigger, and a generated column
-- for is_in_stock to avoid write-time bugs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Products: master catalog — a product exists once, shops add it to inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  description   text,
  category_id   uuid        NOT NULL REFERENCES categories(id),
  brand_id      uuid        REFERENCES brands(id),

  -- The critical tier assignment: determines order splitting at checkout.
  -- A bag of cement is always 'scheduled'; a door handle is always 'quick'.
  delivery_tier delivery_tier NOT NULL,

  -- Physical attributes (needed for delivery logistics)
  unit          unit_of_measure NOT NULL DEFAULT 'piece',
  weight_kg     numeric(10,3),             -- per-unit weight
  is_bulk       boolean     NOT NULL DEFAULT false,  -- true for cement, sand, bricks, etc.

  -- Tax/compliance
  hsn_code      text,                      -- GST Harmonized System of Nomenclature code
  gst_percent   numeric(4,2) NOT NULL DEFAULT 18.0,

  -- Images: JSONB array of URLs, e.g. ["url1", "url2"]
  images        jsonb       NOT NULL DEFAULT '[]',

  -- Full-text search: populated by trigger (see below)
  search_vector tsvector,

  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- GIN index for full-text search queries
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(search_vector);

-- Category and tier indexes for filtered browse queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_tier ON products(delivery_tier);

-- ---------------------------------------------------------------------------
-- Trigger: auto-populate search_vector from name + description
-- Uses 'simple' config to avoid language-specific stemming issues with
-- Hindi/English mixed product names common in Indian hardware stores.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to ensure idempotency
DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF name, description ON products
  FOR EACH ROW
  EXECUTE FUNCTION products_search_vector_update();

-- ---------------------------------------------------------------------------
-- Shop Inventory: per-shop pricing and stock for master catalog products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_inventory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Shop-specific pricing in PAISE (1 INR = 100 paise).
  -- Stored as bigint to avoid all floating-point errors — never store rupees.
  -- e.g. ₹38.50 → 3850 paise. Razorpay also expects paise.
  price               bigint        NOT NULL CHECK (price > 0),      -- selling price per unit
  mrp                 bigint        CHECK (mrp >= price),             -- MRP (must be >= price)
  cost_price          bigint        CHECK (cost_price > 0),           -- shop's cost (private)

  -- Stock: numeric(12,3) because construction materials use fractional units
  -- (2.5 kg nails, 15.5 metres wire, 3.75 cft sand)
  stock_quantity       numeric(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold  numeric(12,3) NOT NULL DEFAULT 5,

  -- Generated column: automatically true when stock > 0
  -- This avoids bugs where code forgets to update a manual flag.
  is_in_stock          boolean NOT NULL GENERATED ALWAYS AS (stock_quantity > 0) STORED,

  -- Shop can hide a product from their listing without deleting the record
  is_listed            boolean NOT NULL DEFAULT true,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- A product can appear in a shop's inventory only once
  CONSTRAINT uq_shop_product UNIQUE (shop_id, product_id)
);

-- Query patterns: "show me this shop's inventory", "find shops stocking product X"
CREATE INDEX IF NOT EXISTS idx_inventory_shop ON shop_inventory(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON shop_inventory(product_id);

-- Partial index: efficiently find listed, in-stock items for customer-facing queries
CREATE INDEX IF NOT EXISTS idx_inventory_in_stock
  ON shop_inventory(shop_id)
  WHERE is_in_stock = true AND is_listed = true;
