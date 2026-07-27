-- ────────────────────────────────────────────────────────────
-- Migration 037: P5-0 Patches
--
-- NOTE: The order_baskets FK fix (P5-0C) was removed from this migration
-- because migration 033 (multi_shop_cart) was never run on this DB,
-- meaning the order_baskets table does not exist yet.
-- The FK will be correct (→ profiles) when 033 is eventually applied,
-- as it will be rewritten at that time.
--
-- This migration only applies:
--   • RLS on cashback_rules (P5-0D Bug 4)
-- ────────────────────────────────────────────────────────────

-- ── RLS on cashback_rules (P5-0D Bug 4) ───────────────────────
-- Migration 032 created cashback_rules without RLS — the anon key
-- could read all rules (including inactive) and write new ones.
-- Fix: enable RLS with two policies.

ALTER TABLE cashback_rules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running (idempotent)
DROP POLICY IF EXISTS "Anyone can read active cashback rules" ON cashback_rules;
DROP POLICY IF EXISTS "Admins can manage cashback rules"     ON cashback_rules;

-- Public read: only is_active = true rows (app displays cashback info to customers)
CREATE POLICY "Anyone can read active cashback rules"
  ON cashback_rules
  FOR SELECT
  USING (is_active = true);

-- Admin write: platform_admin can INSERT, UPDATE, DELETE
CREATE POLICY "Admins can manage cashback rules"
  ON cashback_rules
  FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'platform_admin'
    OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'platform_admin'
    OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- ── Verify ────────────────────────────────────────────────────
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'cashback_rules';
-- Expected: relrowsecurity = true

