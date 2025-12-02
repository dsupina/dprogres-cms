/**
 * Monthly Quota Reset Cron Job
 * SF-011: Resets API call quotas when monthly billing period expires
 *
 * Features:
 * - Runs daily at configurable time (default: 00:00 UTC)
 * - Only resets expired periods (period_end < NOW())
 * - Advances period_end by 1 month to prevent repeated resets
 * - OpenTelemetry instrumentation for monitoring
 * - Retry logic with exponential backoff
 * - Graceful error handling
 */

import { CronJob } from 'cron';
import { quotaService } from '../services/QuotaService';
import { trace, context, SpanStatusCode } from '../config/telemetry';

// Configuration - static values only
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000; // 5 seconds base delay

// Dynamic config getters - read env vars at call time for testability and runtime changes
const getSchedule = (): string => process.env.QUOTA_RESET_SCHEDULE || '0 0 * * *'; // Daily at 00:00 UTC
const isEnabled = (): boolean => process.env.QUOTA_RESET_ENABLED !== 'false'; // Enabled by default
const getRetryDelay = (): number => {
  const envDelay = process.env.QUOTA_RESET_RETRY_DELAY_MS;
  return envDelay ? parseInt(envDelay, 10) : DEFAULT_RETRY_DELAY_MS;
};

// Get tracer for manual instrumentation
const tracer = trace.getTracer('quota-reset-job');

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute quota reset with retry logic and OTEL tracing
 * Exported for direct testing (bypasses cron's async handling)
 */
export async function executeQuotaReset(): Promise<void> {
  const span = tracer.startSpan('quota_reset.execute');
  const ctx = trace.setSpan(context.active(), span);

  try {
    console.log('[QuotaReset] Starting monthly quota reset job...');
    span.addEvent('job_started');

    let lastError: Error | null = null;
    let attempt = 0;

    // Retry loop
    while (attempt < MAX_RETRIES) {
      attempt++;
      const attemptSpan = tracer.startSpan(
        'quota_reset.attempt',
        {
          attributes: {
            'quota.reset.attempt': attempt,
            'quota.reset.max_retries': MAX_RETRIES,
          },
        },
        ctx
      );

      try {
        console.log(`[QuotaReset] Attempt ${attempt}/${MAX_RETRIES}...`);
        attemptSpan.addEvent('attempt_started', { attempt });

        // Call QuotaService to reset all monthly quotas
        const result = await quotaService.resetAllMonthlyQuotas();

        if (!result.success) {
          throw new Error(result.error || 'Failed to reset quotas');
        }

        const rowsUpdated = result.data || 0;

        console.log(`[QuotaReset] Successfully reset ${rowsUpdated} quota records`);
        attemptSpan.setAttributes({
          'quota.reset.rows_updated': rowsUpdated,
          'quota.reset.success': true,
        });
        attemptSpan.addEvent('reset_completed', {
          rows_updated: rowsUpdated,
        });
        attemptSpan.setStatus({ code: SpanStatusCode.OK });
        attemptSpan.end();

        span.setAttributes({
          'quota.reset.final_attempt': attempt,
          'quota.reset.rows_updated': rowsUpdated,
          'quota.reset.success': true,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        return; // Success - exit retry loop
      } catch (error: any) {
        lastError = error;
        console.error(`[QuotaReset] Attempt ${attempt} failed:`, error.message);

        attemptSpan.setAttributes({
          'quota.reset.error': error.message,
          'quota.reset.success': false,
        });
        attemptSpan.recordException(error);
        attemptSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        attemptSpan.end();

        if (attempt < MAX_RETRIES) {
          // Exponential backoff: delay = base * 2^(attempt-1)
          const baseDelay = getRetryDelay();
          const delayMs = baseDelay * Math.pow(2, attempt - 1);
          console.log(`[QuotaReset] Retrying in ${delayMs}ms...`);
          await sleep(delayMs);
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to reset quotas after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`
    );
  } catch (error: any) {
    console.error('[QuotaReset] Job failed after all retries:', error);
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.setAttributes({
      'quota.reset.final_status': 'failed',
      'quota.reset.error': error.message,
    });
    span.end();

    // Don't throw - let cron continue running for next scheduled execution
  }
}

/**
 * Create and configure the cron job
 */
export function createQuotaResetJob(): CronJob | null {
  // Read env vars at call time for testability and runtime configuration
  const schedule = getSchedule();
  const enabled = isEnabled();

  if (!enabled) {
    console.log('[QuotaReset] Job disabled via QUOTA_RESET_ENABLED=false');
    return null;
  }

  console.log(`[QuotaReset] Initializing cron job with schedule: ${schedule}`);

  const job = new CronJob(
    schedule,
    async () => {
      await executeQuotaReset();
    },
    null, // onComplete callback
    false, // Don't start automatically (caller decides)
    'UTC' // Timezone - always run in UTC for consistency
  );

  console.log('[QuotaReset] Job created successfully');
  console.log(`[QuotaReset] Next execution: ${job.nextDate().toISO()}`);

  return job;
}

/**
 * Start the quota reset job
 * Returns the job instance for testing/management
 */
export function startQuotaResetJob(): CronJob | null {
  const job = createQuotaResetJob();

  if (!job) {
    return null;
  }

  job.start();
  console.log('[QuotaReset] Job started');
  console.log(`[QuotaReset] Schedule: ${getSchedule()} (UTC)`);
  console.log(`[QuotaReset] Next run: ${job.nextDate().toISO()}`);

  return job;
}
