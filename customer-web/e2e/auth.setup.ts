// dashboard/e2e/auth.setup.ts — P4-3A
// Global Playwright setup: authenticates two users (shop_owner + platform_admin)
// by calling the backend API directly — bypassing the OTP UI flow entirely.
//
// Saves auth state (cookies / localStorage JWT) to e2e/.auth/*.json.
// These files are loaded by the chromium and admin test projects.
//
// Run order: this file runs before any spec file (configured as 'setup' project).

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const SHOP_OWNER_AUTH_FILE = path.join(__dirname, '.auth/shop-owner.json');
const ADMIN_AUTH_FILE      = path.join(__dirname, '.auth/admin.json');

// ── Shop Owner Setup ───────────────────────────────────────────
setup('authenticate as shop owner', async ({ page, request }) => {
  const phone    = process.env.TEST_SHOP_PHONE    || '';
  const password = process.env.TEST_SHOP_PASSWORD || ''; // Actually the test OTP

  if (!phone) {
    console.warn('[auth.setup] TEST_SHOP_PHONE not set — skipping shop auth');
    await page.context().storageState({ path: SHOP_OWNER_AUTH_FILE });
    return;
  }

  // Step 1: Request OTP (or use magic test OTP if TEST_SHOP_PASSWORD is set)
  await request.post('/api/auth/request-otp', {
    data: { phone: `+91${phone}` },
  });

  // Step 2: Navigate to login and complete flow via UI
  await page.goto('/login');
  await page.fill('[data-testid="phone-input"]', phone);
  await page.click('[data-testid="send-otp-btn"]');

  // In test environment, use a fixed test OTP (configure in .env.test)
  // OTP boxes are individual inputs data-testid="otp-input-0" ... "otp-input-5"
  const testOtp = password || process.env.TEST_OTP || '000000';
  for (let i = 0; i < 6; i++) {
    await page.fill(`[data-testid="otp-input-${i}"]`, testOtp[i]);
  }

  // Wait for redirect after successful OTP verification
  await expect(page).toHaveURL(/\/dashboard\/orders/, { timeout: 10_000 });

  // Save auth state
  await page.context().storageState({ path: SHOP_OWNER_AUTH_FILE });
  console.log('[auth.setup] Shop owner auth saved');
});

// ── Platform Admin Setup ───────────────────────────────────────
setup('authenticate as platform admin', async ({ page }) => {
  const phone = process.env.TEST_ADMIN_PHONE || '';

  if (!phone) {
    console.warn('[auth.setup] TEST_ADMIN_PHONE not set — skipping admin auth');
    await page.context().storageState({ path: ADMIN_AUTH_FILE });
    return;
  }

  await page.goto('/login');
  await page.fill('[data-testid="phone-input"]', phone);
  await page.click('[data-testid="send-otp-btn"]');

  const testOtp = process.env.TEST_ADMIN_OTP || process.env.TEST_OTP || '000000';
  for (let i = 0; i < 6; i++) {
    await page.fill(`[data-testid="otp-input-${i}"]`, testOtp[i]);
  }

  // Admin should land on admin/analytics or dashboard — accept either
  await expect(page).toHaveURL(/\/admin|\/dashboard/, { timeout: 10_000 });

  await page.context().storageState({ path: ADMIN_AUTH_FILE });
  console.log('[auth.setup] Admin auth saved');
});
