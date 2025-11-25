/**
 * Monthly Quota Reset Job (SF-011)
 *
 * Scheduled job that resets monthly API call quotas for all organizations
 * based on their configured timezone. Runs daily and checks which organizations
 * have reached their period_end.
 *
 * Features:
 * - Per-organization timezone support
 * - OpenTelemetry instrumentation for monitoring
 * - Configurable schedule via system_settings table
 * - Graceful start/stop for testing
 * - Event emission for quota warnings (SF-012)
 */

import * as cron from 'node-cron';
import { pool } from '../utils/database';
import { QuotaService } from '../services/QuotaService';
import { trace, context, SpanStatusCode } from '../config/telemetry';

const tracer = trace.getTracer('resetQuotasJob', '1.0.0');

/**
 * Interface for job configuration
 */
export interface ResetQuotasJobConfig {
  schedule?: string;  // Cron expression (default: '0 * * * *' - hourly at minute 0, max delay 1h)
  enabled?: boolean;  // Enable/disable job (default: true)
  timezone?: string;  // Job execution timezone (default: 'UTC')
}

/**
 * Result of quota reset operation
 */
export interface ResetQuotasResult {
  success: boolean;
  totalOrgsProcessed: number;
  totalQuotasReset: number;
  organizations: Array<{
    id: number;
    name: string;
    timezone: string;
    quotasReset: number;
  }>;
  timestamp: Date;
  durationMs: number;
  error?: string;
}

/**
 * Quota Reset Job Class
 *
 * Encapsulates the cron job logic with testability and observability
 */
export class ResetQuotasJob {
  private cronJob: cron.ScheduledTask | null = null;
  private quotaService: QuotaService;
  private config: Required<ResetQuotasJobConfig>;
  private isRunning: boolean = false;

  constructor(config: ResetQuotasJobConfig = {}) {
    this.config = {
      schedule: config.schedule || '0 * * * *',  // Hourly at minute 0 (reduces max delay from 23h to 1h)
      enabled: config.enabled !== false,          // Enabled by default
      timezone: config.timezone || 'UTC',
    };

    this.quotaService = new QuotaService();

    // Listen to quota service events for logging
    this.quotaService.on('quota:global_reset', (data) => {
      console.log(`[ResetQuotasJob] Global quota reset completed: ${data.rowsUpdated} quotas reset`);
    });
  }

  /**
   * Load configuration from system_settings table
   * Allows runtime configuration without restart
   */
  async loadConfigFromDatabase(): Promise<void> {
    const span = tracer.startSpan('resetQuotasJob.loadConfigFromDatabase');

    try {
      const { rows } = await pool.query(`
        SELECT setting_key, setting_value, setting_type
        FROM system_settings
        WHERE setting_key IN ('quota_reset_schedule', 'quota_reset_enabled', 'quota_reset_timezone')
      `);

      rows.forEach(row => {
        if (row.setting_key === 'quota_reset_schedule') {
          this.config.schedule = row.setting_value;
        } else if (row.setting_key === 'quota_reset_enabled') {
          this.config.enabled = row.setting_value === 'true';
        } else if (row.setting_key === 'quota_reset_timezone') {
          this.config.timezone = row.setting_value;
        }
      });

      span.setStatus({ code: SpanStatusCode.OK });
      console.log('[ResetQuotasJob] Configuration loaded:', this.config);
    } catch (error: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      console.error('[ResetQuotasJob] Failed to load config from database:', error);
      // Continue with default config
    } finally {
      span.end();
    }
  }

