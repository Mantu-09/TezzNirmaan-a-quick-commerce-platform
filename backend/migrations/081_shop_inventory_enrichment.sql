-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 081: Shop Inventory Enrichment (Phase 12 — Session B, Task 3)
--
-- Adds shop-specific override fields to shop_inventory:
--   • shop_sku         — shop's internal SKU (for their own tracking)
--   • shop_images      — optional image overrides (text array)
--   • shop_description — optional description override
--   • updated_by       — audit trail: who last modified this row
--
-- NOTE: Existing RLS policies (inventory_insert_owner, inventory_update_owner,
-- inventory_delete_owner) scope to is_shop_owner(shop_id). Column-level
-- additions do not require policy changes — the row-level check remains the
-- same. Task 4 of Session B will verify this with a test write.
--
-- Run after: 080_master_catalog_enrichment.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. shop_sku ───────────────────────────────────────────────────────────────
-- Shop's internal SKU for their own inventory management / barcode scanning.
-- Not used in customer-facing queries — purely for shop-owner workflows.

ALTER TABLE shop_inventory
  ADD COLUMN IF NOT EXISTS shop_sku text;

-- ── 2. shop_images ────────────────────────────────────────────────────────────
-- Shop-specific images that override the master product images on storefront.
-- Falls back to products.image_urls / products.primary_image_url if empty.

ALTER TABLE shop_inventory
  ADD COLUMN IF NOT EXISTS shop_images text[] DEFAULT '{}';

-- ── 3. shop_description ───────────────────────────────────────────────────────
-- Shop-specific description that overrides products.description on storefront.
-- Falls back to products.description if null.

ALTER TABLE shop_inventory
  ADD COLUMN IF NOT EXISTS shop_description text;

-- ── 4. updated_by ─────────────────────────────────────────────────────────────
-- UUID of the user who last modified this row (shop owner, staff, or admin).
-- Used for audit trail and accountability.

ALTER TABLE shop_inventory
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES profiles(id);

-- ── 5. Index for SKU-based lookups ────────────────────────────────────────────
-- Shop owners searching inventory by their internal SKU.

CREATE INDEX IF NOT EXISTS idx_shop_inventory_sku
  ON shop_inventory(shop_id, shop_sku)
  WHERE shop_sku IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- NAMING NOTE: shop_inventory vs inventory
--
-- The canonical table name is `shop_inventory` (created in migration 004).
-- There appears to be an `inventory` VIEW in the live database (created
-- outside migration files, likely via Supabase dashboard) that remaps columns:
--   stock_quantity → stock_count
--   is_listed      → is_active
-- and adds discounted_price.
--
-- 4 code files reference `from('inventory')`:
--   - routes/customer.routes.js:305
--   - routes/public.routes.js:289
--   - services/catalog.service.js:186, 403
--
-- These references are INTENTIONALLY left as-is because they depend on the
-- VIEW's column remapping. The MV city_catalog (053) also references the VIEW.
--
-- All NEW code should use `shop_inventory` directly with its original column
-- names (stock_quantity, is_in_stock, is_listed).
--
-- The `inventory` VIEW is DEPRECATED and should not be referenced in new code.
-- It will be consolidated (columns standardized) in a future migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- End of Migration 081
