// ────────────────────────────────────────────────────────────
// responseTime.js — P7-6: Response Time Monitoring
//
// Middleware that:
//   1. Logs every request with method, path, status, duration
//   2. Emits a WARN for any request > 500ms (the p95 target)
//   3. Normalises path params (UUIDs, numeric IDs) so log aggregators
//      can group by endpoint pattern rather than individual IDs.
//
// Wire in app.js BEFORE routes:
//   import { responseTimeLogger } from './middleware/responseTime.js';
//   app.use(responseTimeLogger);
// ────────────────────────────────────────────────────────────
import logger from '../utils/logger.js';

// UUID pattern (e.g. /orders/3f2504e0-4f89-11d3-9a0c-0305e82c3301)
const UUID_RE   = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Pure numeric segments (e.g. /items/42)
const NUMERIC_RE = /\/\d+/g;

/**
 * Normalise a URL path for log aggregation.
 * Examples:
 *   /shop/orders/3f2504e0-... → /shop/orders/:id
 *   /products/42/reviews     → /products/:id/reviews
 *   /auth/otp/request        → /auth/otp/request  (unchanged)
 */
function normalisePath(path) {
  return path
    .replace(UUID_RE, ':id')
    .replace(NUMERIC_RE, '/:id');
}

// P95 threshold in milliseconds — warn on anything over this
const SLOW_THRESHOLD_MS = 500;

export function responseTimeLogger(req, res, next) {
  const start = process.hrtime.bigint(); // nanosecond precision

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const rounded    = Math.round(durationMs);
    const path       = normalisePath(req.path);
    const method     = req.method;
    const status     = res.statusCode;

    if (durationMs > SLOW_THRESHOLD_MS) {
      // SLOW path — always log at warn level with full detail
      logger.warn({
        type:       'SLOW_REQUEST',
        method,
        path,
        status,
        durationMs: rounded,
        requestId:  req.requestId,
      }, `SLOW ${method} ${path} ${status} ${rounded}ms`);
    } else {
      // Normal path — structured info log (easily parseable by log aggregators)
      logger.info({
        type:       'REQUEST',
        method,
        path,
        status,
        durationMs: rounded,
        requestId:  req.requestId,
      }, `${method} ${path} ${status} ${rounded}ms`);
    }
  });

  next();
}
