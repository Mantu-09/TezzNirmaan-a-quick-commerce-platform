-- ============================================================================
-- Migration 006: Orders (Parent + Sub-Orders + Order Items)
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Three-level order structure:
--   orders (parent)  → what the customer sees (one order number, one payment)
--   sub_orders       → operational unit per delivery tier (state machine lives here)
--   order_items      → individual line items with snapshot pricing
--
-- A mixed-tier cart (paint cans + cement bags) produces:
--   1 order → 2 sub_orders (quick + scheduled) → N order_items split across them
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Orders: parent order — the customer's single "order"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable order number: "TN-240615-0042"
  order_number           text        NOT NULL UNIQUE,

  customer_id            uuid        NOT NULL REFERENCES profiles(id),
  shop_id                uuid        NOT NULL REFERENCES shops(id),
  delivery_address_id    uuid        NOT NULL REFERENCES addresses(id),

  -- Snapshot of delivery address at time of order.
  -- The customer may edit/delete the address later; this preserves
  -- where we actually sent the delivery.
  delivery_address_snapshot jsonb     NOT NULL,

  -- Aggregated totals in PAISE (bigint). Sum across all sub_orders.
  subtotal               bigint        NOT NULL,
  delivery_fee           bigint        NOT NULL DEFAULT 0,
  tax_amount             bigint        NOT NULL DEFAULT 0,
  discount_amount        bigint        NOT NULL DEFAULT 0,
  total_amount           bigint        NOT NULL,

  -- Customer-facing notes ("Please deliver to back gate", "Call before coming")
  notes                  text,

  -- Timestamps
  placed_at              timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_placed ON orders(placed_at DESC);

-- ---------------------------------------------------------------------------
-- Sub-Orders: one per delivery tier within a parent order
-- This is the entity that goes through the order state machine.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sub_orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Human-readable: "TN-240615-0042-Q" (quick) or "TN-240615-0042-S" (scheduled)
  sub_order_number       text           NOT NULL UNIQUE,

  delivery_tier          delivery_tier  NOT NULL,
  status                 order_status   NOT NULL DEFAULT 'pending',

  -- Tier-specific totals in PAISE (bigint)
  subtotal               bigint         NOT NULL,
  delivery_fee           bigint         NOT NULL DEFAULT 0,
  tax_amount             bigint         NOT NULL DEFAULT 0,
  discount_amount        bigint         NOT NULL DEFAULT 0,
  total_amount           bigint         NOT NULL,

  -- Delivery timing
  estimated_delivery_at  timestamptz,          -- estimated delivery time
  actual_delivery_at     timestamptz,          -- when actually delivered

  -- Scheduled tier slot selection
  delivery_slot_start    timestamptz,          -- slot start (e.g. 9:00 AM tomorrow)
  delivery_slot_end      timestamptz,          -- slot end   (e.g. 12:00 PM tomorrow)

  -- Denormalized status timestamps for quick dashboard reads
  -- (also recorded in sub_order_status_history for audit)
  confirmed_at           timestamptz,
  preparing_at           timestamptz,
  ready_at               timestamptz,
  picked_up_at           timestamptz,
  delivered_at           timestamptz,
  cancelled_at           timestamptz,
  cancellation_reason    text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- A parent order can have at most one sub-order per delivery tier
  CONSTRAINT uq_order_tier UNIQUE (order_id, delivery_tier)
);

CREATE INDEX IF NOT EXISTS idx_suborders_order ON sub_orders(order_id);

-- Partial index: efficiently find active (non-terminal) sub-orders for dashboards
CREATE INDEX IF NOT EXISTS idx_suborders_status
  ON sub_orders(status)
  WHERE status NOT IN ('delivered', 'cancelled', 'rejected', 'returned');

CREATE INDEX IF NOT EXISTS idx_suborders_tier ON sub_orders(delivery_tier);

-- ---------------------------------------------------------------------------
-- Order Items: individual line items with snapshotted pricing
-- ---------------------------------------------------------------------------
-- Snapshots (product_name, unit_price, tax_percent) are intentional:
-- if a product's price changes after an order, the order record must
-- reflect what the customer actually paid.
CREATE TABLE IF NOT EXISTS order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id      uuid        NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
  product_id        uuid        NOT NULL REFERENCES products(id),

  -- Snapshot fields (frozen at order time)
  product_name      text        NOT NULL,
  product_image_url text,
  unit              unit_of_measure NOT NULL,
  delivery_tier     delivery_tier   NOT NULL,  -- denormalized from product for query convenience

  quantity          numeric(12,3) NOT NULL,
  unit_price        bigint        NOT NULL,     -- price per unit in PAISE at time of order
  tax_percent       numeric(4,2)  NOT NULL,
  tax_amount        bigint        NOT NULL,     -- in PAISE
  total_price       bigint        NOT NULL,     -- (quantity × unit_price) + tax_amount, in PAISE

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_suborder ON order_items(sub_order_id);
