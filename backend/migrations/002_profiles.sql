-- ============================================================================
-- Migration 002: Profiles
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- User profiles extending Supabase auth.users with app-specific data.
-- Phone (E.164) is the primary identifier for OTP-based login.
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text        NOT NULL,
  phone         text        NOT NULL,    -- E.164 format, primary identifier for login
  email         text,                    -- optional for customers
  role          user_role   NOT NULL DEFAULT 'customer',
  avatar_url    text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Phone must be unique across all profiles (used for OTP login resolution)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);

-- Helpful comment: A single user holds one role in V1. If the founder needs
-- to act as both shop_owner and platform_admin, they use two accounts.
-- V2 can migrate to a roles text[] array if needed.
