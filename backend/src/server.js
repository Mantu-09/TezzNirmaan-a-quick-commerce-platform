// ────────────────────────────────────────────────────────────
// Server Entry Point — P6-1: Socket.IO + Redis adapter
//
// P8-1: validateEnvironment() (config/environment.js) now runs
// first — it prints a full feature-availability banner so the
// first lines of any Render log immediately show staging vs
// production and which optional services are configured.
// ────────────────────────────────────────────────────────────
import 'dotenv/config';

// P13-4: Sentry error monitoring (before all other imports to catch startup errors)
if (process.env.SENTRY_DSN) {
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

import { validateEnvironment }  from './config/environment.js'; // P8-1
import { validateEnv }          from './utils/validateEnv.js';  // kept for compat
import { initQueue, stopQueue } from './lib/jobQueue.js'; // P1-E
import { createServer }         from 'http';
import { initWebSocket }        from './lib/websocket.js'; // P6-1


// P8-1: Rich startup banner with per-feature availability matrix.
// Falls back to original validateEnv for the exit-on-missing logic.
validateEnvironment();
validateEnv();

import app from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Wrap Express in a raw HTTP server so Socket.IO can share the port.
const server = createServer(app);

// P6-1: initWebSocket is async — it must await the Redis pub/sub
// adapter connection before the server starts accepting traffic.
// If REDIS_URL is not set it falls back gracefully to single-instance mode.
await initWebSocket(server);

server.listen(PORT, () => {
  console.log('\n  🏗️  TezzNirmaan API + Socket.IO Server');
  console.log('  ─────────────────────────────────────');
  console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port        : ${PORT}`);
  console.log(`  API Base    : http://localhost:${PORT}/api/v1`);
  console.log(`  Socket.IO   : ws://localhost:${PORT} (/customer /rider /shop)`);
  console.log(`  Redis Adapter: ${process.env.REDIS_URL ? 'enabled ✓' : 'disabled (single-instance)'}`);
  console.log(`  Health      : http://localhost:${PORT}/health`);
  console.log('  ─────────────────────────────────────\n');

  // P1-E: Start job queue after HTTP server is listening.
  // Non-blocking — queue startup failure never crashes the server.
  initQueue().then((q) => {
    if (q) console.log('  ✓ Job queue (pg-boss) running');
  }).catch(() => {}); // errors already logged inside initQueue

  // P18-4: Flash sale auto-scheduler (activates/deactivates based on schedule)
  import('./services/flash-sale.service.js').then(({ startFlashSaleScheduler }) => {
    startFlashSaleScheduler();
    console.log('  ✓ Flash sale scheduler running (5-min interval)');
  }).catch(() => {});
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully...');
  server.close(async () => {
    await stopQueue(); // P1-E: drain in-flight jobs before exit
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received — shutting down...');
  server.close(async () => {
    await stopQueue(); // P1-E
    process.exit(0);
  });
});

export default server;
