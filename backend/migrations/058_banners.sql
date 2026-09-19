-- ─────────────────────────────────────────────────────────────
-- 058_banners.sql — P12-3
--
-- Hero banners table for the storefront homepage carousel.
-- Admins manage banners per city with scheduling and ordering.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS banners (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  subtitle      TEXT,
  image_url     TEXT        NOT NULL,
  link_url      TEXT,                          -- Where the banner click goes
  city_id       UUID        REFERENCES cities(id) ON DELETE CASCADE,  -- NULL = all cities
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  starts_at     TIMESTAMPTZ,                   -- NULL = always active
  ends_at       TIMESTAMPTZ,                   -- NULL = never expires
  cta_text      TEXT        DEFAULT 'Shop Now',
  bg_color      TEXT        DEFAULT '#f97316', -- Fallback when no image
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_banners_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_banners_updated_at ON banners;
CREATE TRIGGER trg_banners_updated_at
  BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION update_banners_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

-- Anyone can read active, scheduled banners (storefront)
DROP POLICY IF EXISTS "Anyone reads active banners" ON banners;
CREATE POLICY "Anyone reads active banners"
  ON banners FOR SELECT
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
  );

-- Only platform_admin can manage
DROP POLICY IF EXISTS "Admins manage banners" ON banners;
CREATE POLICY "Admins manage banners"
  ON banners FOR ALL
  USING  ((auth.jwt() ->> 'role') = 'platform_admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'platform_admin');

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_banners_city_active   ON banners (city_id, is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_banners_schedule      ON banners (starts_at, ends_at) WHERE is_active = true;

-- ── Seed: 3 starter banners ───────────────────────────────────
-- These use gradient-only (no image_url) so they work immediately.
INSERT INTO banners (title, subtitle, link_url, display_order, bg_color, cta_text, city_id)
VALUES
  ('⚡ 60-Min Delivery',     'Get cement, paint & hardware at your site fast',   '/category/construction', 1, '#f97316', 'Order Now',   NULL),
  ('🎨 Paint Your Dream',    'Top brands: Asian Paints, Berger, Nerolac',         '/category/paints',       2, '#6d28d9', 'Shop Paints', NULL),
  ('🔧 Plumbing Emergency?', 'Pipes, fittings, taps — delivered in 60 minutes',  '/category/plumbing',     3, '#0369a1', 'Order Now',   NULL)
ON CONFLICT DO NOTHING;
