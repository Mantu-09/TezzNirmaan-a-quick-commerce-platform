import { supabaseAdmin } from '../config/supabase.js';
import { AuthenticationError } from '../utils/errors.js';

/**
 * Authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header, verifies it
 * with Supabase Auth, and attaches the user object to `req.user`.
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

    // Verify the JWT with Supabase — this also checks expiry
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Extract role from app_metadata (set during user creation)
    const role = user.app_metadata?.role || 'customer';

    // Attach user info to the request for downstream middleware/controllers
    req.user = {
      id: user.id,
      role,
      email: user.email || null,
      phone: user.phone || null,
    };

    // Also attach the raw token so services can create per-user Supabase clients if needed
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
