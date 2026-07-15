// ────────────────────────────────────────────────────────────
// Express Application — B7 Hardened
// TezzNirmaan Backend API
//
// B7 additions:
//   • X-Request-Id header on every response (UUID v4)
//   • Tiered rate limits: strict on /auth/otp/request, standard on rest
//   • Enhanced /health with DB ping + Redis status
//   • Request ID injected into logger context
// ────────────────────────────────────────────────────────────
import 'dotenv/config';
import { randomUUID } from 'crypto';
import logger from './utils/logger.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';
import { supabaseAdmin } from './config/supabase.js';
import { redisPing, isRedisMock } from './config/redis.js';

const app = express();

// ── Security Headers ──────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── B7: Request ID middleware ─────────────────────────────
// Attaches a unique X-Request-Id to every response.
// If the client sends one already (useful for mobile retry tracing), we honour it.
// Stored on req.requestId for use in logs and error responses.
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// ── B7: Tiered Rate Limiting ──────────────────────────────
//
// Tier 1 — OTP endpoint: 3 requests per 10 min per IP
// (Per-phone rate limiting is done in Redis inside auth.controller.js)
const otpIpLimiter = rateLimit({
  windowMs:      10 * 60 * 1000, // 10 minutes
  max:           10,              // 10 OTP attempts per IP per 10 min
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:  (req) => req.ip,
  message:       { success: false, error: { code: 'RATE_LIMIT', message: 'Too many OTP requests from this IP. Try again later.' } },
  skip:          (req) => process.env.NODE_ENV === 'test', // skip in tests
});

// Tier 2 — Auth endpoints: 30 req/15min per IP
const authLimiter = rateLimit({
  windowMs:      15 * 60 * 1000,
  max:           30,
  standardHeaders: true,
  legacyHeaders:   false,
  message:       { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth requests. Please wait.' } },
  skip:          (req) => process.env.NODE_ENV === 'test',
});

// Tier 3 — API routes: 200 req/15min per IP (generous for V1 pilot)
const apiLimiter = rateLimit({
  windowMs:      15 * 60 * 1000,
  max:           200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:       { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' } },
  skip:          (req) => process.env.NODE_ENV === 'test',
});

// Apply OTP limiter before general API limiter so it takes precedence
app.use('/api/v1/auth/otp/request', otpIpLimiter);
app.use('/api/v1/auth',             authLimiter);
app.use('/api/',                    apiLimiter);

// ── Webhook route needs raw body for Razorpay signature verification ──
// This MUST come before express.json() to preserve the raw buffer
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request Logging ───────────────────────────────────────
// Include Request ID in morgan output for log correlation
morgan.token('req-id', (req) => req.requestId);
const logFormat = process.env.NODE_ENV === 'production'
  ? ':req-id :method :url :status :res[content-length] - :response-time ms'
  : ':req-id :method :url :status :response-time ms';
app.use(morgan(logFormat));

// ── Health Check (no auth, no rate limit) ─────────────────
// Used by Render (and any uptime monitor) to verify the service is alive.
// Performs a lightweight DB ping and Redis ping.
app.get('/health', async (_req, res) => {
  const version = process.env.npm_package_version || '1.0.0';
  const startTime = Date.now();

  // DB check — cheapest possible query (no table scan)
  let dbStatus = 'ok';
  try {
    const { error } = await supabaseAdmin.rpc('now').single().catch(() => ({ error: null }));
    // Supabase JS always returns something; if SUPABASE_URL is wrong the import would have failed
    // so we just confirm we can reach it
    const { error: pingErr } = await supabaseAdmin
      .from('shops')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    if (pingErr) dbStatus = 'degraded';
  } catch {
    dbStatus = 'error';
  }

  // Redis check
  const redisOk = await redisPing();

  const latencyMs = Date.now() - startTime;
  const allOk     = dbStatus === 'ok' && redisOk;

  res.status(allOk ? 200 : 503).json({
    status:      allOk ? 'ok' : 'degraded',
    service:     'TezzNirmaan API',
    version,
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
    latencyMs,
    checks: {
      database: dbStatus,
      redis:    redisOk ? 'ok' : 'error',
      redisMock: isRedisMock(),     // lets ops know Redis is in mock mode
    },
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/v1', routes);

// ── 404 Handler ───────────────────────────────────────────
app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// ── Global Error Handler (must be last) ───────────────────
// Attach requestId to error responses for client-side debugging
app.use((err, req, res, next) => {
  err.requestId = req.requestId;
  errorHandler(err, req, res, next);
});

export default app;
