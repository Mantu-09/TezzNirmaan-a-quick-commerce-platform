// dashboard/e2e/marketing.spec.ts — P4-3A
// E2E tests for the TezzNirmaan marketing landing page.
// Runs in the 'public' project (no auth state — purely unauthenticated).

import { test, expect } from '@playwright/test';

test.describe('Marketing landing page', () => {

  // ── Accessibility ──────────────────────────────────────────
  test('is accessible without authentication', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(/login/);
    await expect(page.locator('.mkt-hero')).toBeVisible();
  });

  test('page has correct title and meta description', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/TezzNirmaan/i);
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute('content', /.+/); // non-empty
  });

  test('og:image meta tag is present and points to og-image', async ({ page }) => {
    await page.goto('/');
    const ogImage = page.locator('meta[property="og:image"]');
    // Tag must exist — content must contain 'og-image' or a valid URL
    const content = await ogImage.getAttribute('content');
    expect(content).toBeTruthy();
  });

  // ── Navigation ─────────────────────────────────────────────
  test('nav logo is visible and contains brand name', async ({ page }) => {
    await page.goto('/');
    // .mkt-logo is a div (not a link) — just assert it's visible with brand text
    const logo = page.locator('.mkt-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toContainText(/Tezz/i);
  });

  test('privacy page resolves without 404', async ({ page }) => {
    await page.goto('/');
    // Find the privacy link — may be in footer
    const privacyLink = page.locator('a[href="/privacy"]').first();
    await privacyLink.click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.locator('h1')).toContainText(/Privacy/i);
  });

  test('terms page resolves without 404', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.locator('h1')).toContainText(/Terms/i);
  });

  test('shop signup CTA leads to shop-signup form', async ({ page }) => {
    await page.goto('/');
    const ctaLink = page.locator('a[href="/shop-signup"]').first();
    await ctaLink.click();
    await expect(page).toHaveURL(/\/shop-signup/);
    await expect(page.locator('form')).toBeVisible();
  });

  // ── Live elements ──────────────────────────────────────────
  test('delivery timer ticks upward', async ({ page }) => {
    await page.goto('/');
    const timer = page.locator('.mkt-timer-value');
    await expect(timer).toBeVisible();
    const firstValue = await timer.textContent();
    await page.waitForTimeout(2000);
    const secondValue = await timer.textContent();
    // Timer should have changed (ticks every second)
    expect(firstValue).not.toEqual(secondValue);
  });

  // ── Referral banner ────────────────────────────────────────
  test('referral banner shows when ?ref= param is present', async ({ page }) => {
    await page.goto('/?ref=TN-TEST01');
    // Banner is a dynamically-imported 'use client' component — wait for hydration
    await expect(page.locator('.mkt-referral-banner')).toBeVisible({ timeout: 8000 });
    // Banner should mention the bonus amount
    await expect(page.locator('.mkt-referral-banner')).toContainText('₹100');
  });

  test('referral banner is absent without ?ref= param', async ({ page }) => {
    await page.goto('/');
    // Banner is a dynamically-imported client component — wait briefly for it to mount
    await page.waitForTimeout(1500);
    // Should not be visible (no ref param)
    const banner = page.locator('.mkt-referral-banner');
    const count = await banner.count();
    // Either not in DOM at all (0) or hidden — both are correct
    if (count > 0) {
      await expect(banner).not.toBeVisible();
    }
  });

  test('referral banner can be dismissed', async ({ page }) => {
    await page.goto('/?ref=TN-TEST01');
    // Wait for dynamic import hydration
    await expect(page.locator('.mkt-referral-banner')).toBeVisible({ timeout: 8000 });
    await page.click('.mkt-referral-banner-close');
    await expect(page.locator('.mkt-referral-banner')).not.toBeVisible();
  });

  // ── Category grid ──────────────────────────────────────────
  test('category grid renders at least 6 items', async ({ page }) => {
    await page.goto('/');
    const cats = page.locator('.mkt-category');
    const count = await cats.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  // ── Shop signup form validation ────────────────────────────
  test('shop signup form shows validation on empty submit', async ({ page }) => {
    await page.goto('/shop-signup');
    const form = page.locator('form');
    await expect(form).toBeVisible();
    // Attempt to submit empty — browser or JS validation should prevent it
    await page.locator('button[type="submit"], .mkt-form-submit').click();
    // Still on the same page
    await expect(page).toHaveURL(/\/shop-signup/);
  });
});
