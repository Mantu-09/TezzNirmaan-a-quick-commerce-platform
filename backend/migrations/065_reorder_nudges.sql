-- 065_reorder_nudges.sql - P14-8
-- Config table for automated reorder reminder rules.
-- Cron job reads this to send WhatsApp/push nudges.

CREATE TABLE IF NOT EXISTS reorder_nudge_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT,                              -- NULL = all categories
  days_after_order INTEGER NOT NULL DEFAULT 7,       -- Send nudge N days after purchase
  message_template TEXT,                             -- WhatsApp template name
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed default rules
INSERT INTO reorder_nudge_rules (category, days_after_order, message_template) VALUES
  ('construction', 14, 'reorder_construction'),
  ('paints',        7, 'reorder_paints'),
  (NULL,           21, 'reorder_generic')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE reorder_nudge_rules IS 'Reorder nudge configuration - P14-8';
