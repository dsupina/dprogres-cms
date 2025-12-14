/**
 * Job Scheduler Index
 * SF-011: Centralized job initialization and management
 * SF-016: Added grace period check job
 *
 * This module initializes and starts all background jobs:
 * - Quota reset job (monthly API call quota resets)
 * - Grace period check job (daily subscription lifecycle checks)
 */

import { CronJob } from 'cron';
import { startQuotaResetJob } from './resetQuotas';
import { startGracePeriodJob } from './gracePeriodCheck';

export interface JobManager {
  quotaResetJob: CronJob | null;
  gracePeriodJob: CronJob | null;
}

/**
 * Initialize and start all background jobs
 * Call this after the application has fully initialized
 */
export function startAllJobs(): JobManager {
  console.log('[Jobs] Initializing background jobs...');

  const jobs: JobManager = {
    quotaResetJob: null,
    gracePeriodJob: null,
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

  // Start grace period check job (SF-016)
  try {
    jobs.gracePeriodJob = startGracePeriodJob();
    if (jobs.gracePeriodJob) {
      console.log('[Jobs] ✓ Grace period check job started');
    } else {
      console.log('[Jobs] ⊘ Grace period check job disabled');
    }
  } catch (error: any) {
    console.error('[Jobs] ✗ Failed to start grace period check job:', error.message);
  }

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

  if (jobs.gracePeriodJob) {
    jobs.gracePeriodJob.stop();
    console.log('[Jobs] ✓ Grace period check job stopped');
  }

  console.log('[Jobs] All jobs stopped');
}
