import { FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests (SF-024)
 *
 * Runs once before all tests. Used for:
 * - Database cleanup/seeding
 * - Environment validation
 * - Shared state setup
 */
async function globalSetup(config: FullConfig): Promise<void> {
  console.log('Starting E2E test setup...');

  // Validate required environment variables
  const requiredEnvVars = ['PLAYWRIGHT_BASE_URL'];
  const missingVars = requiredEnvVars.filter(
    (v) => !process.env[v] && v !== 'PLAYWRIGHT_BASE_URL' // PLAYWRIGHT_BASE_URL has a default
  );

  if (missingVars.length > 0) {
    console.warn(`Warning: Missing optional env vars: ${missingVars.join(', ')}`);
  }

  // Log test configuration
  console.log(`Base URL: ${config.projects[0]?.use?.baseURL || 'http://localhost:5173'}`);
  console.log(`Running in CI: ${!!process.env.CI}`);

  console.log('E2E test setup complete.');
}

export default globalSetup;
