-- ────────────────────────────────────────────────────────────
-- Migration 024: Expo Push Token column on profiles
--
-- Stores each user's Expo push token so the backend can send
-- FCM/APNs push notifications via the Expo Push API.
-- The column is nullable — not all users grant permission.
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Partial index — only index rows that actually have a token.
-- Keeps the index tiny and queries fast.
CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON profiles(expo_push_token)
  WHERE expo_push_token IS NOT NULL;

-- Remove token when it becomes invalid (DeviceNotRegistered).
-- We create a helper function callable from the backend service role.
CREATE OR REPLACE FUNCTION clear_push_token(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET expo_push_token = NULL
  WHERE expo_push_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_push_token(TEXT) TO service_role;
