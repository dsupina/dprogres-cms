/**
 * Grace Period Check Job
 * SF-016: Subscription Lifecycle Management
 *
 * This job runs daily to:
 * 1. Check subscriptions that have been in past_due status for 7+ days
 * 2. Cancel expired subscriptions and downgrade organizations to free tier
 * 3. Send warning emails to subscriptions approaching grace period expiry (3 days remaining)
 *
 * Schedule: Daily at 3:00 AM UTC (off-peak hours)
 * Cron: '0 3 * * *'
 */

import { CronJob } from 'cron';
import { subscriptionLifecycleService, GRACE_PERIOD_DAYS } from '../services/SubscriptionLifecycleService';

/**
 * Cron expression for daily execution at 3:00 AM UTC
 * Format: second minute hour day-of-month month day-of-week
 */
const GRACE_PERIOD_CHECK_CRON = '0 3 * * *';

/**
 * Environment variable to disable the job (useful for testing)
 */
const isJobEnabled = process.env.DISABLE_GRACE_PERIOD_JOB !== 'true';

/**
 * Run the grace period check job
 * Exported for manual invocation and testing
 */
export async function runGracePeriodCheck(): Promise<{
  expirations: number;
  warnings: number;
  errors: string[];
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  let expirations = 0;
  let warnings = 0;

  console.log(`[GracePeriodJob] Starting grace period check...`);
  console.log(`[GracePeriodJob] Grace period: ${GRACE_PERIOD_DAYS} days`);

  // Step 1: Process expired grace periods (7+ days past_due)
  try {
    const expirationsResult = await subscriptionLifecycleService.processGracePeriodExpirations();

    if (expirationsResult.success && expirationsResult.data) {
      expirations = expirationsResult.data.length;

      for (const result of expirationsResult.data) {
        console.log(
          `[GracePeriodJob] Canceled subscription ${result.subscriptionId} ` +
          `for org ${result.organizationId} after ${result.daysInGracePeriod} days`
        );
      }
    } else if (expirationsResult.error) {
      errors.push(`Expiration processing: ${expirationsResult.error}`);
      console.error(`[GracePeriodJob] Error processing expirations: ${expirationsResult.error}`);
    }
  } catch (error: any) {
    errors.push(`Expiration processing exception: ${error.message}`);
    console.error(`[GracePeriodJob] Exception processing expirations:`, error);
  }

  // Step 2: Send warning emails (3 days before expiry)
  try {
    const warningsResult = await subscriptionLifecycleService.checkGracePeriodWarnings();

    if (warningsResult.success && warningsResult.data !== undefined) {
      warnings = warningsResult.data;
      console.log(`[GracePeriodJob] Sent ${warnings} grace period warning emails`);
    } else if (warningsResult.error) {
      errors.push(`Warning processing: ${warningsResult.error}`);
      console.error(`[GracePeriodJob] Error processing warnings: ${warningsResult.error}`);
    }
  } catch (error: any) {
    errors.push(`Warning processing exception: ${error.message}`);
    console.error(`[GracePeriodJob] Exception processing warnings:`, error);
  }

  const duration = Date.now() - startTime;
  console.log(
    `[GracePeriodJob] Completed in ${duration}ms. ` +
    `Expirations: ${expirations}, Warnings: ${warnings}, Errors: ${errors.length}`
  );

  return { expirations, warnings, errors };
}

/**
 * Start the grace period check cron job
 * @returns The CronJob instance, or null if disabled
 */
export function startGracePeriodJob(): CronJob | null {
  if (!isJobEnabled) {
    console.log('[GracePeriodJob] Job is disabled via DISABLE_GRACE_PERIOD_JOB environment variable');
    return null;
  }

  const job = new CronJob(
    GRACE_PERIOD_CHECK_CRON,
    async () => {
      try {
        await runGracePeriodCheck();
      } catch (error: any) {
        console.error('[GracePeriodJob] Unhandled error in job execution:', error);
      }
    },
    null, // onComplete
    true, // start immediately
    'UTC' // timezone
  );

  console.log(`[GracePeriodJob] Scheduled for daily execution at 3:00 AM UTC`);
  // CronJob uses nextDates() (plural) which returns an array
  const nextRuns = job.nextDates(1);
  if (nextRuns && nextRuns.length > 0) {
    console.log(`[GracePeriodJob] Next run: ${nextRuns[0].toISO()}`);
  }

  return job;
}

/**
 * Create a grace period job with custom cron expression (for testing)
 * @param cronExpression - Custom cron expression
 * @returns The CronJob instance
 */
export function createGracePeriodJob(cronExpression: string): CronJob {
  return new CronJob(
    cronExpression,
    async () => {
      try {
        await runGracePeriodCheck();
      } catch (error: any) {
        console.error('[GracePeriodJob] Unhandled error in job execution:', error);
      }
    },
    null,
    false, // don't start automatically
    'UTC'
  );
}
