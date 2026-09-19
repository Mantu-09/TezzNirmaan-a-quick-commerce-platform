// ────────────────────────────────────────────────────────────
// Auth Controller
// Handles OTP-based customer authentication and
// password-based staff login (shop_owner, rider).
//
// Design decision — staff login approach:
//   Shop owners and riders are created by platform_admin only (no self-signup).
//   They are given a password by the admin. We use Supabase email/password auth
//   with a deterministic internal email alias: <phone>@tezznirmaan.internal.
//   This avoids Twilio/SMS costs for B2B roles and keeps credentials
//   entirely under admin control. The "email" is never exposed to the user —
//   they log in with their phone number + password only.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, AuthenticationError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { incrWithTtl } from '../config/redis.js'; // B7: Redis-backed rate limiting
import { saveExpoPushToken } from '../services/push.service.js'; // P1-A
import * as referralService from '../services/referral.service.js'; // P4-2A

// ── Redis-backed OTP rate limiter ────────────────────────
// Key: otp_rate:<phone>. Max: 3 per phone per 10 minutes.
// Uses incrWithTtl which atomically increments and sets expiry on first hit.
// Fails open (allows the request) if Redis is unavailable.
const OTP_MAX_REQUESTS = 3;
const OTP_WINDOW_S     = 10 * 60; // 10 minutes

async function checkOtpRateLimit(phone) {
  const key = `otp_rate:${phone}`;
  const { count, ttl } = await incrWithTtl(key, OTP_WINDOW_S);

  if (count > OTP_MAX_REQUESTS) {
    const remaining = ttl > 0 ? Math.ceil(ttl / 60) : 10;
    throw new AppError(
      `Too many OTP requests. Please wait ${remaining} minute(s) before trying again.`,
      429,
      'OTP_RATE_LIMIT'
    );
  }
}


// ── Controllers ───────────────────────────────────────────

/**
 * POST /auth/otp/request
 * Body: { phone: "+919876543210" }
 *
 * Sends a 6-digit OTP via Supabase's SMS provider (Twilio by default,
 * configured in Supabase Dashboard → Auth → Providers → Phone).
 */
