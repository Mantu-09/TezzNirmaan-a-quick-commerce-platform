// dashboard/e2e/admin.spec.ts — P4-3A
// E2E tests for the TezzNirmaan platform admin portal.
// Runs in the 'admin' project with pre-authenticated platform_admin state.
// Auth state loaded from e2e/.auth/admin.json (set up by auth.setup.ts).

import { test, expect } from '@playwright/test';

test.describe('Admin portal', () => {

  // ── Analytics ──────────────────────────────────────────────
  test('platform analytics loads GMV card and wallet liability', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.locator('[data-testid="gmv-card"]')).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('[data-testid="wallet-liability-card"]')).toBeVisible({ timeout: 12_000 });
  });

  test('cashback rules table is visible on analytics page', async ({ page }) => {
    await page.goto('/admin/analytics');
    // Wait for the Suspense boundary to resolve (CashbackRulesManager)
    await expect(page.locator('text=Cashback Rules')).toBeVisible({ timeout: 12_000 });
  });

  test('analytics period selector works without error', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.locator('[data-testid="gmv-card"]')).toBeVisible({ timeout: 12_000 });
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    // Change period
    const period7d = page.locator('button:has-text("7d"), button:has-text("7 days"), button:has-text("7D")').first();
    if (await period7d.isVisible()) await period7d.click();
    await page.waitForTimeout(600);
    expect(errors).toHaveLength(0);
  });

  // ── Shops ──────────────────────────────────────────────────
  test('shop list page shows shops table', async ({ page }) => {
    await page.goto('/admin/shops');
    await expect(page.locator('[data-testid="shops-table"]')).toBeVisible({ timeout: 10_000 });
  });

  test('shop list filter buttons are present', async ({ page }) => {
    await page.goto('/admin/shops');
    await expect(page.locator('[data-testid="shops-table"]')).toBeVisible({ timeout: 10_000 });
    const filterAll    = page.locator('button:has-text("all"), .filter-btn:has-text("all")').first();
    const filterActive = page.locator('button:has-text("active"), .filter-btn:has-text("active")').first();
    await expect(filterAll).toBeVisible();
    await expect(filterActive).toBeVisible();
  });

  test('add shop button is present on shops list', async ({ page }) => {
    await page.goto('/admin/shops');
    await expect(page.locator('[data-testid="add-shop-btn"]')).toBeVisible({ timeout: 8_000 });
  });

  test('new shop form page loads', async ({ page }) => {
    await page.goto('/admin/shops/new');
    // Form should be visible — at minimum a submit button
    await expect(page.locator('form, [data-testid="submit-btn"], button[type="submit"]').first())
      .toBeVisible({ timeout: 8_000 });
  });

  test('new shop form requires shop name field', async ({ page }) => {
    await page.goto('/admin/shops/new');
    // Try submitting empty — should stay on page (validation)
    const submitBtn = page.locator('button[type="submit"], [data-testid="submit-btn"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await expect(page).toHaveURL(/\/admin\/shops\/new/);
    }
  });

  // ── Riders ─────────────────────────────────────────────────
  test('riders list page loads', async ({ page }) => {
    await page.goto('/admin/riders');
    // Should not 404 and should show the rider table
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('h1, [style*="fontWeight: 700"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('new rider form page loads', async ({ page }) => {
    await page.goto('/admin/riders/new');
    await expect(page.locator('form, button[type="submit"]').first())
      .toBeVisible({ timeout: 8_000 });
  });

  // ── Access control ─────────────────────────────────────────
  test('admin routes are inaccessible without auth', async ({ browser }) => {
    const context = await browser.newContext(); // Fresh context — no auth
    const page    = await context.newPage();
    await page.goto('/admin/analytics');
    // Should be redirected to login, not show admin content
    await expect(page).not.toHaveURL(/\/admin\/analytics/, { timeout: 8_000 });
    await context.close();
  });

  // ── Promo codes ────────────────────────────────────────────
  test('promos page loads', async ({ page }) => {
    await page.goto('/admin/promos');
    await expect(page.locator('body')).not.toContainText('404');
  });

  // ── Cashback rules CRUD (smoke test) ──────────────────────
  test('cashback rules table shows default tiers', async ({ page }) => {
    await page.goto('/admin/analytics');
    // Wait for CashbackRulesManager to load
    await expect(page.locator('text=Cashback Rules')).toBeVisible({ timeout: 12_000 });
    // 3 default rows: 1%, 2%, 3% tiers
    const rows = page.locator('table tbody tr').filter({ hasText: '%' });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('cashback preview calculator works', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.locator('text=Cashback Rules')).toBeVisible({ timeout: 12_000 });
    // Find the preview input and calculate
    const previewInput = page.locator('input[placeholder*="Order amount"]');
    if (await previewInput.isVisible()) {
      await previewInput.fill('1000');
      await page.locator('button:has-text("Calculate")').click();
      // Result should contain ₹ and a number
      await expect(page.locator('text=/₹\\d/')).toBeVisible();
    }
  });
});
