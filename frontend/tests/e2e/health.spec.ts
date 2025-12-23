import { test, expect } from '@playwright/test';

/**
 * SF-024: E2E Tests - Health Checks
 *
 * Basic smoke tests to verify the application is running.
 */

test.describe('Health Checks', () => {
  test('frontend loads', async ({ page }) => {
    await page.goto('/');

    // Page should load without error
    await expect(page).not.toHaveTitle(/error/i);
  });

  test('API health endpoint responds', async ({ request }) => {
    const response = await request.get(
      `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/health`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('OK');
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/admin/login');

    // Should see login form
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('API categories endpoint responds', async ({ request }) => {
    const response = await request.get(
      `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/categories`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBeTruthy();
  });
});
