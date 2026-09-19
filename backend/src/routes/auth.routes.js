// ────────────────────────────────────────────────────────────
// Auth Routes
// Public endpoints — NO authenticate middleware on this router.
// The /auth/me and /auth/logout endpoints apply authenticate
// individually since they need req.user / req.token.
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole }   from '../middleware/authorize.js';
import {
  requestOtp,
  verifyOtp,
  refreshToken,
  logout,
  getMe,
  staffLogin,
  savePushToken,    // P1-A
  changePassword,   // Phase E
} from '../controllers/auth.controller.js';

const router = Router();

// ── Customer OTP flow ────────────────────────────────────
// POST /auth/otp/request  — request a phone OTP (rate-limited)
// POST /auth/otp/send     — alias used by storefront auth page
router.post('/otp/request', requestOtp);
router.post('/otp/send',    requestOtp); // alias — storefront auth/page.jsx calls /otp/send

// POST /auth/otp/verify   — verify OTP → returns session
router.post('/otp/verify', verifyOtp);

// ── Session management ───────────────────────────────────
// POST /auth/refresh      — swap refresh token for new access token
router.post('/refresh', refreshToken);

// POST /auth/logout       — invalidate current session
router.post('/logout', authenticate, logout);

// ── Profile ──────────────────────────────────────────────
// GET /auth/me            — return current user's profile
router.get('/me', authenticate, getMe);

// ── Staff login (shop_owner, rider, platform_admin) ──────
// POST /auth/staff/login  — phone + password auth for B2B accounts
router.post('/staff/login', staffLogin);

// ── P1-A: Push token registration ────────────────────────
// PATCH /auth/push-token  — save Expo push token for the current user
router.patch('/push-token', authenticate, savePushToken);

// ── Phase E: Password self-service ───────────────────────
// PATCH /auth/change-password — staff (shop_owner, shop_staff, rider) change their own password
router.patch('/change-password', authenticate, requireRole('shop_owner', 'shop_staff', 'rider'), changePassword);

export default router;
