-- ============================================================================
-- Migration 008: Payments
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Razorpay integration with support for UPI, COD, cards, netbanking, wallets.
-- Tracks full payment lifecycle including refunds and COD collection.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid           NOT NULL REFERENCES orders(id),

  -- Razorpay integration fields
  -- These are populated for online payments (UPI, card, netbanking, wallet)
  -- and remain NULL for COD orders.
  razorpay_order_id     text,          -- Razorpay's order ID
  razorpay_payment_id   text,          -- Razorpay's payment ID (after capture)
  razorpay_signature    text,          -- HMAC signature for server-side verification

  method                payment_method NOT NULL,
  status                payment_status NOT NULL DEFAULT 'pending',
  amount                bigint         NOT NULL,   -- in PAISE (e.g. ₹380 = 38000)
  currency              text           NOT NULL DEFAULT 'INR',

  -- COD-specific fields
  cod_collected_by      uuid           REFERENCES riders(id),  -- which rider collected the cash
  cod_collected_at      timestamptz,

  -- Failure and refund tracking
  failure_reason        text,
  refund_amount         bigint,         -- in PAISE

  -- Flexible metadata: stores Razorpay webhook payload, retry info, etc.
  metadata              jsonb          DEFAULT '{}',

  created_at            timestamptz    NOT NULL DEFAULT now(),
  updated_at            timestamptz    NOT NULL DEFAULT now()
);

-- Look up payments by parent order
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- Partial index: look up by Razorpay order ID (only for online payments)
CREATE INDEX IF NOT EXISTS idx_payments_razorpay
  ON payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
