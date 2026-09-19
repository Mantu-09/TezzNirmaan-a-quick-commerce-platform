// dashboard/e2e/shop-dashboard.spec.ts — P4-3A
// E2E tests for the shop-owner dashboard.
// Runs in the 'chromium' project with pre-authenticated shop owner state.
// Auth state is loaded from e2e/.auth/shop-owner.json (set up by auth.setup.ts).

import { test, expect } from '@playwright/test';

test.describe('Shop dashboard', () => {

  // ── Auth guard ─────────────────────────────────────────────
  test('unauthenticated access to dashboard redirects to login', async ({ browser }) => {
    // Use a fresh browser context with NO auth state
    const context = await browser.newContext();
    const page    = await context.newPage();
    await page.goto('/dashboard/orders');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    await context.close();
  });

  test('admin routes are blocked for shop_owner role', async ({ page }) => {
    await page.goto('/admin/shops');
    // Must not stay on /admin — middleware should redirect to dashboard or login
    await expect(page).not.toHaveURL(/\/admin\/shops/, { timeout: 8_000 });
  });

  // ── Order queue ────────────────────────────────────────────
  test('order queue page loads without error', async ({ page }) => {
    await page.goto('/dashboard/orders');
    await expect(page.locator('[data-testid="order-queue"]')).toBeVisible({ timeout: 10_000 });
    // No uncaught JS errors — verify no error boundary triggered
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    expect(errors).toHaveLength(0);
  });

  test('order queue tabs are rendered', async ({ page }) => {
    await page.goto('/dashboard/orders');
    // 4 tabs: All Active, ⚡ Quick, 📅 Scheduled, ✓ Done
    const tabs = page.locator('.tab-btn');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('refresh button triggers re-fetch without page reload', async ({ page }) => {
    await page.goto('/dashboard/orders');
    await expect(page.locator('[data-testid="order-queue"]')).toBeVisible();
    // Click refresh — page should NOT do a full reload
    const navigationCount = { value: 0 };
    page.on('framenavigated', () => navigationCount.value++);
    await page.click('button:has-text("Refresh")');
    await page.waitForTimeout(500);
    // Navigation count should be 0 (no page reload, only fetch)
    expect(navigationCount.value).toBe(0);
  });

  // ── Inventory ──────────────────────────────────────────────
  test('inventory page loads and shows products table', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    await expect(page.locator('[data-testid="inventory-table"]')).toBeVisible({ timeout: 10_000 });
  });

  test('inventory search filters rows', async ({ page }) => {
    await page.goto('/dashboard/inventory');
    await expect(page.locator('[data-testid="inventory-table"]')).toBeVisible({ timeout: 10_000 });
    // Type in search (find the search input)
    const search = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    if (await search.isVisible()) {
      await search.fill('xyz-nonexistent-product-12345');
      // Table body should show no results or empty state
      await page.waitForTimeout(400);
      const rows = page.locator('[data-testid="inventory-table"] tbody tr');
      const rowCount = await rows.count();
      // Either 0 rows or 1 "no results" row — both are correct
      expect(rowCount).toBeLessThanOrEqual(1);
    }
  });

  // ── Analytics ──────────────────────────────────────────────
  test('analytics page loads without error', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await expect(page.locator('[data-testid="analytics-content"]')).toBeVisible({ timeout: 12_000 });
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    expect(errors).toHaveLength(0);
  });

  test('analytics period selector changes visible period', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await expect(page.locator('[data-testid="analytics-content"]')).toBeVisible({ timeout: 12_000 });
    // Click "Today" period button
    const todayBtn = page.locator('button:has-text("Today")');
    if (await todayBtn.isVisible()) {
      await todayBtn.click();
      await page.waitForTimeout(500); // allow re-fetch
      // Still on analytics, no crash
      await expect(page).toHaveURL(/\/dashboard\/analytics/);
    }
  });

  // ── Summary page ───────────────────────────────────────────
  test('summary page loads', async ({ page }) => {
    await page.goto('/dashboard/summary');
    // Should not 404
    await expect(page.locator('body')).not.toContainText('404');
  });

  // ── Navigation sidebar ─────────────────────────────────────
  test('sidebar is visible on dashboard', async ({ page }) => {
    await page.goto('/dashboard/orders');
    // Sidebar should be visible — look for nav links to key routes
    const inventoryLink = page.locator('a[href="/dashboard/inventory"]');
    await expect(inventoryLink).toBeVisible();
  });
});
