-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 080: Master Catalog Enrichment (Phase 12 — Session B, Task 2)
--
-- Adds structured metadata fields to the master products table:
--   • specifications (jsonb)  — key-value technical specs
--   • dimensions (jsonb)      — physical dimensions for logistics
--
-- NOTE: `variants` column is intentionally NOT added here — deferred to V2.
-- There is no current use case in construction materials (bag sizes are
-- separate products in the seed data, not variants of a single product).
--
-- Run after: 079_order_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Specifications ─────────────────────────────────────────────────────────
-- Structured key-value specs displayed on product detail page.
-- e.g. {"Grade": "OPC 53", "Bag Weight": "50 kg", "BIS Standard": "IS 12269"}

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS specifications jsonb NOT NULL DEFAULT '{}';

-- ── 2. Dimensions ─────────────────────────────────────────────────────────────
-- Physical dimensions for delivery logistics and UI display.
-- e.g. {"length_cm": 100, "width_cm": 50, "height_cm": 20, "volume_cft": 3.5}
-- Nullable — not all products have meaningful dimensions.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS dimensions jsonb;

-- ── 3. Index for specifications-based filtering (future) ──────────────────────
-- GIN index enables jsonb containment queries like:
--   WHERE specifications @> '{"Grade": "OPC 53"}'

CREATE INDEX IF NOT EXISTS idx_products_specifications
  ON products USING gin(specifications);

-- ─────────────────────────────────────────────────────────────────────────────
-- End of Migration 080
-- ─────────────────────────────────────────────────────────────────────────────
