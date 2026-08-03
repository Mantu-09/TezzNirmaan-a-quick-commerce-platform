// ────────────────────────────────────────────────────────────
// Internal Routes — P1-E + P9-3
//
// These routes are for internal monitoring only.
// They MUST NOT be accessible from the public internet.
// Secured by:
//   1. requireInternalKey middleware (checks X-Internal-Key header)
//   2. Should be behind a firewall/VPN in production
//
// GET  /internal/jobs/stats           → queue statistics (router path: /jobs/stats)
// GET  /internal/health               → extended health (router path: /health)
// GET  /internal/analytics/stream     → P9-3: SSE stream (router path: /analytics/stream)
// GET  /internal/analytics/snapshot   → P9-3: instant metrics (router path: /analytics/snapshot)
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { getQueueStats, isQueueEnabled, QUEUES } from '../lib/jobQueue.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getPlatformAnalytics } from '../services/platform-analytics.service.js';
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
router.get('/jobs/stats', requireInternalKey, async (_req, res) => {
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
router.get('/health', requireInternalKey, async (_req, res) => {
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

// ── P9-3: GET /internal/analytics/snapshot ────────────────────
// One-shot platform analytics for the founder dashboard initial load.
// Returns current-day metrics: GMV, orders, active riders.
// Used by the dashboard on mount before the SSE stream connects.
router.get('/analytics/snapshot', requireInternalKey, async (_req, res) => {
  try {
    const analytics = await getPlatformAnalytics('today');

    // Return a condensed summary — the full analytics are fetched
    // via the dashboard's own /admin/analytics/platform endpoint
    res.json({
      success: true,
      data: {
        gmv_paise:      analytics.gmv.total_paise,
        order_count:    analytics.orders.total,
        active_riders:  analytics.riders.total_active,
        active_shops:   analytics.shops.total_active,
        cancel_rate:    analytics.orders.cancel_rate,
        timestamp:      new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('Internal analytics snapshot error', { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── P9-3: GET /internal/analytics/stream ─────────────────────
// Server-Sent Events (SSE) stream for the founder real-time dashboard.
//
// Design:
//   • Emits 'platform_summary' event every 30 seconds with live metrics
//   • Emits 'new_order' event whenever a new sub_order is created
//     (via Supabase Realtime postgres_changes subscription)
//   • Sends an initial snapshot immediately on connection
//   • Cleans up subscriptions + interval on client disconnect
//
// Authentication: X-Internal-Key header (same as all /internal routes)
//
// Client usage (dashboard):
//   const es = new EventSource('/internal/analytics/stream', {
//     headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_KEY }
//   });
//   es.addEventListener('platform_summary', (e) => { ... });
//   es.addEventListener('new_order', (e) => { ... });
//
// NOTE: EventSource does not support custom headers natively in browsers.
// The dashboard passes the key as a query parameter which is stripped server-side,
// or uses a server-side proxy route in Next.js to forward the internal key.
router.get('/analytics/stream', requireInternalKey, async (req, res) => {
  // ── Set SSE headers ────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering for SSE

  // Flush headers immediately so the client knows the connection is open
  res.flushHeaders();

  const clientIp = req.ip;
  logger.info('P9-3 SSE stream connected', { ip: clientIp });

  // ── Helper: send an SSE event ──────────────────────────────
  function sendEvent(eventName, data) {
    if (res.writableEnded) return;
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      // Client disconnected mid-write — handled by 'close' event
    }
  }

  // ── Send initial snapshot immediately ─────────────────────
  try {
    const analytics = await getPlatformAnalytics('today');
    sendEvent('platform_summary', {
      gmv_paise:     analytics.gmv.total_paise,
      order_count:   analytics.orders.total,
      active_riders: analytics.riders.total_active,
      active_shops:  analytics.shops.total_active,
      cancel_rate:   analytics.orders.cancel_rate,
      timestamp:     new Date().toISOString(),
    });
  } catch (err) {
    logger.error('P9-3 SSE initial snapshot failed', { error: err.message });
  }

  // ── Poll platform metrics every 30 seconds ─────────────────
  const metricsInterval = setInterval(async () => {
    if (res.writableEnded) {
      clearInterval(metricsInterval);
      return;
    }
    try {
      const analytics = await getPlatformAnalytics('today');
      sendEvent('platform_summary', {
        gmv_paise:     analytics.gmv.total_paise,
        order_count:   analytics.orders.total,
        active_riders: analytics.riders.total_active,
        active_shops:  analytics.shops.total_active,
        cancel_rate:   analytics.orders.cancel_rate,
        timestamp:     new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('P9-3 SSE metrics poll failed', { error: err.message });
    }
  }, 30_000); // 30 seconds

  // ── Subscribe to new orders via Supabase Realtime ──────────
  // Emits 'new_order' event whenever a sub_order is inserted.
  // This gives the founder the live order ticker.
  let realtimeChannel = null;
  try {
    realtimeChannel = supabaseAdmin
      .channel('internal-new-orders')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'sub_orders',
        },
        async (payload) => {
          if (res.writableEnded) return;
          try {
            const subOrder = payload.new;

            // Fetch minimal order context for the ticker display
            const { data: orderData } = await supabaseAdmin
              .from('orders')
              .select('order_number, shops(name, city)')
              .eq('id', subOrder.order_id)
              .single();

            sendEvent('new_order', {
              sub_order_id:  subOrder.id,
              order_number:  orderData?.order_number || subOrder.order_id.slice(0, 8).toUpperCase(),
              shop_name:     orderData?.shops?.name  || 'Unknown Shop',
              city:          orderData?.shops?.city  || 'Patna',
              total_paise:   subOrder.total_amount   || 0,
              payment_method: subOrder.payment_method || 'unknown',
              timestamp:     new Date().toISOString(),
            });
          } catch (err) {
            logger.warn('P9-3 SSE new_order enrichment failed', { error: err.message });
            // Still emit a minimal event so the ticker doesn't miss orders
            sendEvent('new_order', {
              sub_order_id: payload.new.id,
              total_paise:  payload.new.total_amount || 0,
              timestamp:    new Date().toISOString(),
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('P9-3 SSE Realtime channel subscribed');
        } else if (status === 'CHANNEL_ERROR') {
          logger.warn('P9-3 SSE Realtime channel error — new_order events will not fire');
        }
      });
  } catch (err) {
    logger.warn('P9-3 SSE Realtime subscription failed', { error: err.message });
    // Stream continues without real-time order events — polling still works
  }

  // ── Send keepalive comments every 15 seconds ───────────────
  // SSE connections time out through proxies/load balancers without activity.
  // Comments (lines starting with ':') are ignored by EventSource clients.
  const keepaliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepaliveInterval);
      return;
    }
    try {
      res.write(': keepalive\n\n');
    } catch (_) { /* client disconnected */ }
  }, 15_000);

  // ── Clean up on client disconnect ─────────────────────────
  req.on('close', () => {
    logger.info('P9-3 SSE stream disconnected', { ip: clientIp });
    clearInterval(metricsInterval);
    clearInterval(keepaliveInterval);
    if (realtimeChannel) {
      supabaseAdmin.removeChannel(realtimeChannel).catch(() => {});
    }
    if (!res.writableEnded) res.end();
  });
});

export default router;

