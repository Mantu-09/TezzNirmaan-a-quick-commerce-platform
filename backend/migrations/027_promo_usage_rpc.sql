-- ────────────────────────────────────────────────────────────
-- Migration 027: Promo usage counter helper RPC
--
-- Provides an atomic increment_promo_usage() function so the
-- backend can safely bump usage_count even under concurrent
-- order placements (avoids race conditions).
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_promo_usage(p_promo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE promo_codes
  SET
    usage_count = usage_count + 1,
    updated_at  = now()
  WHERE id = p_promo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_promo_usage(UUID) TO service_role;
