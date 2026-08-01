-- ────────────────────────────────────────────────────────────
-- Migration 050: Product Reminders — P8-6
--
-- Adds reminder_days to products table.
-- NULL = no reminder (e.g. tiles: one-time purchase).
-- Non-null = show "Running low?" banner after N days.
--
-- Retention heuristics by category:
--   Construction materials (cement): 14 days
--   Paints:                          30 days
--   Hardware/fittings:               60 days
--   Tiles:                           NULL (never)
-- ────────────────────────────────────────────────────────────

-- Add the column (safe to re-run: IF NOT EXISTS)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reminder_days INTEGER;

-- Apply heuristics to existing products by category name
-- (case-insensitive partial match for robustness)
UPDATE products
SET reminder_days = 14
WHERE LOWER(category_id::text) IN (
  SELECT id::text FROM categories WHERE LOWER(name) LIKE '%construction%'
);

-- If categories table uses name column directly on products
UPDATE products p
SET reminder_days = 14
FROM categories c
WHERE p.category_id = c.id
  AND LOWER(c.name) LIKE '%construction%'
  AND p.reminder_days IS NULL;

UPDATE products p
SET reminder_days = 30
FROM categories c
WHERE p.category_id = c.id
  AND LOWER(c.name) LIKE '%paint%'
  AND p.reminder_days IS NULL;

UPDATE products p
SET reminder_days = 60
FROM categories c
WHERE p.category_id = c.id
  AND (LOWER(c.name) LIKE '%hardware%' OR LOWER(c.name) LIKE '%fitting%')
  AND p.reminder_days IS NULL;

-- Tiles: explicitly NULL (never remind) — already NULL by default
-- but add a comment for clarity:
UPDATE products p
SET reminder_days = NULL
FROM categories c
WHERE p.category_id = c.id
  AND LOWER(c.name) LIKE '%tile%';

-- Add comment to column
COMMENT ON COLUMN products.reminder_days IS
  'Days after last order before showing a "Running low?" reminder. NULL = no reminder (one-time purchase).';
