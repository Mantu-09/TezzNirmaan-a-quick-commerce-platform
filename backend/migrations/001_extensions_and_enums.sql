-- ============================================================================
-- Migration 001: Extensions & Enums
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Enables required Postgres extensions and creates all domain enums.
-- Safe to re-run: uses IF NOT EXISTS and DO blocks for idempotency.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- PostGIS: spatial queries for shop radius matching and rider tracking
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgcrypto: provides gen_random_uuid() for UUID primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Each enum is wrapped in a DO block that checks pg_type before creation,
-- making this migration safe to re-run without errors.

-- delivery_tier: first-class domain concept that drives order splitting
-- A product is intrinsically 'quick' (small, scooter-deliverable) or
-- 'scheduled' (heavy/bulk, needs tempo/loader).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_tier') THEN
    CREATE TYPE delivery_tier AS ENUM ('quick', 'scheduled');
  END IF;
END $$;

-- order_status: sub-order lifecycle states (see architecture doc §3 for state machine)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'pending',            -- just placed, awaiting shop acknowledgement
      'confirmed',          -- shop accepted
      'rejected',           -- shop rejected (terminal)
      'preparing',          -- shop is packing/preparing
      'ready_for_pickup',   -- packed, awaiting rider pickup
      'rider_assigned',     -- rider matched to this sub-order
      'out_for_delivery',   -- rider has picked up, in transit
      'delivered',          -- successfully delivered (terminal)
      'cancelled',          -- cancelled by customer or system (terminal)
      'return_requested',   -- post-delivery return initiated
      'returned'            -- return completed (terminal)
    );
  END IF;
END $$;

-- payment_status: tracks payment lifecycle through Razorpay
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'pending',
      'authorized',         -- Razorpay has authorized but not captured
      'captured',           -- money collected
      'failed',
      'refund_initiated',
      'refunded'
    );
  END IF;
END $$;

-- payment_method: supported payment methods
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('upi', 'cod', 'card', 'netbanking', 'wallet');
  END IF;
END $$;

-- rider_status: rider availability state
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_status') THEN
    CREATE TYPE rider_status AS ENUM ('available', 'on_delivery', 'offline');
  END IF;
END $$;

-- vehicle_type: determines which delivery tier a rider can serve
-- bike/scooter → quick tier; tempo/loader/pickup_truck → scheduled tier
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type') THEN
    CREATE TYPE vehicle_type AS ENUM ('bike', 'scooter', 'tempo', 'loader', 'pickup_truck');
  END IF;
END $$;

-- user_role: maps to Supabase custom claims in app_metadata
-- Single role per user in V1; may expand to roles array in V2.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('customer', 'shop_owner', 'shop_staff', 'rider', 'platform_admin');
  END IF;
END $$;

-- unit_of_measure: construction materials are sold in diverse units
-- Includes India-specific units like 'brass' (100 cft) and 'cft' (cubic feet)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_of_measure') THEN
    CREATE TYPE unit_of_measure AS ENUM (
      'piece', 'kg', 'bag', 'litre', 'meter', 'sq_ft', 'cu_ft',
      'bundle', 'box', 'pair', 'set', 'ton', 'brass', 'cft'
    );
  END IF;
END $$;
