// ────────────────────────────────────────────────────────────
// Server Entry Point
// ────────────────────────────────────────────────────────────
import 'dotenv/config';
import { validateEnv } from './utils/validateEnv.js';

// Validate ALL required env vars before anything else loads.
// Server exits immediately with a clear error if any are missing.
validateEnv();

import app from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, () => {
  console.log('\n  🏗️  TezzNirmaan API Server');
  console.log('  ─────────────────────────────────────');
  console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port        : ${PORT}`);
  console.log(`  API Base    : http://localhost:${PORT}/api/v1`);
  console.log(`  Health      : http://localhost:${PORT}/health`);
  console.log('  ─────────────────────────────────────\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received — shutting down...');
  server.close(() => process.exit(0));
});

export default server;
