-- ────────────────────────────────────────────────────────────
-- Migration 023: pg_cron for materialized view refresh
--
-- IMPORTANT: pg_cron is available on Supabase Pro plan.
-- If running on the free tier, skip this migration and use
-- Render's cron job feature instead (see README for setup).
--
-- The migration is wrapped in a DO block so it degrades
-- gracefully if pg_cron is not installed.
-- ────────────────────────────────────────────────────────────

-- Enable pg_cron extension (requires Supabase Pro; no-op if already enabled)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_cron extension not available (free tier?). Skipping cron schedule.';
END;
$$;

-- Schedule automatic refresh of shop_rating_summary every 15 minutes.
-- CONCURRENTLY means reads are not blocked during refresh.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing schedule if re-running this migration
    PERFORM cron.unschedule('refresh-shop-ratings')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'refresh-shop-ratings'
      );

    PERFORM cron.schedule(
      'refresh-shop-ratings',
      '*/15 * * * *',
      $$REFRESH MATERIALIZED VIEW CONCURRENTLY shop_rating_summary;$$
    );
    RAISE NOTICE 'pg_cron scheduled: refresh-shop-ratings every 15 minutes';
  END IF;
END;
$$;

-- Manual refresh function callable from the backend at any time.
-- Uses SECURITY DEFINER so it can be called by the anon/service role
-- without needing superuser privileges on the materialized view.
CREATE OR REPLACE FUNCTION refresh_shop_ratings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY shop_rating_summary;
END;
$$;

-- Grant execute to service_role so the backend can call it via RPC
GRANT EXECUTE ON FUNCTION refresh_shop_ratings() TO service_role;
