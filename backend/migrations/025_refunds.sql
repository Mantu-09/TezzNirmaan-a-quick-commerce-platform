-- ────────────────────────────────────────────────────────────
-- Migration 025: Refunds table + cancel window column
--
-- Tracks every refund initiated via Razorpay.
-- Updated by the refund.processed webhook when Razorpay confirms.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refunds (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  razorpay_payment_id TEXT,                         -- source payment being refunded
  razorpay_refund_id  TEXT          UNIQUE,          -- set once Razorpay confirms creation
  amount_paise        BIGINT        NOT NULL CHECK (amount_paise > 0),
  status              TEXT          NOT NULL DEFAULT 'initiated'
                                    CHECK (status IN ('initiated', 'processed', 'failed')),
  reason              TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id      ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_razorpay_refund ON refunds(razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Customers can view refunds for their own orders
CREATE POLICY "Users see own refunds"
  ON refunds FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id = auth.uid()
    )
  );

-- Only service_role can insert / update refunds (backend only)
CREATE POLICY "Service role manages refunds"
  ON refunds FOR ALL
  USING    (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