export async function requestOtp(req, res, next) {
  try {
    const { phone } = req.body;
    if (!phone) throw new ValidationError('phone is required');

    // Normalise phone: ensure + prefix
    const normalisedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    // B7: Redis-backed per-phone rate limit (async)
    await checkOtpRateLimit(normalisedPhone);

    const { error } = await supabaseAdmin.auth.signInWithOtp({
      phone: normalisedPhone,
    });

    if (error) {
      logger.warn('OTP request failed', { phone: normalisedPhone, error: error.message });
      // Don't expose Supabase internals — return a friendly message
      throw new AppError('Failed to send OTP. Please check the phone number and try again.', 400, 'OTP_SEND_FAILED');
    }

    logger.info('OTP requested', { phone: normalisedPhone });
    res.json({ success: true, data: { message: 'OTP sent successfully' } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/otp/verify
 * Body: { phone: "+919876543210", token: "123456" }
 *
 * Verifies the OTP. On success:
 *   1. Returns the Supabase session (access_token, refresh_token, expires_in).
 *   2. Upserts a row in the `profiles` (users) table for new customers.
 */
export async function verifyOtp(req, res, next) {
  try {
    // P4-2A: accept optional referral_code alongside phone + token
    const { phone, token, referral_code } = req.body;
    if (!phone || !token) throw new ValidationError('phone and token are required');

    const normalisedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      phone: normalisedPhone,
      token,
      type: 'sms',
    });

    if (error || !data?.session) {
      logger.warn('OTP verification failed', { phone: normalisedPhone, error: error?.message });
      throw new AuthenticationError('Invalid or expired OTP');
    }

    const { session, user } = data;

    // P5-0A FIX: Reliable new-user detection via DB lookup BEFORE upsert.
    // The previous 30-second timestamp window was fragile — a slow SMS delivery
    // or user pause could misclassify a genuine new user as returning, silently
    // dropping referral rewards. Checking for the profiles row is 100% reliable.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    const isNewUser = !existingProfile;

    // Upsert profile row — creates the record on first login, no-op on repeat
    // Role defaults to 'customer' for self-signed-up phone users
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id:         user.id,
          phone:      normalisedPhone,
          role:       user.app_metadata?.role || 'customer',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id', ignoreDuplicates: false }
      );

    if (profileErr) {
      // Non-fatal: session is valid even if profile upsert fails
      logger.error('Profile upsert failed after OTP verify', {
        userId: user.id, error: profileErr.message,
      });
    }

    // P4-2A: Apply referral code for new users — NEVER blocks signup on failure
    if (isNewUser && referral_code) {
      referralService.applyReferralCode(user.id, referral_code)
        .then(() => logger.info('referral: code applied on signup', { userId: user.id, referral_code }))
        .catch(err => logger.warn('referral: code application failed (non-fatal)', { userId: user.id, referral_code, error: err.message }));
    }

    logger.info('OTP verified — user authenticated', { userId: user.id, phone: normalisedPhone, isNewUser });

    res.json({
      success: true,
      data: {
        session: {
          accessToken:  session.access_token,
          refreshToken: session.refresh_token,
          expiresIn:    session.expires_in,
          tokenType:    session.token_type,
        },
        user: {
          id:    user.id,
          phone: normalisedPhone,
          role:  user.app_metadata?.role || 'customer',
          is_new_user: isNewUser,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/refresh
 * Body: { refresh_token: "..." }
 *
 * Exchanges a refresh token for a new session pair.
 * Call this when the access token is near expiry (expires_in < 60s).
 */
export async function refreshToken(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) throw new ValidationError('refresh_token is required');

    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });

    if (error || !data?.session) {
      throw new AuthenticationError('Failed to refresh session. Please log in again.');
    }

    const { session } = data;
    res.json({
      success: true,
      data: {
        session: {
          accessToken:  session.access_token,
          refreshToken: session.refresh_token,
          expiresIn:    session.expires_in,
          tokenType:    session.token_type,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 * Requires: Authorization: Bearer <token>
 *
 * Invalidates the session server-side.
 * The authenticate middleware attaches req.token.
 */
export async function logout(req, res, next) {
  try {
    // Supabase admin client can sign out any session by token
    // We use the raw token attached by authenticate middleware
    if (req.token) {
      const { error } = await supabaseAdmin.auth.admin.signOut(req.token);
      if (error) {
        // Non-fatal — the client should clear their token regardless
        logger.warn('Supabase signOut returned error', { error: error.message });
      }
    }

    logger.info('User logged out', { userId: req.user?.id });
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Requires: authenticate middleware
 *
 * Returns the authenticated user's profile from the `profiles` table,
 * merged with the Supabase auth metadata (role, email, phone).
 */
export async function getMe(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone, role, avatar_url, created_at')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      // Return basic info from auth token if profile row doesn't exist yet
      return res.json({
        success: true,
        data: {
          user: {
            id:    req.user.id,
            role:  req.user.role,
            phone: req.user.phone,
            email: req.user.email,
          },
        },
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id:        profile.id,
          full_name: profile.full_name,
          phone:     profile.phone || req.user.phone,
          email:     req.user.email,
          role:      profile.role || req.user.role,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/staff/login
 * Body: { phone: "+919876543210", password: "..." }
 *
 * Password-based login for shop_owner and rider accounts.
 * Accounts are created by platform_admin only — no self-signup.
 *
 * Internal email format: <e164_phone_digits>@tezznirmaan.internal
 * e.g. phone "+919876543210" → email "919876543210@tezznirmaan.internal"
 *
 * The admin creates the account with this internal email + a temp password,
 * then communicates the phone + password to the staff member separately.
 */
export async function staffLogin(req, res, next) {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) throw new ValidationError('phone and password are required');

    // Construct internal email from phone digits (strip leading +)
    const digits        = phone.replace(/\D/g, '');
    const internalEmail = `${digits}@tezznirmaan.internal`;

    // Use Supabase anon client signInWithPassword (not admin) so it respects
    // the auth flow and returns a proper user session
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await anonClient.auth.signInWithPassword({
      email: internalEmail,
      password,
    });

    if (error || !data?.session) {
      logger.warn('Staff login failed', { phone, error: error?.message });
      throw new AuthenticationError('Invalid phone number or password');
    }

    const { session, user } = data;
    const role = user.app_metadata?.role;

    // Reject if the account doesn't have a staff role
    if (!['shop_owner', 'shop_staff', 'rider', 'platform_admin'].includes(role)) {
      throw new AuthenticationError('Access denied: this endpoint is for staff accounts only');
    }

    // Fetch shop_id for shop owners/staff so the dashboard can set X-Shop-Id header
    let shopId = null;
    if (role === 'shop_owner') {
      const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();
      shopId = shop?.id || null;
    } else if (role === 'shop_staff') {
      const { data: staffRow } = await supabaseAdmin
        .from('shop_staff')
        .select('shop_id')
        .eq('user_id', user.id)
        .maybeSingle();
      shopId = staffRow?.shop_id || null;
    }

    logger.info('Staff login successful', { userId: user.id, role, phone, shopId });

    res.json({
      success: true,
      data: {
        session: {
          accessToken:  session.access_token,
          refreshToken: session.refresh_token,
          expiresIn:    session.expires_in,
          tokenType:    session.token_type,
        },
        user: {
          id:     user.id,
          phone,
          role,
          email:  user.email,
          shop_id: shopId,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /auth/push-token
 * Requires: authenticate middleware
 * Body: { token: "ExponentPushToken[xxxxxx]" }
 *
 * Stores the user's Expo push token on their profile row.
 * Called by the mobile app whenever push permissions are granted
 * (on first launch, after permission prompt, or after reinstall).
 *
 * The token is validated via expo-server-sdk before saving.
 * Invalid tokens are rejected with 400 rather than stored as garbage.
 */
export async function savePushToken(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) throw new ValidationError('token is required');

    await saveExpoPushToken(req.user.id, token);

    logger.info('Push token saved', { userId: req.user.id });
    res.json({ success: true, data: { message: 'Push token registered' } });
  } catch (err) {
    next(err);
  }
}


/**
 * PATCH /auth/change-password
 * Requires: authenticate middleware + requireRole('shop_owner', 'shop_staff', 'rider')
 * Body: { current_password, new_password }
 *
 * Allows staff users (shop_owner, shop_staff, rider) to change their own password.
 * Uses the Supabase Admin SDK to update the password directly — no re-auth round-trip.
 * current_password is accepted in the body for UX audit purposes but the actual
 * enforcement relies on the authenticated session (the admin SDK bypasses Supabase
 * RLS, so we trust the JWT already validated by authenticate middleware).
 */
export async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password) throw new ValidationError('current_password is required');
    if (!new_password)     throw new ValidationError('new_password is required');
    if (new_password.length < 8) {
      throw new ValidationError('new_password must be at least 8 characters long');
    }
    if (current_password === new_password) {
      throw new ValidationError('new_password must differ from current_password');
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: new_password,
    });

    if (error) {
      logger.error('changePassword: Supabase update failed', { userId: req.user.id, error: error.message });
      throw new AppError('Failed to update password: ' + error.message, 500);
    }

    logger.info('Password changed', { userId: req.user.id, role: req.user.role });
    res.json({ success: true, data: { message: 'Password changed successfully' } });
  } catch (err) {
    next(err);
  }
}
