-- ============================================================================
-- Migration 009: Status History & Shop Staff
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Audit trail for sub-order state transitions + shop staff with granular
-- permissions for multi-employee shop management.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sub-Order Status History: audit trail for every state transition
-- ---------------------------------------------------------------------------
-- Every time a sub-order's status changes, a row is inserted here.
-- This provides a complete timeline: who changed what, when, and why.
-- The actual state-machine validation happens in the application layer
-- (Express middleware), not in Postgres — see architecture doc §3.3.
CREATE TABLE IF NOT EXISTS sub_order_status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id  uuid         NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
  from_status   order_status,            -- NULL for the initial 'pending' entry
  to_status     order_status NOT NULL,
  changed_by    uuid         REFERENCES profiles(id),  -- who triggered the change
  notes         text,                    -- optional context ("customer requested cancellation")
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_suborder
  ON sub_order_status_history(sub_order_id);

-- ---------------------------------------------------------------------------
-- Shop Staff: shop-to-profile association with granular permissions
-- ---------------------------------------------------------------------------
-- Allows shop owners to add staff members who can manage orders and/or
-- inventory. Separate from the rider role — a staff member works in the
-- shop, not on deliveries.
CREATE TABLE IF NOT EXISTS shop_staff (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  profile_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  can_manage_inventory  boolean NOT NULL DEFAULT true,
  can_manage_orders     boolean NOT NULL DEFAULT true,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- A profile can be staff at a given shop only once
  CONSTRAINT uq_shop_staff UNIQUE (shop_id, profile_id)
);
