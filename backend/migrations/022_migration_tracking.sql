-- ────────────────────────────────────────────────────────────
-- Migration 022: schema_migrations tracking table
-- Provides idempotent, auditable migration tracking.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  filename   TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now(),
  checksum   TEXT  -- MD5 of file content, for tamper detection
);

-- Backfill all already-applied migrations so the runner
-- does not try to re-apply them on first run.
INSERT INTO schema_migrations (version, filename, applied_at) VALUES
  ('001', '001_extensions_and_enums.sql',           now()),
  ('002', '002_profiles.sql',                        now()),
  ('003', '003_shops_and_categories.sql',            now()),
  ('004', '004_products_and_inventory.sql',          now()),
  ('005', '005_addresses_and_cart.sql',              now()),
  ('006', '006_orders.sql',                          now()),
  ('007', '007_riders_and_delivery.sql',             now()),
  ('008', '008_payments.sql',                        now()),
  ('009', '009_status_history_and_staff.sql',        now()),
  ('010', '010_rls_policies.sql',                    now()),
  ('011', '011_geo_rpc_functions.sql',               now()),
  ('012', '012_notifications.sql',                   now()),
  ('013', '013_seed_data.sql',                       now()),
  ('014', '014_stock_increment_and_location_rpcs.sql', now()),
  ('015', '015_order_items_inventory_id.sql',        now()),
  ('018', '018_ratings.sql',                         now()),
  ('019', '019_schema_patches.sql',                  now()),
  ('020', '020_delivery_slots.sql',                  now()),
  ('021', '021_full_text_search.sql',                now()),
  ('022', '022_migration_tracking.sql',              now())
ON CONFLICT (version) DO NOTHING;