  /**
   * Execute quota reset operation
   * Called by cron scheduler or manually for testing
   */
  async execute(): Promise<ResetQuotasResult> {
    const startTime = Date.now();
    const span = tracer.startSpan('resetQuotasJob.execute', {
      attributes: {
        'job.schedule': this.config.schedule,
        'job.timezone': this.config.timezone,
      },
    });

    const ctx = trace.setSpan(context.active(), span);
    let acquiredLock = false;  // Track if this invocation acquired the lock

    try {
      if (this.isRunning) {
        const message = 'Job already running, skipping execution';
        span.addEvent('job.skipped', { reason: 'already_running' });
        console.warn(`[ResetQuotasJob] ${message}`);
        span.end();
        return {
          success: false,
          totalOrgsProcessed: 0,
          totalQuotasReset: 0,
          organizations: [],
          timestamp: new Date(),
          durationMs: Date.now() - startTime,
          error: message,
        };
      }

      this.isRunning = true;
      acquiredLock = true;  // Mark that we acquired the lock
      span.addEvent('job.started');
      console.log('[ResetQuotasJob] Starting quota reset job...');

      // Call enhanced database function with timezone support
      const { rows } = await context.with(ctx, async () => {
        return await pool.query('SELECT * FROM reset_monthly_quotas_with_timezone()');
      });

      const organizations = rows.map(row => ({
        id: row.organization_id,
        name: row.organization_name,
        timezone: row.timezone,
        quotasReset: row.rows_updated,
      }));

      const totalQuotasReset = organizations.reduce((sum, org) => sum + org.quotasReset, 0);
      const totalOrgsProcessed = organizations.length;

      // Add span attributes
      span.setAttributes({
        'job.orgs_processed': totalOrgsProcessed,
        'job.quotas_reset': totalQuotasReset,
      });

      span.addEvent('job.completed', {
        'orgs_processed': totalOrgsProcessed,
        'quotas_reset': totalQuotasReset,
      });

      span.setStatus({ code: SpanStatusCode.OK });

      const result: ResetQuotasResult = {
        success: true,
        totalOrgsProcessed,
        totalQuotasReset,
        organizations,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
      };

      console.log(`[ResetQuotasJob] ✅ Quota reset completed successfully:`);
      console.log(`  - Organizations processed: ${totalOrgsProcessed}`);
      console.log(`  - Total quotas reset: ${totalQuotasReset}`);
      console.log(`  - Duration: ${result.durationMs}ms`);

      if (organizations.length > 0) {
        console.log('  - Details:');
        organizations.forEach(org => {
          console.log(`    • ${org.name} (${org.timezone}): ${org.quotasReset} quotas reset`);
        });
      }

      return result;

    } catch (error: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);

      console.error('[ResetQuotasJob] ❌ Error executing quota reset:', error);

      return {
        success: false,
        totalOrgsProcessed: 0,
        totalQuotasReset: 0,
        organizations: [],
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        error: error.message,
      };
    } finally {
      // Only release the lock if this invocation acquired it
      if (acquiredLock) {
        this.isRunning = false;
      }
      span.end();
    }
  }

  /**
   * Start the cron job scheduler
   */
  async start(): Promise<void> {
    if (this.cronJob) {
      console.log('[ResetQuotasJob] Job already started');
      return;
    }

    // Load config from database first (before checking enabled flag)
    await this.loadConfigFromDatabase();

    if (!this.config.enabled) {
      console.log('[ResetQuotasJob] Job is disabled via configuration');
      return;
    }

    // Validate cron expression
    if (!cron.validate(this.config.schedule)) {
      console.error(`[ResetQuotasJob] Invalid cron schedule: ${this.config.schedule}`);
      return;
    }

    // Create cron job
    this.cronJob = cron.schedule(
      this.config.schedule,
      () => {
        console.log(`[ResetQuotasJob] Triggered at ${new Date().toISOString()}`);
        this.execute().catch(error => {
          console.error('[ResetQuotasJob] Unexpected error during execution:', error);
        });
      },
      {
        timezone: this.config.timezone,
      }
    );

    // Start the job immediately after scheduling
    this.cronJob.start();

    console.log(`[ResetQuotasJob] ✅ Started with schedule: ${this.config.schedule} (${this.config.timezone})`);
    console.log(`[ResetQuotasJob] Next execution: ${this.getNextExecutionTime()}`);
  }

  /**
   * Stop the cron job scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[ResetQuotasJob] Stopped');
    }
  }

  /**
   * Get next execution time (for monitoring/debugging)
   */
  getNextExecutionTime(): string | null {
    // node-cron doesn't expose next execution time directly
    // This is a simplified implementation
    if (!this.cronJob) {
      return null;
    }
    return 'Next execution calculated by cron scheduler';
  }

  /**
   * Check if job is currently running
   */
  isJobRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ResetQuotasJobConfig> {
    return { ...this.config };
  }
}

// Export singleton instance for server integration
let jobInstance: ResetQuotasJob | null = null;

/**
 * Get or create job instance
 */
export function getResetQuotasJobInstance(config?: ResetQuotasJobConfig): ResetQuotasJob {
  if (!jobInstance) {
    jobInstance = new ResetQuotasJob(config);
  }
  return jobInstance;
}

/**
 * Start quota reset job (called from server)
 */
export async function startResetQuotasJob(config?: ResetQuotasJobConfig): Promise<void> {
  const job = getResetQuotasJobInstance(config);
  await job.start();
}

/**
 * Stop quota reset job (called on server shutdown)
 */
export function stopResetQuotasJob(): void {
  if (jobInstance) {
    jobInstance.stop();
    jobInstance = null;
  }
}
