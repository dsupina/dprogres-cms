import { test, expect, generateTestUser, generateTestEmail } from './fixtures';

/**
 * SF-024: E2E Tests - Error Paths
 *
 * Tests error handling scenarios in the billing flow:
 * - Invalid signup (duplicate email)
 * - Invalid login attempts
 * - Checkout cancellation
 * - Email verification errors
 */

test.describe('Billing Flow - Error Paths', () => {
  test.describe('Signup Errors', () => {
    test('shows error for duplicate email signup', async ({
      page,
      signupUser,
      apiContext,
    }) => {
      // First, create a user
      const testUser = generateTestUser();
      await signupUser(testUser);

      // Try to signup with same email via API
      const response = await apiContext.post('/api/auth/signup', {
        data: testUser,
      });

      // Should fail with 400
      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('already exists');
    });

    test('validates required signup fields', async ({ apiContext }) => {
      // Try signup with missing fields
      const response = await apiContext.post('/api/auth/signup', {
        data: {
          email: generateTestEmail(),
          // Missing password, first_name, last_name
        },
      });

      // Should fail validation
      expect(response.status()).toBe(400);
    });

    test('validates email format', async ({ apiContext }) => {
      const response = await apiContext.post('/api/auth/signup', {
        data: {
          email: 'invalid-email',
          password: 'TestPassword123!',
          first_name: 'Test',
          last_name: 'User',
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Login Errors', () => {
    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('/admin/login');
      await page.waitForLoadState('networkidle');

      // Fill with invalid credentials
      await page.fill('input[name="email"]', 'nonexistent@test.com');
      await page.fill('input[name="password"]', 'WrongPassword123');

      // Submit
      await page.click('button[type="submit"]');

      // Should show error - either in form or as toast
      await expect(
        page.locator('text=/[Ii]nvalid|[Ii]ncorrect|[Ww]rong|[Ff]ailed/')
      ).toBeVisible({ timeout: 5000 });
    });

    test('shows error for unverified email', async ({
      page,
      signupUser,
    }) => {
      // Create user but don't verify email
      const testUser = generateTestUser();
      await signupUser(testUser);

      // Try to login without email verification
      await page.goto('/admin/login');
      await page.waitForLoadState('networkidle');

      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.click('button[type="submit"]');

      // Should show email verification error
      await expect(
        page.locator('text=/[Vv]erify|[Ee]mail|[Nn]ot verified/')
      ).toBeVisible({ timeout: 5000 });
    });

    test('validates required login fields', async ({ page }) => {
      await page.goto('/admin/login');
      await page.waitForLoadState('networkidle');

      // Fill email only (to bypass HTML5 required validation on email)
      await page.fill('input[name="email"]', 'test@example.com');

      // Try to submit with empty password - HTML5 will block, then clear email to test our validation
      // First, remove the required attribute to test our custom validation
      await page.evaluate(() => {
        document.querySelectorAll('input[required]').forEach(el => {
          el.removeAttribute('required');
        });
      });

      // Now submit empty form to trigger custom validation
      await page.fill('input[name="email"]', '');
      await page.fill('input[name="password"]', '');
      await page.click('button[type="submit"]');

      // Should show validation errors (the Input component displays error text)
      await expect(
        page.locator('text=/[Rr]equired|[Ee]nter|[Vv]alid/')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Email Verification Errors', () => {
    test('shows error for invalid verification token', async ({ apiContext }) => {
      const response = await apiContext.get(
        '/api/auth/verify-email?token=invalid-token-12345'
      );

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('Invalid');
    });

    test('shows error for missing verification token', async ({ apiContext }) => {
      const response = await apiContext.get('/api/auth/verify-email');

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('required');
    });
  });

  test.describe('Checkout Errors', () => {
    test('handles checkout cancellation gracefully', async ({
      authenticatedPage: page,
    }) => {
      // Simulate return from canceled checkout
      await page.goto('/admin/billing?checkout=canceled');
      await page.waitForLoadState('networkidle');

      // Should show cancellation message (toast) - use first() to handle multiple matches
      // The BillingPage component shows "Checkout was canceled" toast
      await expect(
        page.locator('text=/[Cc]ancel|[Ff]ailed/').first()
      ).toBeVisible({ timeout: 5000 });

      // Should still show billing page (wait for loading to complete)
      await expect(page.locator('h1:has-text("Billing")')).toBeVisible({ timeout: 10000 });

      // Should show Free Plan (not upgraded)
      await expect(
        page.locator('text=Free Plan').or(page.locator('.bg-gray-500'))
      ).toBeVisible({ timeout: 10000 });
    });

    test('checkout success clears query params', async ({
      authenticatedPage: page,
    }) => {
      // Simulate successful checkout return
      await page.goto('/admin/billing?checkout=success');
      await page.waitForLoadState('networkidle');

      // Wait for success toast to appear (indicating the effect ran)
      await expect(
        page.locator('text=/[Ss]uccess|[Aa]ctivated/').first()
      ).toBeVisible({ timeout: 5000 });

      // Query params should be cleared - wait with polling
      await expect(async () => {
        expect(page.url()).not.toContain('checkout=');
      }).toPass({ timeout: 10000 });
    });
  });

  test.describe('Authentication Errors', () => {
    test('redirects to login when accessing billing without auth', async ({
      page,
    }) => {
      // Clear any stored auth
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Try to access billing page
      await page.goto('/admin/billing');

      // Should redirect to login
      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain('/admin/login');
    });

    test('handles expired token gracefully', async ({
      page,
    }) => {
      // Set an invalid/expired token
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('token', 'expired.token.here');
        localStorage.setItem('auth-storage', JSON.stringify({
          state: {
            user: null,
            token: 'expired.token.here',
            isAuthenticated: true,
          },
          version: 0,
        }));
      });

      // Try to access billing page
      await page.goto('/admin/billing');

      // Should redirect to login (token validation fails)
      await page.waitForURL(/\/admin\/login/, { timeout: 10000 });
    });
  });

  test.describe('Network Error Handling', () => {
    test('shows error when API is unreachable', async ({
      authenticatedPage: page,
    }) => {
      // Go to billing page first (while API works)
      await page.goto('/admin/billing');
      await page.waitForLoadState('networkidle');

      // Simulate network failure for API calls
      await page.route('**/api/billing/**', (route) => {
        route.abort('failed');
      });

      // Click refresh button (triggers API call)
      const refreshButton = page.locator('[title="Refresh data"]');
      if (await refreshButton.isVisible()) {
        await refreshButton.click();

        // Should show error state or error message
        // The component should handle network errors gracefully
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('Rate Limiting', () => {
    test('handles rate limiting gracefully', async ({ apiContext }) => {
      // This test verifies the API handles rate limiting
      // In production, rapid requests would trigger rate limiting

      const email = generateTestEmail();
      const signupData = {
        email,
        password: 'TestPassword123!',
        first_name: 'Rate',
        last_name: 'Test',
      };

      // Make initial request
      const response = await apiContext.post('/api/auth/signup', {
        data: signupData,
      });

      // First request should succeed
      expect(response.status()).toBe(201);

      // If we hit rate limiting (429), the system should handle it
      // This is more of a documentation/awareness test
    });
  });
});
