import { test as base, expect, APIRequestContext, Page } from '@playwright/test';

/**
 * E2E Test Fixtures (SF-024)
 *
 * Provides reusable test helpers for:
 * - User signup and authentication
 * - API interactions
 * - Test data generation
 */

// Types
interface SignupData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

interface SignupResponse {
  message: string;
  user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  organization: {
    id: number;
    name: string;
    slug: string;
  };
  verificationUrl: string;
}

interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: number;
    email: string;
    role: string;
  };
}

// Test fixtures
export interface TestFixtures {
  apiContext: APIRequestContext;
  testUser: SignupData;
  signupUser: (data?: Partial<SignupData>) => Promise<SignupResponse>;
  verifyEmail: (verificationUrl: string) => Promise<void>;
  loginUser: (email: string, password: string) => Promise<LoginResponse>;
  authenticatedPage: Page;
}

/**
 * Generate unique test email
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `e2e-test-${timestamp}-${random}@test.dprogres.com`;
}

/**
 * Generate test user data
 */
export function generateTestUser(): SignupData {
  return {
    email: generateTestEmail(),
    password: 'TestPassword123!',
    first_name: 'E2E',
    last_name: 'Tester',
  };
}

/**
 * Extended test with fixtures
 */
export const test = base.extend<TestFixtures>({
  // API context for direct API calls
  apiContext: async ({ playwright }, use) => {
    const apiContext = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL || 'http://localhost:5000',
    });
    await use(apiContext);
    await apiContext.dispose();
  },

  // Generate test user data
  testUser: async ({}, use) => {
    const user = generateTestUser();
    await use(user);
  },

  // Signup helper function
  signupUser: async ({ apiContext }, use) => {
    const signupUser = async (data?: Partial<SignupData>): Promise<SignupResponse> => {
      const userData = { ...generateTestUser(), ...data };

      const response = await apiContext.post('/api/auth/signup', {
        data: userData,
      });

      if (!response.ok()) {
        const error = await response.json();
        throw new Error(`Signup failed: ${error.error || response.statusText()}`);
      }

      return await response.json();
    };

    await use(signupUser);
  },

  // Email verification helper
  verifyEmail: async ({ apiContext }, use) => {
    const verifyEmail = async (verificationUrl: string): Promise<void> => {
      // Extract token from URL
      const url = new URL(verificationUrl);
      const token = url.searchParams.get('token');

      if (!token) {
        throw new Error('No verification token found in URL');
      }

      const response = await apiContext.get(`/api/auth/verify-email?token=${token}`);

      if (!response.ok()) {
        const error = await response.json();
        throw new Error(`Email verification failed: ${error.error || response.statusText()}`);
      }
    };

    await use(verifyEmail);
  },

  // Login helper function
  loginUser: async ({ apiContext }, use) => {
    const loginUser = async (email: string, password: string): Promise<LoginResponse> => {
      const response = await apiContext.post('/api/auth/login', {
        data: { email, password },
      });

      if (!response.ok()) {
        const error = await response.json();
        throw new Error(`Login failed: ${error.error || response.statusText()}`);
      }

      return await response.json();
    };

    await use(loginUser);
  },

  // Authenticated page fixture
  authenticatedPage: async ({ page, signupUser, verifyEmail, loginUser }, use) => {
    // Create new user
    const signupResult = await signupUser();

    // Verify email
    await verifyEmail(signupResult.verificationUrl);

    // Login via API to get token
    const loginResult = await loginUser(
      signupResult.user.email,
      'TestPassword123!'
    );

    // Set auth token in localStorage
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          user: null,
          token: token,
          isAuthenticated: true,
        },
        version: 0,
      }));
    }, loginResult.token);

    // Reload to pick up auth state
    await page.reload();

    await use(page);
  },
});

export { expect };
