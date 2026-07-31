-- ────────────────────────────────────────────────────────────
-- Migration 045: CDN Image Columns — P7-5
--
-- Adds image URL columns for CDN delivery.
-- Does NOT drop existing columns — legacy Supabase Storage URLs
-- still work through getCDNUrl() which handles both formats.
--
-- NOTE: The existing `images` column is JSONB (not TEXT[]),
-- so we use jsonb_array_length() and jsonb_array_elements_text()
-- instead of array_length().
--
-- Pattern for stored values:
--   Legacy:  https://xxx.supabase.co/storage/v1/object/public/...
--   New:     products/uuid.jpg  (key only — CDN_URL prefix applied at read time)
--   OR:      https://images.tezznirmaan.in/products/uuid.jpg  (full CDN URL)
-- ────────────────────────────────────────────────────────────

-- Products: CDN image URL array + single primary image
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_urls        TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_image_url TEXT;

-- Copy existing images (JSONB) → image_urls (TEXT[]) for any existing rows
-- jsonb_array_elements_text() handles the JSONB → TEXT[] conversion
UPDATE products
   SET image_urls = ARRAY(
         SELECT jsonb_array_elements_text(images)
       )
 WHERE images IS NOT NULL
   AND jsonb_array_length(images) > 0
   AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- Set primary_image_url from first element of image_urls
UPDATE products
   SET primary_image_url = image_urls[1]
 WHERE primary_image_url IS NULL
   AND array_length(image_urls, 1) > 0;

-- Shops: logo and banner images
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS logo_url   TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Return requests: already has photo_urls TEXT[] (from 041_returns.sql)
-- No change needed — return photos uploaded directly to R2.

-- Index for shops that have logos (used by shop listing queries)
CREATE INDEX IF NOT EXISTS idx_shops_logo_url ON shops (id) WHERE logo_url IS NOT NULL;
