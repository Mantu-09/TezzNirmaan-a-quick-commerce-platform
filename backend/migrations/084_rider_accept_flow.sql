-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 084: Rider Accept Flow (Session I)
--
-- The delivery_assignments table (created in 007) had no explicit 'status'
-- column — it tracked state via is_active + timestamp columns (accepted_at,
-- picked_up_at, etc.). This migration adds the status column properly.
--
-- Previous flow: auto-assign inserts status='accepted' immediately.
-- New flow:      auto-assign inserts status='offered' → push notification
--                → rider taps Accept (60s window) → status='accepted'
--                → if declined or timeout → try next rider.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the status column (defaults existing rows to 'accepted' — correct
--    historical state since all old assignments were auto-accepted)
ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';

-- 2. Add check constraint (drop first to make re-runnable)
ALTER TABLE delivery_assignments
  DROP CONSTRAINT IF EXISTS delivery_assignments_status_check;

ALTER TABLE delivery_assignments
  ADD CONSTRAINT delivery_assignments_status_check
  CHECK (status IN ('offered', 'accepted', 'picked_up', 'delivered', 'cancelled', 'declined'));

-- 3. Index for fast lookup of expired offers by the reassignment cron
CREATE INDEX IF NOT EXISTS idx_assignments_offered
  ON delivery_assignments(status, assigned_at)
  WHERE status = 'offered';

-- 4. Timing columns for the offer flow
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS offered_at       timestamptz;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS declined_at      timestamptz;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- End of Migration 084
-- ─────────────────────────────────────────────────────────────────────────────
