-- ============================================================================
-- Migration 003: Shops & Categories
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Categories (self-referential tree), Brands, and Shops with PostGIS location.
-- Two delivery radii per shop enable tier-specific geo-matching.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Categories: self-referential hierarchy (e.g. Building Materials > Cement > OPC)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  parent_id     uuid        REFERENCES categories(id),  -- NULL = top-level category
  icon_url      text,
  sort_order    int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Brands: optional product association (e.g. UltraTech, Asian Paints)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  logo_url      text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Shops: physical stores with geospatial location and delivery configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                   uuid        NOT NULL REFERENCES profiles(id),
  name                       text        NOT NULL,
  slug                       text        NOT NULL UNIQUE,  -- URL-friendly identifier
  description                text,
  phone                      text        NOT NULL,
  email                      text,

  -- Address fields (flat — a shop has exactly one address)
  address_line1              text        NOT NULL,
  address_line2              text,
  city                       text        NOT NULL DEFAULT 'Patna',
  state                      text        NOT NULL DEFAULT 'Bihar',
  pincode                    text        NOT NULL,

  -- Geo: PostGIS point for the shop's physical location
  -- SRID 4326 = WGS 84 (GPS coordinates). geography type gives metre-accurate
  -- ST_DWithin distance calculations without projection headaches.
  location                   geography(Point, 4326) NOT NULL,

  -- Delivery configuration: two radii per shop
  -- quick_delivery_radius_km: smaller radius for scooter/bike (quick tier items)
  -- scheduled_delivery_radius_km: larger radius for tempo/loader (scheduled tier items)
  quick_delivery_radius_km   numeric(5,2) NOT NULL DEFAULT 5.0,
  scheduled_delivery_radius_km numeric(5,2) NOT NULL DEFAULT 15.0,

  is_accepting_orders        boolean     NOT NULL DEFAULT true,

  -- Operating hours as JSONB for flexibility:
  -- {"mon": {"open": "08:00", "close": "20:00"}, "tue": {...}, ...}
  operating_hours            jsonb       NOT NULL DEFAULT '{}',

  -- Metadata
  is_active                  boolean     NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Spatial index: makes "which shops are within X km?" queries efficient
-- GIST index on geography column is required for ST_DWithin performance.
CREATE INDEX IF NOT EXISTS idx_shops_location ON shops USING GIST(location);

-- Owner lookup (for dashboard queries)
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
