-- ────────────────────────────────────────────────────────────
-- Migration 049: Push Notification Campaigns (P8-3)
--
-- Fully idempotent — safe to re-run.
-- Uses DO $$ blocks for ENUM creation (CREATE TYPE has no IF NOT EXISTS).
--
-- Creates:
--   campaign_status     ENUM  — draft|scheduled|sending|sent|cancelled
--   campaign_audience   ENUM  — 10 audience segments
--   push_campaigns      TABLE — one row per campaign
--   campaign_recipients TABLE — one row per (campaign × user)
-- ────────────────────────────────────────────────────────────

-- ── 1. ENUMs (guard against duplicate-type error on re-run) ──
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM (
    'draft',
    'scheduled',
    'sending',
    'sent',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'campaign_status already exists, skipping.';
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_audience AS ENUM (
    'all_customers',
    'active_last_7_days',
    'inactive_30_plus_days',
    'pass_subscribers',
    'city_patna',
    'city_muzaffarpur',
    'city_bhagalpur',
    'city_gaya',
    'no_orders_yet',
    'contractors_only'
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'campaign_audience already exists, skipping.';
END $$;

-- ── 2. push_campaigns table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS push_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 65),
  body             TEXT NOT NULL CHECK (char_length(body)  BETWEEN 1 AND 110),
  image_url        TEXT,                         -- Optional rich notification image
  deep_link        TEXT,                         -- e.g. tezznirmaan://orders
  data             JSONB NOT NULL DEFAULT '{}',  -- Extra payload for the app

  -- Targeting
  audience         campaign_audience NOT NULL,
  city_id          UUID REFERENCES cities(id),   -- NULL = all cities

  -- Lifecycle
  status           campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at     TIMESTAMPTZ,                  -- NULL = send immediately on publish
  sent_at          TIMESTAMPTZ,

  -- Stats (updated after send completes)
  total_recipients INTEGER NOT NULL DEFAULT 0,
  delivered_count  INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  opened_count     INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_by       UUID NOT NULL REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. campaign_recipients fan-out table ─────────────────────
-- One row per recipient per campaign. Inserted in bulk when send begins.
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  expo_push_token  TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'delivered', 'failed', 'opened')),
  sent_at          TIMESTAMPTZ,
  error_message    TEXT
);

-- ── 4. Indexes ────────────────────────────────────────────────
-- campaign → recipients lookup (send + analytics)
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
  ON campaign_recipients(campaign_id, status);

-- user → campaigns lookup (for suppression / opt-out)
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_user
  ON campaign_recipients(user_id);

-- scheduled campaign poller
CREATE INDEX IF NOT EXISTS idx_push_campaigns_scheduled
  ON push_campaigns(status, scheduled_at)
  WHERE status = 'scheduled';

-- ── 5. updated_at trigger (guard against duplicate) ──────────
DO $$ BEGIN
  CREATE TRIGGER push_campaigns_updated_at
    BEFORE UPDATE ON push_campaigns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'push_campaigns_updated_at trigger already exists, skipping.';
END $$;

-- ── 6. Row-Level Security ─────────────────────────────────────
ALTER TABLE push_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Platform admins manage campaigns (service role bypasses RLS entirely)
DO $$ BEGIN
  CREATE POLICY "platform_admins_manage_campaigns"
    ON push_campaigns
    FOR ALL
    USING ( (auth.jwt() ->> 'role') = 'platform_admin' );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'platform_admins_manage_campaigns policy already exists, skipping.';
END $$;

DO $$ BEGIN
  CREATE POLICY "platform_admins_manage_recipients"
    ON campaign_recipients
    FOR ALL
    USING ( (auth.jwt() ->> 'role') = 'platform_admin' );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'platform_admins_manage_recipients policy already exists, skipping.';
END $$;
