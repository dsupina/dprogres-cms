import { FullConfig } from '@playwright/test';

/**
 * Global teardown for E2E tests (SF-024)
 *
 * Runs once after all tests. Used for:
 * - Database cleanup
 * - Resource cleanup
 * - Report generation
 */
async function globalTeardown(config: FullConfig): Promise<void> {
  console.log('Running E2E test teardown...');

  // Cleanup test data if needed
  // Note: In production, this would clean up test users/orgs created during tests
  // For now, we rely on unique email generation to avoid conflicts

  console.log('E2E test teardown complete.');
}

export default globalTeardown;
