-- 072_ai_chat_history.sql - P17-3
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  reply      TEXT NOT NULL,
  source     TEXT DEFAULT 'gemini',   -- 'gemini' | 'mock' | 'fallback'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_admin ON ai_chat_history (admin_id, created_at DESC);
COMMENT ON TABLE ai_chat_history IS 'Admin AI assistant conversation history - P17-3';