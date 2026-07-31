// ────────────────────────────────────────────────────────────
// Jobs Controller — P7-7: Admin DLQ Dashboard
//
// All endpoints require platform_admin role.
// Uses Supabase RPCs defined in migration 047_dlq_rpc.sql
// to query pgboss.job directly — no direct pg-boss dependency
// so these endpoints work even if the queue is temporarily down.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError }      from '../utils/errors.js';
import logger            from '../utils/logger.js';

// ── GET /admin/jobs/failed ────────────────────────────────────
// Returns paginated list of failed jobs.
// Query params: ?queue=send-notification&page=1&limit=20
export async function getFailedJobs(req, res, next) {
  try {
    const page  = Math.max(1,  parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const queue = req.query.queue || null;

    const { data: jobs, error } = await supabaseAdmin.rpc('get_failed_jobs', {
      p_queue:  queue,
      p_limit:  limit,
      p_offset: (page - 1) * limit,
    });

    if (error) {
      logger.error('getFailedJobs RPC error', { error: error.message });
      throw new AppError('Failed to query job queue: ' + error.message, 502);
    }

    // Also get per-queue counts for the sidebar badge
    const { data: counts, error: countErr } = await supabaseAdmin
      .rpc('count_failed_jobs');

    const totalFailed = (counts || []).reduce((s, r) => s + Number(r.failed_count), 0);

    return res.json({
      success: true,
      data: {
        jobs:        jobs   || [],
        queueCounts: counts || [],
        totalFailed,
        page,
        limit,
        hasMore: (jobs || []).length === limit,
      },
    });
  } catch (err) { next(err); }
}

// ── POST /admin/jobs/:jobId/retry ─────────────────────────────
// Retries a single failed job by resetting its state to 'created'.
export async function retryJob(req, res, next) {
  try {
    const { jobId } = req.params;

    const { data: success, error } = await supabaseAdmin.rpc('retry_failed_job', {
      p_job_id: jobId,
    });

    if (error) throw new AppError('Retry failed: ' + error.message, 502);
    if (!success) throw new AppError('Job not found or not in failed state', 404);

    logger.info('Admin: retried failed job', { jobId, adminId: req.user?.id });
    return res.json({ success: true, message: 'Job queued for retry.' });
  } catch (err) { next(err); }
}

// ── POST /admin/jobs/retry-all ────────────────────────────────
// Retries all failed jobs for a given queue name.
// Body: { queue: 'send-notification' }
export async function retryAllJobs(req, res, next) {
  try {
    const { queue } = req.body;
    if (!queue) throw new AppError('queue name is required', 400);

    const { data: retried, error } = await supabaseAdmin.rpc('retry_all_failed_jobs', {
      p_queue: queue,
    });

    if (error) throw new AppError('Retry-all failed: ' + error.message, 502);

    logger.info('Admin: retried all failed jobs for queue', {
      queue, retriedCount: retried, adminId: req.user?.id,
    });
    return res.json({ success: true, retriedCount: retried });
  } catch (err) { next(err); }
}

// ── DELETE /admin/jobs/:jobId ─────────────────────────────────
// Discards (permanently deletes) a specific failed job.
export async function discardJob(req, res, next) {
  try {
    const { jobId } = req.params;

    const { data: success, error } = await supabaseAdmin.rpc('discard_failed_job', {
      p_job_id: jobId,
    });

    if (error) throw new AppError('Discard failed: ' + error.message, 502);
    if (!success) throw new AppError('Job not found or not in failed state', 404);

    logger.info('Admin: discarded failed job', { jobId, adminId: req.user?.id });
    return res.json({ success: true, message: 'Job discarded.' });
  } catch (err) { next(err); }
}
