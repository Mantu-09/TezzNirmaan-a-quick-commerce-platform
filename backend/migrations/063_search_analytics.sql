-- 063_search_analytics.sql — P13-8
-- Search query logging: every search by city, result count, and click-through.
-- Used by admin dashboard to identify popular searches and zero-result gaps.

CREATE TABLE IF NOT EXISTS search_queries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query              TEXT NOT NULL,
  city_id            UUID REFERENCES cities(id) ON DELETE SET NULL,
  result_count       INTEGER DEFAULT 0,
  clicked_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  user_id            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id         TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_query   ON search_queries (query, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_zero    ON search_queries (query) WHERE result_count = 0;
CREATE INDEX IF NOT EXISTS idx_search_queries_city    ON search_queries (city_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries (created_at DESC);

COMMENT ON TABLE search_queries IS 'Search analytics — P13-8. Zero-result rows show stocking gaps.';
