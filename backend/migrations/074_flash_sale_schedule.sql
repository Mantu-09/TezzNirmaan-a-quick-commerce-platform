-- 074_flash_sale_schedule.sql - P18-4
-- Add schedule columns to flash_sales so the auto-scheduler can manage them.
ALTER TABLE flash_sales ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE flash_sales ADD COLUMN IF NOT EXISTS scheduled_end   TIMESTAMPTZ;
ALTER TABLE flash_sales ADD COLUMN IF NOT EXISTS auto_managed    BOOLEAN DEFAULT false;

COMMENT ON COLUMN flash_sales.scheduled_start IS 'Auto-scheduler activates sale at this time';
COMMENT ON COLUMN flash_sales.scheduled_end   IS 'Auto-scheduler deactivates sale at this time';
COMMENT ON COLUMN flash_sales.auto_managed    IS 'If true, start/end handled automatically by cron';