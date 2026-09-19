-- 073_broadcast_campaigns.sql - P17-7
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  template_name   TEXT NOT NULL,
  segment         TEXT NOT NULL,
  estimated_reach INTEGER DEFAULT 0,
  sent_count      INTEGER DEFAULT 0,
  failed_count    INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  params          JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_broadcast_admin ON broadcast_campaigns (admin_id, created_at DESC);
COMMENT ON TABLE broadcast_campaigns IS 'WhatsApp marketing broadcast log - P17-7';