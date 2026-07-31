// ────────────────────────────────────────────────────────────
// Auth Middleware — P7-0D
//
// Upgraded from getUser() + application-level cache (Phase 6 band-aid)
// to getClaims() + JWKS caching (correct long-term solution).
//
// WHY getClaims() over getUser():
//   getUser() makes a network round-trip to Supabase Auth on EVERY
//   request — even with the 5-min TOKEN_CACHE, a cold start or cache
//   miss means a full HTTP call to https://<project>.supabase.co/auth/v1/user.
//
//   getClaims() verifies the JWT locally against the JWKS public keys
//   fetched from Supabase's /.well-known/jwks.json endpoint. The SDK
//   caches the JWKS after the first fetch — every subsequent call is a
//   fast local crypto verify with zero network I/O.
//
//   See: https://supabase.com/docs/reference/javascript/auth-getclaims
//
// req.user shape (unchanged — no call-site changes needed):
//   { id: string, role: string, email: string|null, phone: string|null }
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header and verifies it
 * using getClaims() — local JWKS verification, no Supabase round-trip after
 * the first call. Attaches the resolved user object to `req.user`.
 *
 * req.user shape:
 *   { id: string, role: string, email: string|null, phone: string|null }
 *
 * Sends 401 if the token is missing, malformed, or invalid.
 */
export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AuthenticationError('Missing token');
    }

    // getClaims() verifies the JWT against the cached JWKS public key.
    // After the first network fetch of the JWKS, all subsequent calls are
    // fully local (no Supabase round-trip). This replaces the previous
    // application-level TOKEN_CACHE band-aid from Phase 6.
    const { data, error } = await supabaseAdmin.auth.getClaims(token);

    if (error || !data?.claims) {
      logger.debug('Auth: getClaims rejected token', { error: error?.message });
      throw new AuthenticationError('Invalid or expired token');
    }

    const claims = data.claims;

    // Build user object — same shape as before so nothing else changes.
    // Role is in app_metadata (set by admin on user creation) with a
    // fallback to user_metadata for legacy tokens.
    const role = claims.app_metadata?.role
      || claims.user_metadata?.role
      || 'customer';

    req.user = {
      id:    claims.sub,
      role,
      email: claims.email  || null,
      phone: claims.phone  || null,
    };

    req.token = token;
    next();

  } catch (err) {
    if (err instanceof AuthenticationError) {
      next(err);
    } else {
      logger.error('Auth middleware unexpected error:', { message: err.message });
      next(new AuthenticationError('Authentication failed'));
    }
  }
}

/**
 * Explicitly invalidate a token on logout / token refresh.
 *
 * With getClaims() there is no application-level cache to evict —
 * JWKS verification is stateless. This stub is kept so call-sites in
 * auth.controller.js (logout) don't need to change.
 *
 * For true token revocation, call supabase.auth.signOut() which
 * invalidates the session on the Supabase side.
 *
 * @param {string} _token — ignored, kept for API compatibility
 */
export function invalidateToken(_token) {
  // No-op: getClaims() uses stateless JWKS verification.
  // Revoke sessions via supabase.auth.signOut() instead.
}
