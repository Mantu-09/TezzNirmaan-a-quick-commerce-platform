// ────────────────────────────────────────────────────────────
// Structured Logger
//
// Outputs JSON lines to stdout for easy parsing by log aggregators
// (Render logs, Datadog, etc.). In development, pretty-prints.
//
// Usage:
//   import logger from '../utils/logger.js';
//   logger.info('Order placed', { orderId, userId, totalPaise });
//   logger.error('Payment failed', { error: err.message, orderId });
// ────────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV !== 'production';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const COLORS = {
  error: '\x1b[31m', // red
  warn:  '\x1b[33m', // yellow
  info:  '\x1b[36m', // cyan
  debug: '\x1b[90m', // grey
  reset: '\x1b[0m',
};

function log(level, message, meta = {}) {
  const entry = {
    ts:      new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  if (IS_DEV) {
    const color = COLORS[level] || '';
    const prefix = `${color}[${level.toUpperCase()}]${COLORS.reset}`;
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : '';
    // eslint-disable-next-line no-console
    console.log(`${entry.ts} ${prefix} ${message}${metaStr}`);
  } else {
    // Production: one JSON line per log entry — easy to grep, ship to Datadog etc.
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : console.log)(JSON.stringify(entry));
  }
}

const logger = {
  error: (message, meta) => log('error', message, meta),
  warn:  (message, meta) => log('warn',  message, meta),
  info:  (message, meta) => log('info',  message, meta),
  debug: (message, meta) => log('debug', message, meta),

  /**
   * Log an incoming request (used in Morgan token middleware or manually).
   */
  request: (req, statusCode, durationMs) => log('info', 'HTTP request', {
    method:   req.method,
    url:      req.originalUrl,
    status:   statusCode,
    ms:       durationMs,
    ip:       req.ip,
    userId:   req.user?.id,
    userRole: req.user?.role,
  }),
};

export default logger;
