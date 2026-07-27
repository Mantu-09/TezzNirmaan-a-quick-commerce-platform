import { supabaseAdmin } from '../config/supabase.js';
import { AuthenticationError } from '../utils/errors.js';

/**
 * Short-lived in-memory token cache.
 *
 * Avoids a Supabase Auth network round-trip on every request.
 * After a successful getUser() the result is cached for TTL_MS.
 * On network errors the cache is used as a fallback so transient
 * DNS / timeout failures don't log the user out mid-session.
 *
 * Shape: Map<token, { user: object, expiresAt: number }>
 */
const TOKEN_CACHE = new Map();
const TTL_MS     = 5 * 60 * 1000; // 5 minutes

/** Remove stale entries (called lazily on each request). */
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of TOKEN_CACHE) {
    if (entry.expiresAt < now) TOKEN_CACHE.delete(key);
  }
}

/**
 * Authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header, verifies it
 * with Supabase Auth (or the local cache), and attaches the user object
 * to `req.user`.
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

    pruneCache();

    // ── 1. Try cache first ────────────────────────────────────────
    const cached = TOKEN_CACHE.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      req.user  = cached.user;
      req.token = token;
      return next();
    }

    // ── 2. Cache miss → verify with Supabase ─────────────────────
    let user;
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) {
        // Hard auth failure — token is genuinely invalid, don't cache
        throw new AuthenticationError('Invalid or expired token');
      }
      user = data.user;
    } catch (networkErr) {
      // If it's an AuthenticationError we already threw, re-throw it
      if (networkErr instanceof AuthenticationError) throw networkErr;

      // Network / timeout error — check if we have a stale (recently
      // expired) cache entry to fall back on rather than logging the
      // user out completely
      const stale = TOKEN_CACHE.get(token);
      if (stale) {
        req.user  = stale.user;
        req.token = token;
        // Extend the stale entry briefly so it survives the blip
        stale.expiresAt = Date.now() + 60_000; // 1-minute grace
        return next();
      }

      // No cached user at all — we can't trust the token
      throw new AuthenticationError('Authentication service temporarily unavailable');
    }

    // ── 3. Build user object & populate cache ────────────────────
    const role    = user.app_metadata?.role || 'customer';
    const userObj = {
      id:    user.id,
      role,
      email: user.email  || null,
      phone: user.phone  || null,
    };

    TOKEN_CACHE.set(token, { user: userObj, expiresAt: Date.now() + TTL_MS });

    req.user  = userObj;
    req.token = token;
    next();

  } catch (err) {
    if (err instanceof AuthenticationError) {
      next(err);
    } else {
      next(new AuthenticationError('Authentication failed'));
    }
  }
}

/** Explicitly evict a token from the cache (call on logout / refresh). */
export function invalidateToken(token) {
  TOKEN_CACHE.delete(token);
}
