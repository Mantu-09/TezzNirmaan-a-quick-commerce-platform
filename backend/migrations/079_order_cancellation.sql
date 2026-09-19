-- 079_order_cancellation.sql — P21 M6
-- Allows customers to cancel their own orders while still in 'pending' status.
-- After shop confirms (status → 'confirmed'), customer can no longer cancel.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_by_customer_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.cancelled_by_customer_at IS 'Set when customer cancels their own order (only allowed when status = pending).';

-- RLS policy: customer can cancel their own pending order
-- (The actual status update is done via authenticated API endpoint with status check)
CREATE INDEX IF NOT EXISTS idx_orders_customer_cancel
  ON orders(customer_id, status)
  WHERE status = 'pending';
