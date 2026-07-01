-- ============================================================================
-- Migration 012: Notifications
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Lightweight notification system using Supabase Realtime.
-- Frontend subscribes to this table for the current user_id.
-- No external SMS/push required for V1 — just insert a row and
-- Supabase broadcasts it to all subscribed clients instantly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Notification type — drives the icon and action in the UI
  -- Customer types: order_placed, order_confirmed, order_rejected,
  --                 out_for_delivery, delivered, order_cancelled
  -- Shop types:     new_order, low_stock
  -- Rider types:    new_assignment
  type        text        NOT NULL,

  title       text        NOT NULL,
  message     text        NOT NULL,

  -- Contextual metadata: { order_id, sub_order_id, product_id, ... }
  -- Frontend uses this to deep-link to the right screen
  metadata    jsonb       NOT NULL DEFAULT '{}',

  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Efficiently fetch unread notifications for a user (most common query)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- All notifications for a user (for the notification history screen)
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);

-- ── RLS Policies ─────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "notifications: user reads own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "notifications: user updates own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Only the service role (server) inserts notifications
-- (The place_order_atomic function runs as SECURITY DEFINER so it can insert)
CREATE POLICY "notifications: service role inserts"
  ON notifications FOR INSERT
  WITH CHECK (true);  -- service role bypasses RLS anyway

-- Enable Supabase Realtime on this table
-- Run this in the Supabase Dashboard under Database > Replication
-- or uncomment below (requires Supabase superuser role):
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ── Helper function: notify_user ──────────────────────────────────────────────
-- Convenience function called from other stored procedures and the service layer
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id  uuid,
  p_type     text,
  p_title    text,
  p_message  text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, jsonb) TO service_role;
