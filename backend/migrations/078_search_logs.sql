-- 078_search_logs.sql — P21 M1
-- Records search queries so admin can see what customers search for,
-- identify zero-result searches, and drive inventory decisions.

CREATE TABLE IF NOT EXISTS search_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query        TEXT        NOT NULL,
  results_count INTEGER     NOT NULL DEFAULT 0,
  city_id      UUID        REFERENCES cities(id) ON DELETE SET NULL,
  profile_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL, -- null = guest
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_query      ON search_logs(query);
CREATE INDEX IF NOT EXISTS idx_search_logs_city       ON search_logs(city_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at DESC);

COMMENT ON TABLE search_logs IS 'Stores every search query with result count — used by admin search-analytics page to identify inventory gaps.';
