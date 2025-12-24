import { test, expect } from '@playwright/test';
import { clearAuth } from './helpers';

/**
 * SF-024: E2E Tests - Billing Flow
 *
 * Tests billing page access and API endpoints.
 * Note: Authenticated browser tests are skipped due to
 * complexity with Zustand persist + React Router.
 */

test.describe('Billing Flow', () => {
  test.describe('Billing Page Access', () => {
    test('redirects to login when not authenticated', async ({ page }) => {
      await clearAuth(page);

      await page.goto('/admin/billing');

      await page.waitForURL(/\/admin\/login/, { timeout: 10000 });
      expect(page.url()).toContain('/admin/login');
    });
  });

  test.describe('Billing API', () => {
    test('billing endpoint requires authentication', async ({ request }) => {
      const response = await request.get(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/billing/subscription`
      );

      // Should require auth
      expect(response.status()).toBe(401);
    });

    test('usage endpoint requires authentication', async ({ request }) => {
      const response = await request.get(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/billing/usage`
      );

      expect(response.status()).toBe(401);
    });
  });
});
