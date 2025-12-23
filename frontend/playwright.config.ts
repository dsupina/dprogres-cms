import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests (SF-024)
 *
 * Tests use the existing database - no schema recreation needed.
 * Each test creates its own test user with unique email.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Maximum time one test can run for */
  timeout: 60 * 1000,
  /* Run tests in files in parallel */
  fullyParallel: false, // Run sequentially to avoid race conditions
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Single worker to ensure sequential execution */
  workers: 1,
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording on first retry */
    video: 'on-first-retry',
  },

  /* Run only chromium for faster CI */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run local dev servers before starting the tests */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
    {
      command: 'cd ../backend && npm run dev',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  ],
});
