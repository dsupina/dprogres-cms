import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  signupUser,
  verifyEmail,
  loginUser,
  clearAuth,
  waitForPageLoad,
} from './helpers';

/**
 * SF-024: E2E Tests - Authentication Flow
 *
 * Tests the authentication API and login UI:
 * - User signup (API)
 * - Email verification (API)
 * - Login (API)
 * - Protected route redirect (UI)
 */

test.describe('Authentication Flow', () => {
  test.describe('Signup API', () => {
    test('can signup with valid credentials', async ({ request }) => {
      const user = generateTestUser();
      const { result } = await signupUser(request, user);

      expect(result.message).toContain('Signup successful');
      expect(result.user.email).toBe(user.email);
      expect(result.organization).toBeDefined();
      expect(result.verificationUrl).toBeDefined();
    });

    test('rejects duplicate email signup', async ({ request }) => {
      const user = generateTestUser();
      await signupUser(request, user);

      const response = await request.post(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/auth/signup`,
        { data: user }
      );

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('already exists');
    });

    test('validates required fields', async ({ request }) => {
      const response = await request.post(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/auth/signup`,
        {
          data: {
            email: 'incomplete@test.example.com',
          },
        }
      );

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Email Verification API', () => {
    test('can verify email with valid token', async ({ request }) => {
      const { result } = await signupUser(request);
      const verifyResult = await verifyEmail(request, result.verificationUrl);

      expect(verifyResult.message).toContain('verified successfully');
    });

    test('rejects invalid verification token', async ({ request }) => {
      const response = await request.get(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/auth/verify-email?token=invalid-token-12345`
      );

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Login API', () => {
    test('can login with verified email', async ({ request }) => {
      const { user, result } = await signupUser(request);
      await verifyEmail(request, result.verificationUrl);

      const loginResult = await loginUser(request, user.email, user.password);

      expect(loginResult.message).toContain('Login successful');
      expect(loginResult.token).toBeDefined();
      expect(loginResult.user.email).toBe(user.email);
    });

    test('rejects unverified email login', async ({ request }) => {
      const { user } = await signupUser(request);

      const response = await request.post(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/auth/login`,
        { data: { email: user.email, password: user.password } }
      );

      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    test('rejects invalid credentials', async ({ request }) => {
      const response = await request.post(
        `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000'}/api/auth/login`,
        { data: { email: 'nonexistent@test.example.com', password: 'WrongPassword123' } }
      );

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Login Page UI', () => {
    test('rejects invalid credentials with 401', async ({ page }) => {
      await page.goto('/admin/login');
      await waitForPageLoad(page);

      await page.fill('input[name="email"]', 'nonexistent@test.example.com');
      await page.fill('input[name="password"]', 'WrongPassword123');

      // Submit and wait for the API response
      const [response] = await Promise.all([
        page.waitForResponse(
          (resp) => resp.url().includes('/api/auth/login') && resp.status() === 401
        ),
        page.click('button[type="submit"]'),
      ]);

      // Verify backend returned 401 with error message
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Invalid credentials');

      // Verify we're still on login page (not redirected)
      expect(page.url()).toContain('/admin/login');
    });
  });

  test.describe('Protected Routes', () => {
    test('redirects to login when accessing admin without auth', async ({ page }) => {
      await clearAuth(page);

      await page.goto('/admin');

      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain('/admin/login');
    });

    test('redirects to login when accessing billing without auth', async ({ page }) => {
      await clearAuth(page);

      await page.goto('/admin/billing');

      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain('/admin/login');
    });
  });
});
