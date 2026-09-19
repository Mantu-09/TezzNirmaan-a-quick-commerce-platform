-- 064_notification_reads.sql - P14-5
-- Tracks which notifications each user has read.
-- Enables unread badge count in StorefrontHeader.

CREATE TABLE IF NOT EXISTS notification_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_reads_user ON notification_reads (user_id, read_at DESC);

-- RLS
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "user_own_reads" ON notification_reads
  FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE notification_reads IS 'Tracks read notifications per user - P14-5';
