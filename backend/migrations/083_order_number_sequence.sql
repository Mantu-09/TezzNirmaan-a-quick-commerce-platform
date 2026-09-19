-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 083: Collision-safe Order Number Sequence (Phase 13 — Session H)
--
-- Replaces the in-memory counter in utils/orderNumber.js with a Postgres
-- SEQUENCE — safe across multiple server instances, restarts, and under
-- concurrent load.
--
-- Format produced: TN-YYMMDD-NNNNNN  e.g. TN-260906-001042
-- The sequence is GLOBAL (not daily-reset) — uniqueness guaranteed.
-- The unique constraint on orders.order_number remains as a final guard.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS order_number_seq
  START WITH 1000
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- Helper function: returns TN-YYMMDD-NNNNNN, callable via supabaseAdmin.rpc()
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  seq_val   BIGINT;
  date_part TEXT;
BEGIN
  seq_val   := nextval('order_number_seq');
  date_part := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD');
  RETURN 'TN-' || date_part || '-' || lpad(seq_val::TEXT, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION generate_order_number() TO service_role;
