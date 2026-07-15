// ────────────────────────────────────────────────────────────
// Redis Client — B7
//
// Uses @upstash/redis (REST-based, works on Render without
// a persistent TCP connection, free tier at upstash.com).
//
// Required env vars:
//   UPSTASH_REDIS_REST_URL   — from Upstash dashboard
//   UPSTASH_REDIS_REST_TOKEN — from Upstash dashboard
//
// Falls back to a no-op mock when env vars are missing
// (development, CI) so the app still boots without Redis.
// ────────────────────────────────────────────────────────────
import logger from '../utils/logger.js';

let redis = null;
let isMock = false;

// ── Mock for dev/test (no env vars) ──────────────────────────
// Simple in-process Map with TTL support.
// NOT suitable for production multi-instance deployments.
class MockRedis {
  constructor() {
    this._store = new Map();
    logger.warn('[Redis] UPSTASH_REDIS_REST_URL not set — using in-memory mock (single-instance only)');
  }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, opts = {}) {
    const expiresAt = opts.ex ? Date.now() + opts.ex * 1000 : null;
    this._store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key) {
    return this._store.delete(key) ? 1 : 0;
  }

  async incr(key) {
    const entry = this._store.get(key);
    const cur = entry ? parseInt(entry.value, 10) || 0 : 0;
    const next = cur + 1;
    const expiresAt = entry?.expiresAt || null;
    this._store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key, seconds) {
    const entry = this._store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ttl(key) {
    const entry = this._store.get(key);
    if (!entry || !entry.expiresAt) return -1;
    const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async ping() { return 'PONG'; }
}

// ── Initialise ────────────────────────────────────────────────
async function initRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    isMock = true;
    redis  = new MockRedis();
    return;
  }

  try {
    // Dynamic import so the package is optional in dev
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({ url, token });

    // Verify connection
    await redis.ping();
    logger.info('[Redis] Connected to Upstash Redis');
  } catch (err) {
    logger.error('[Redis] Connection failed — falling back to in-memory mock', { error: err.message });
    isMock = true;
    redis  = new MockRedis();
  }
}

// ── Exported helpers ──────────────────────────────────────────

/**
 * Get a cached value. Returns null on miss or error.
 */
export async function cacheGet(key) {
  try {
    return await redis.get(key);
  } catch (err) {
    logger.warn('[Redis] cacheGet error', { key, error: err.message });
    return null;
  }
}

/**
 * Set a cached value with optional TTL in seconds.
 */
export async function cacheSet(key, value, ttlSeconds = 60) {
  try {
    await redis.set(key, typeof value === 'string' ? value : JSON.stringify(value), { ex: ttlSeconds });
  } catch (err) {
    logger.warn('[Redis] cacheSet error', { key, error: err.message });
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key) {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn('[Redis] cacheDel error', { key, error: err.message });
  }
}

/**
 * Atomic increment + optional TTL set on first use.
 * Used for OTP rate limiting.
 * Returns { count, ttl }.
 */
export async function incrWithTtl(key, windowSeconds) {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      // First increment — set expiry
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    return { count, ttl };
  } catch (err) {
    logger.warn('[Redis] incrWithTtl error — allowing request', { key, error: err.message });
    return { count: 0, ttl: 0 }; // Fail open: don't block on Redis failure
  }
}

/**
 * Ping Redis for health check.
 */
export async function redisPing() {
  try {
    const res = await redis.ping();
    return res === 'PONG';
  } catch {
    return false;
  }
}

export function isRedisMock() {
  return isMock;
}

// Initialise immediately on import
await initRedis();

export default redis;
