-- ────────────────────────────────────────────────────────────
-- Migration 047: DLQ RPC — P7-7 Admin Jobs Dashboard
--
-- Queries pgboss.job for failed jobs.
-- pg-boss stores jobs in pgboss.job (active/pending/failed)
-- and moves them to pgboss.archive when complete/failed after archival.
--
-- We query pgboss.job (state='failed') which holds jobs that
-- have exhausted all retries and are awaiting archival.
-- ────────────────────────────────────────────────────────────

-- Grant the service role read access to pgboss schema
-- (Required for SECURITY DEFINER functions to access it)
GRANT USAGE  ON SCHEMA pgboss TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA pgboss TO service_role;

-- ── get_failed_jobs: paginated list of failed jobs ────────────
CREATE OR REPLACE FUNCTION get_failed_jobs(
  p_queue  TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  error_message TEXT,
  failed_at     TIMESTAMPTZ,
  retry_count   INTEGER,
  data          JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id::UUID,
    j.name,
    COALESCE(
      j.output->>'message',
      j.output->>'error',
      j.output::TEXT
    )                      AS error_message,
    j.completedon          AS failed_at,
    j.retrycount           AS retry_count,
    j.data
  FROM pgboss.job j
  WHERE
    j.state = 'failed'
    AND (p_queue IS NULL OR j.name = p_queue)
  ORDER BY j.completedon DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── count_failed_jobs: total count per queue (for badge) ─────
CREATE OR REPLACE FUNCTION count_failed_jobs()
RETURNS TABLE (
  queue_name TEXT,
  failed_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.name        AS queue_name,
    COUNT(*)      AS failed_count
  FROM pgboss.job j
  WHERE j.state = 'failed'
  GROUP BY j.name
  ORDER BY failed_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── retry_failed_job: move job from failed → created ─────────
-- Sets state back to 'created' so pg-boss will pick it up again.
CREATE OR REPLACE FUNCTION retry_failed_job(p_job_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE pgboss.job
     SET state      = 'created',
         startedon  = NULL,
         completedon = NULL,
         retrycount  = 0,
         output      = NULL
   WHERE id    = p_job_id
     AND state = 'failed';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── retry_all_failed_jobs: retry all failed jobs for a queue ─
CREATE OR REPLACE FUNCTION retry_all_failed_jobs(p_queue TEXT)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE pgboss.job
     SET state       = 'created',
         startedon   = NULL,
         completedon = NULL,
         retrycount  = 0,
         output      = NULL
   WHERE name  = p_queue
     AND state = 'failed';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── discard_failed_job: delete a specific failed job ─────────
CREATE OR REPLACE FUNCTION discard_failed_job(p_job_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM pgboss.job
   WHERE id    = p_job_id
     AND state = 'failed';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
