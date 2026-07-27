-- ============================================================================
-- Migration 017: Full-Text Search Indexes (B3)
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Schema: products.images is JSONB; products.brand_id → brands, category_id → categories
-- Generated columns cannot reference other tables, so we use a trigger approach
-- for brand_name and category_name denormalised text fields.
-- search_vector is maintained by a BEFORE INSERT/UPDATE trigger.
-- ============================================================================

-- ── Step 1: Ensure pg_trgm extension ────────────────────────
-- Already enabled in migration 001 but safe to repeat
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Step 2: Add denormalized text columns ───────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_name    text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_name text;

-- ── Step 3: Backfill brand_name and category_name ───────────
UPDATE products
SET
  brand_name    = b.name,
  category_name = c.name
FROM
  brands     b,
  categories c
WHERE
  products.brand_id    = b.id AND
  products.category_id = c.id;

-- Partial update for products with no brand
UPDATE products
SET category_name = c.name
FROM categories c
WHERE products.category_id = c.id AND products.brand_id IS NULL;

-- Partial update for products with no category (edge case)
UPDATE products
SET brand_name = b.name
FROM brands b
WHERE products.brand_id = b.id AND products.category_id IS NULL;

-- ── Step 4: Trigger to keep brand_name / category_name in sync ──
CREATE OR REPLACE FUNCTION fn_sync_product_names()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO NEW.category_name FROM categories WHERE id = NEW.category_id;
  ELSE
    NEW.category_name := NULL;
  END IF;

  IF NEW.brand_id IS NOT NULL THEN
    SELECT name INTO NEW.brand_name FROM brands WHERE id = NEW.brand_id;
  ELSE
    NEW.brand_name := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_names ON products;
CREATE TRIGGER trg_sync_product_names
  BEFORE INSERT OR UPDATE OF category_id, brand_id
  ON products
  FOR EACH ROW
EXECUTE FUNCTION fn_sync_product_names();

-- ── Step 5: Add search_vector column ────────────────────────
-- Weighted: name=A (most important), brand=B, category=C, description=D
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ── Step 6: Trigger to maintain search_vector ───────────────
CREATE OR REPLACE FUNCTION fn_update_product_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.brand_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.category_name, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_product_search_vector ON products;
CREATE TRIGGER trg_update_product_search_vector
  BEFORE INSERT OR UPDATE
  ON products
  FOR EACH ROW
EXECUTE FUNCTION fn_update_product_search_vector();

-- ── Step 7: Backfill search_vector for all existing products ──
UPDATE products
SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(brand_name, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(category_name, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'D');

-- ── Step 8: GIN index for fast full-text search ─────────────
CREATE INDEX IF NOT EXISTS idx_products_fts    ON products USING GIN(search_vector);

-- ── Step 9: Trigram indexes for partial/prefix match ─────────
-- Useful for autocomplete ("paints" → "Asian Paints")
CREATE INDEX IF NOT EXISTS idx_products_name_trgm  ON products USING GIN(name        gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING GIN(brand_name  gin_trgm_ops);

-- ── Step 10: shop_inventory performance indexes ──────────────
-- Price-range filter, in-stock filter, product lookup
CREATE INDEX IF NOT EXISTS idx_inventory_price       ON shop_inventory(price)       WHERE is_listed = true;
CREATE INDEX IF NOT EXISTS idx_inventory_instock     ON shop_inventory(shop_id, is_in_stock) WHERE is_listed = true;
CREATE INDEX IF NOT EXISTS idx_inventory_product_id  ON shop_inventory(product_id);

-- ── Step 11: RPC for suggestions (optional fast path) ───────
-- A simple function for the suggestions endpoint if PostgREST textSearch is too slow.
CREATE OR REPLACE FUNCTION search_product_suggestions(
  p_query   text,
  p_limit   int DEFAULT 5
)
RETURNS TABLE(id uuid, name text, unit text, brand_name text, delivery_tier text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, unit, brand_name, delivery_tier
  FROM   products
  WHERE  is_active = true
    AND  name ILIKE p_query || '%'
  UNION
  SELECT id, name, unit, brand_name, delivery_tier
  FROM   products
  WHERE  is_active = true
    AND  name ILIKE '%' || p_query || '%'
    AND  name NOT ILIKE p_query || '%'
  LIMIT  p_limit;
$$;
