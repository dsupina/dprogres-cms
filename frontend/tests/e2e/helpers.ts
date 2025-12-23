import { Page, expect, APIRequestContext } from '@playwright/test';

/**
 * E2E Test Helpers (SF-024)
 *
 * Utility functions for E2E tests that work with the existing database.
 */

const API_BASE = process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000';

/**
 * Generate a unique test email
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `e2e-${timestamp}-${random}@test.example.com`;
}

/**
 * Generate test user data
 */
export function generateTestUser() {
  return {
    email: generateTestEmail(),
    password: 'TestPassword123!',
    first_name: 'E2E',
    last_name: 'Tester',
  };
}

/**
 * Sign up a new user via API
 */
export async function signupUser(
  request: APIRequestContext,
  userData?: Partial<ReturnType<typeof generateTestUser>>
) {
  const user = { ...generateTestUser(), ...userData };

  const response = await request.post(`${API_BASE}/api/auth/signup`, {
    data: user,
  });

  if (!response.ok()) {
    const error = await response.json();
    throw new Error(`Signup failed: ${error.error || response.statusText()}`);
  }

  const result = await response.json();
  return { user, result };
}

/**
 * Verify email via API
 */
export async function verifyEmail(
  request: APIRequestContext,
  verificationUrl: string
) {
  // Extract token from URL
  const url = new URL(verificationUrl);
  const token = url.searchParams.get('token');

  if (!token) {
    throw new Error('No verification token found in URL');
  }

  const response = await request.get(`${API_BASE}/api/auth/verify-email?token=${token}`);

  if (!response.ok()) {
    const error = await response.json();
    throw new Error(`Email verification failed: ${error.error || response.statusText()}`);
  }

  return response.json();
}

/**
 * Login via API and get token
 */
export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const response = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    const error = await response.json();
    throw new Error(`Login failed: ${error.error || response.statusText()}`);
  }

  return response.json();
}

/**
 * Set authentication in browser localStorage
 */
export async function setAuthInBrowser(
  page: Page,
  token: string,
  user: { id: number; email: string; role: string }
) {
  await page.goto('/');
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: user,
            token: token,
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    },
    { token, user }
  );
  // Reload and wait for auth to be checked
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

/**
 * Login via the browser UI
 */
export async function loginViaBrowser(
  page: Page,
  email: string,
  password: string
) {
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');

  // Fill the form
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);

  // Click submit and wait for either redirect or success toast
  await Promise.all([
    page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // Double-check we're logged in (wait a bit for navigation)
  await page.waitForTimeout(2000);

  // If still on login, check for success toast and navigate manually
  if (page.url().includes('/admin/login')) {
    // Look for success toast indicating login worked
    const successToast = page.locator('text=/[Ll]ogin successful/');
    if (await successToast.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
    }
  }
}

/**
 * Create a fully authenticated user and set up browser session
 */
export async function createAuthenticatedSession(
  page: Page,
  request: APIRequestContext
) {
  // Create user
  const { user, result } = await signupUser(request);

  // Verify email
  await verifyEmail(request, result.verificationUrl);

  // Login
  const loginResult = await loginUser(request, user.email, user.password);

  // Set auth in browser
  await setAuthInBrowser(page, loginResult.token, loginResult.user);

  return { user, loginResult };
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

/**
 * Clear browser auth state
 */
export async function clearAuth(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
