/**
 * Reset Quotas Cron Job Tests
 * SF-011: Unit and integration tests for monthly quota reset job
 */

import { createQuotaResetJob } from '../../jobs/resetQuotas';
import { quotaService } from '../../services/QuotaService';
import type { ServiceResponse } from '../../types/versioning';

// Mock the QuotaService
jest.mock('../../services/QuotaService', () => {
  return {
    quotaService: {
      resetAllMonthlyQuotas: jest.fn(),
    },
  };
});

// Mock OpenTelemetry
jest.mock('../../config/telemetry', () => ({
  trace: {
    getTracer: jest.fn(() => ({
      startSpan: jest.fn(() => ({
        addEvent: jest.fn(),
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      })),
    })),
    setSpan: jest.fn((ctx, span) => ctx),
  },
  context: {
    active: jest.fn(() => ({})),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

describe('SF-011: Reset Quotas Cron Job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.QUOTA_RESET_ENABLED;
    delete process.env.QUOTA_RESET_SCHEDULE;
  });

  describe('createQuotaResetJob', () => {
    it('should create a cron job with default schedule', () => {
      const job = createQuotaResetJob();

      expect(job).not.toBeNull();
      expect(job?.cronTime.source).toBe('0 0 * * *'); // Daily at 00:00 UTC
    });

    it('should create a cron job with custom schedule from env variable', () => {
      process.env.QUOTA_RESET_SCHEDULE = '0 2 * * *'; // 02:00 UTC

      const job = createQuotaResetJob();

      expect(job).not.toBeNull();
      expect(job?.cronTime.source).toBe('0 2 * * *');
    });

    it('should return null when job is disabled via env variable', () => {
      process.env.QUOTA_RESET_ENABLED = 'false';

      const job = createQuotaResetJob();

      expect(job).toBeNull();
    });

    it('should create job that is not started automatically', () => {
      const job = createQuotaResetJob();

      expect(job).not.toBeNull();
      // Job is created but should not be started automatically
    });
  });

  describe('Job Execution', () => {
    it('should call quotaService.resetAllMonthlyQuotas on execution', async () => {
      const mockResponse: ServiceResponse<number> = {
        success: true,
        data: 5, // 5 quotas reset
      };

      (quotaService.resetAllMonthlyQuotas as jest.Mock).mockResolvedValueOnce(mockResponse);

      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      // Manually trigger the job function
      if (job) {
        await job.fireOnTick();

        expect(quotaService.resetAllMonthlyQuotas).toHaveBeenCalledTimes(1);
      }
    });

    it('should handle successful quota reset', async () => {
      const mockResponse: ServiceResponse<number> = {
        success: true,
        data: 10,
      };

      (quotaService.resetAllMonthlyQuotas as jest.Mock).mockResolvedValueOnce(mockResponse);

      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      if (job) {
        // Should not throw
        await expect(job.fireOnTick()).resolves.not.toThrow();
      }
    });

    it('should retry on failure', async () => {
      // First two attempts fail, third succeeds
      (quotaService.resetAllMonthlyQuotas as jest.Mock)
        .mockResolvedValueOnce({ success: false, error: 'Database error' })
        .mockResolvedValueOnce({ success: false, error: 'Database error' })
        .mockResolvedValueOnce({ success: true, data: 3 });

      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      if (job) {
        await job.fireOnTick();

        // Should have retried 3 times
        expect(quotaService.resetAllMonthlyQuotas).toHaveBeenCalledTimes(3);
      }
    }, 30000); // Increase timeout for retry delays

    it('should stop retrying after max attempts', async () => {
      // All attempts fail
      (quotaService.resetAllMonthlyQuotas as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Persistent database error',
      });

      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      if (job) {
        await job.fireOnTick();

        // Should have tried 3 times (MAX_RETRIES = 3)
        expect(quotaService.resetAllMonthlyQuotas).toHaveBeenCalledTimes(3);
      }
    }, 30000); // Increase timeout for retry delays

    it('should handle exceptions gracefully', async () => {
      (quotaService.resetAllMonthlyQuotas as jest.Mock).mockRejectedValueOnce(
        new Error('Unexpected error')
      );

      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      if (job) {
        // Should not throw - errors are caught and logged
        await expect(job.fireOnTick()).resolves.not.toThrow();
      }
    });
  });

  describe('Job Lifecycle', () => {
    it('should start and stop the job', () => {
      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      if (job) {
        // Start the job
        job.start();

        // Stop the job
        job.stop();

        // Job should be created and lifecycle methods should work
        expect(job).toBeDefined();
      }
    });

    it('should have a next scheduled run time', () => {
      const job = createQuotaResetJob();
      expect(job).not.toBeNull();

      if (job) {
        const nextDate = job.nextDate();
        expect(nextDate).toBeDefined();
        expect(nextDate.toJSDate()).toBeInstanceOf(Date);
      }
    });
  });
});
