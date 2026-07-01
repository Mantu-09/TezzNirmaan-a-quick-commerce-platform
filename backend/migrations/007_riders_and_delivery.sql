-- ============================================================================
-- Migration 007: Riders & Delivery Assignments
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Riders with vehicle types and live location, shop assignments (many-to-many),
-- and delivery assignments with full lifecycle tracking + delivery proof.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Riders: delivery partners with vehicle info and live location
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS riders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid         NOT NULL REFERENCES profiles(id) UNIQUE,
  vehicle_type      vehicle_type NOT NULL,
  vehicle_number    text,
  license_number    text,

  -- Last known location: updated periodically by rider app
  -- Used for rider proximity matching (V2: automated assignment)
  current_location  geography(Point, 4326),

  status            rider_status NOT NULL DEFAULT 'offline',
  is_active         boolean      NOT NULL DEFAULT true,

  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riders_profile ON riders(profile_id);

-- Partial index: find available riders quickly (excludes inactive accounts)
CREATE INDEX IF NOT EXISTS idx_riders_status
  ON riders(status)
  WHERE is_active = true;

-- Spatial index: for proximity-based rider matching queries
CREATE INDEX IF NOT EXISTS idx_riders_location ON riders USING GIST(current_location);

-- ---------------------------------------------------------------------------
-- Rider ↔ Shop Assignments: many-to-many
-- In V1 a rider likely serves just 1 shop, but the model supports multiple.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_shop_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id   uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- A rider can be assigned to a shop only once
  CONSTRAINT uq_rider_shop UNIQUE (rider_id, shop_id)
);

-- ---------------------------------------------------------------------------
-- Delivery Assignments: tracks the full lifecycle of a delivery
-- ---------------------------------------------------------------------------
-- A sub-order may have multiple assignment records over its lifetime
-- (if a rider cancels and another is assigned). The is_active flag
-- indicates the current assignment; historical records are preserved
-- for audit.
CREATE TABLE IF NOT EXISTS delivery_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id       uuid         NOT NULL REFERENCES sub_orders(id),
  rider_id           uuid         NOT NULL REFERENCES riders(id),

  -- Assignment metadata
  assigned_by        uuid         REFERENCES profiles(id),  -- who assigned (shop owner / system)
  assigned_at        timestamptz  NOT NULL DEFAULT now(),
  accepted_at        timestamptz,                            -- rider accepted
  picked_up_at       timestamptz,                            -- rider picked up from shop
  delivered_at       timestamptz,                            -- rider delivered to customer
  cancelled_at       timestamptz,

  -- Delivery proof (for dispute resolution)
  delivery_proof_url      text,       -- photo of delivery at customer location
  delivery_otp            text,       -- OTP for delivery confirmation
  customer_signature_url  text,       -- for high-value scheduled deliveries

  -- Geo tracking: start and end points
  -- V1: just pickup/delivery points; V2: continuous route tracking via WebSocket
  pickup_location    geography(Point, 4326),
  delivery_location  geography(Point, 4326),

  -- false if reassigned to another rider (preserves audit history)
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_suborder ON delivery_assignments(sub_order_id);
CREATE INDEX IF NOT EXISTS idx_assignments_rider ON delivery_assignments(rider_id);

-- Partial index: efficiently find a rider's current active assignment
CREATE INDEX IF NOT EXISTS idx_assignments_active
  ON delivery_assignments(rider_id)
  WHERE is_active = true;
