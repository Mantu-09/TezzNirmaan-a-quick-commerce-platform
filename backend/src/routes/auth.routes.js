// ────────────────────────────────────────────────────────────
// Auth Routes
// Public endpoints — NO authenticate middleware on this router.
// The /auth/me and /auth/logout endpoints apply authenticate
// individually since they need req.user / req.token.
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  requestOtp,
  verifyOtp,
  refreshToken,
  logout,
  getMe,
  staffLogin,
} from '../controllers/auth.controller.js';

const router = Router();

// ── Customer OTP flow ────────────────────────────────────
// POST /auth/otp/request  — request a phone OTP (rate-limited)
router.post('/otp/request', requestOtp);

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

export default router;
