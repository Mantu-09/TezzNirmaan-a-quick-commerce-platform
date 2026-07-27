// ────────────────────────────────────────────────────────────
// Internal Routes — P1-E
//
// These routes are for internal monitoring only.
// They MUST NOT be accessible from the public internet.
// Secured by:
//   1. requireInternalKey middleware (checks X-Internal-Key header)
//   2. Should be behind a firewall/VPN in production
//
// GET /internal/jobs/stats  → queue statistics
// GET /internal/health      → extended health including queue status
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { getQueueStats, isQueueEnabled, QUEUES } from '../lib/jobQueue.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

const router = Router();

// ── Internal auth middleware ──────────────────────────────────
// Require X-Internal-Key header matching INTERNAL_API_KEY env var.
// If INTERNAL_API_KEY is not set, the endpoint is disabled entirely.
function requireInternalKey(req, res, next) {
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!internalKey) {
    return res.status(503).json({
      success: false,
      message: 'Internal endpoints disabled (INTERNAL_API_KEY not configured)',
    });
  }

  const provided = req.headers['x-internal-key'];
  if (!provided || provided !== internalKey) {
    logger.warn('Internal endpoint: unauthorized access attempt', {
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: invalid or missing X-Internal-Key header',
    });
  }

  next();
}

// ── GET /internal/jobs/stats ──────────────────────────────────
router.get('/internal/jobs/stats', requireInternalKey, async (_req, res) => {
  try {
    const stats = await getQueueStats();

    // Add queue names reference for context
    res.json({
      success:   true,
      enabled:   isQueueEnabled(),
      queues:    Object.values(QUEUES),
      stats,
      timestamp: new Date().toISOString(),
      note: isQueueEnabled()
        ? 'Queue is running. Use counts.failed to detect stuck jobs.'
        : 'Queue is disabled (DATABASE_URL not set). Notifications use fire-and-forget delivery.',
    });
  } catch (err) {
    logger.error('Internal job stats error', { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /internal/health ──────────────────────────────────────
// Extended health including queue status + recent job failure check
router.get('/internal/health', requireInternalKey, async (_req, res) => {
  const checks = {
    queue:    isQueueEnabled() ? 'ok' : 'disabled',
    database: 'unknown',
  };

  try {
    const { error } = await supabaseAdmin
      .from('shops')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    checks.database = error ? 'degraded' : 'ok';
  } catch {
    checks.database = 'error';
  }

  const healthy = checks.database === 'ok';

  res.status(healthy ? 200 : 503).json({
    success:     healthy,
    service:     'TezzNirmaan API',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
    checks,
    queueConfig: {
      enabled:     isQueueEnabled(),
      queues:      Object.values(QUEUES),
      retryPolicy: { retryLimit: 3, retryDelay: '30s', retryBackoff: true },
    },
  });
});

export default router;
