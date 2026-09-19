// ────────────────────────────────────────────────────────────
// investor-token.service.js — P11-5
//
// HMAC-SHA256 signed token for read-only investor report links.
// No JWT library needed — pure Node.js crypto.
//
// Token format: <base64url(payload)>.<base64url(hmac)>
// Payload: { exp, nonce, type: 'investor_report' }
// TTL: 7 days
//
// Secret: INVESTOR_REPORT_SECRET env var.
// If missing, falls back to a dev string — log a warning.
// ────────────────────────────────────────────────────────────
import crypto from 'crypto';
import logger  from '../utils/logger.js';

const SECRET_ENV_KEY = 'INVESTOR_REPORT_SECRET';
const TOKEN_TYPE     = 'investor_report';
const TTL_MS         = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret() {
  const s = process.env[SECRET_ENV_KEY];
  if (!s || s === '') {
    logger.warn(`${SECRET_ENV_KEY} not set — using insecure dev fallback. Set in production!`);
    return 'dev-secret-change-in-prod';
  }
  return s;
}

// ── generateInvestorToken ─────────────────────────────────────
// Returns a compact token string safe for URLs.
export function generateInvestorToken() {
  const payload = {
    exp:   Date.now() + TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex'),
    type:  TOKEN_TYPE,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${sig}`;
}

// ── verifyInvestorToken ───────────────────────────────────────
// Returns the decoded payload if valid, or null if invalid/expired.
export function verifyInvestorToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;

    // Constant-time signature comparison to prevent timing attacks
    const expectedSig = crypto
      .createHmac('sha256', getSecret())
      .update(payloadB64)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf   = Buffer.from(sig);
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

    // Decode and validate payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.type !== TOKEN_TYPE) return null;
    if (typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null; // Expired

    return payload;
  } catch {
    return null; // Malformed token — never throw to caller
  }
}
