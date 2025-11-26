/**
 * Job Scheduler Index
 * SF-011: Centralized job initialization and management
 *
 * This module initializes and starts all background jobs:
 * - Quota reset job (monthly API call quota resets)
 * - (Future jobs will be added here)
 */

import { CronJob } from 'cron';
import { startQuotaResetJob } from './resetQuotas';

export interface JobManager {
  quotaResetJob: CronJob | null;
  // Future jobs will be added here
}

/**
 * Initialize and start all background jobs
 * Call this after the application has fully initialized
 */
export function startAllJobs(): JobManager {
  console.log('[Jobs] Initializing background jobs...');

  const jobs: JobManager = {
    quotaResetJob: null,
  };

  // Start quota reset job
  try {
    jobs.quotaResetJob = startQuotaResetJob();
    if (jobs.quotaResetJob) {
      console.log('[Jobs] ✓ Quota reset job started');
    } else {
      console.log('[Jobs] ⊘ Quota reset job disabled');
    }
  } catch (error: any) {
    console.error('[Jobs] ✗ Failed to start quota reset job:', error.message);
  }

  // Future jobs initialization will be added here

  console.log('[Jobs] Background jobs initialization complete');

  return jobs;
}

/**
 * Stop all running jobs gracefully
 * Call this during application shutdown
 */
export function stopAllJobs(jobs: JobManager): void {
  console.log('[Jobs] Stopping background jobs...');

  if (jobs.quotaResetJob) {
    jobs.quotaResetJob.stop();
    console.log('[Jobs] ✓ Quota reset job stopped');
  }

  // Future job cleanup will be added here

  console.log('[Jobs] All jobs stopped');
}
