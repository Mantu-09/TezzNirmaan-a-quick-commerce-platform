// dashboard/playwright.config.ts — P4-3A
// Playwright E2E configuration for TezzNirmaan dashboard.
//
// Run modes:
//   npm run e2e          — headless, sequential, HTML report
//   npm run e2e:ui       — interactive Playwright UI mode
//   npm run e2e:headed   — headed browser (watch tests run)
//   npm run e2e:ci       — retries=2, no local report open

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  // Sequential: tests share DB state (orders affect analytics, etc.)
  fullyParallel: false,
  workers: 1,

  // Fail fast in CI if .only() is left in — prevents accidental partial runs
  forbidOnly: !!process.env.CI,

  // 2 retries on CI for flaky network; 0 locally for fast feedback
  retries: process.env.CI ? 2 : 0,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    // Local dev server or staging URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Capture trace on first retry so failures are debuggable without re-running
    trace: 'on-first-retry',

    // Screenshot only on failure to keep artifact sizes small
    screenshot: 'only-on-failure',

    // Video on first retry in CI
    video: process.env.CI ? 'on-first-retry' : 'off',

    // Real browser settings for Chromium
    ...devices['Desktop Chrome'],
  },

  projects: [
    // ── Auth Setup ────────────────────────────────────────────
    // Runs before all test files; saves auth state to files that
    // the actual test projects load via storageState.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // ── Main test suite ───────────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Shop owner auth (loaded from setup)
        storageState: 'e2e/.auth/shop-owner.json',
      },
      dependencies: ['setup'],
      // marketing runs in 'public' (no auth); admin runs in 'admin' project
      testIgnore: [/admin\.spec\.ts/, /marketing\.spec\.ts/],
    },

    // ── Admin tests (separate auth context) ───────────────────
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      testMatch: /admin\.spec\.ts/,
    },

    // ── Unauthenticated tests (marketing page, etc.) ──────────
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /marketing\.spec\.ts/,
    },
  ],
});
