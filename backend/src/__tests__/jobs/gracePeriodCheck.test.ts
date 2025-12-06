import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the subscription lifecycle service
const mockProcessExpirations = jest.fn<any>();
const mockCheckWarnings = jest.fn<any>();

jest.mock('../../services/SubscriptionLifecycleService', () => ({
  subscriptionLifecycleService: {
    processGracePeriodExpirations: mockProcessExpirations,
    checkGracePeriodWarnings: mockCheckWarnings,
  },
  GRACE_PERIOD_DAYS: 7,
}));

// Import after mocks
import { runGracePeriodCheck, startGracePeriodJob, createGracePeriodJob } from '../../jobs/gracePeriodCheck';

describe('gracePeriodCheck Job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runGracePeriodCheck', () => {
    it('should process both expirations and warnings', async () => {
      mockProcessExpirations.mockResolvedValueOnce({
        success: true,
        data: [
          { organizationId: 1, subscriptionId: 1, daysInGracePeriod: 8, shouldCancel: true },
          { organizationId: 2, subscriptionId: 2, daysInGracePeriod: 10, shouldCancel: true },
        ],
      });

      mockCheckWarnings.mockResolvedValueOnce({
        success: true,
        data: 3,
      });

      const result = await runGracePeriodCheck();

      expect(result.expirations).toBe(2);
      expect(result.warnings).toBe(3);
      expect(result.errors.length).toBe(0);
      expect(mockProcessExpirations).toHaveBeenCalled();
      expect(mockCheckWarnings).toHaveBeenCalled();
    });

    it('should handle expiration processing errors', async () => {
      mockProcessExpirations.mockResolvedValueOnce({
        success: false,
        error: 'Database connection failed',
      });

      mockCheckWarnings.mockResolvedValueOnce({
        success: true,
        data: 1,
      });

      const result = await runGracePeriodCheck();

      expect(result.expirations).toBe(0);
      expect(result.warnings).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Database connection failed');
    });

    it('should handle warning processing errors', async () => {
      mockProcessExpirations.mockResolvedValueOnce({
        success: true,
        data: [],
      });

      mockCheckWarnings.mockResolvedValueOnce({
        success: false,
        error: 'Email service unavailable',
      });

      const result = await runGracePeriodCheck();

      expect(result.expirations).toBe(0);
      expect(result.warnings).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Email service unavailable');
    });

    it('should handle exceptions gracefully', async () => {
      mockProcessExpirations.mockRejectedValueOnce(new Error('Unexpected error'));

      mockCheckWarnings.mockResolvedValueOnce({
        success: true,
        data: 0,
      });

      const result = await runGracePeriodCheck();

      expect(result.expirations).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Unexpected error');
    });

    it('should return zero counts when no subscriptions to process', async () => {
      mockProcessExpirations.mockResolvedValueOnce({
        success: true,
        data: [],
      });

      mockCheckWarnings.mockResolvedValueOnce({
        success: true,
        data: 0,
      });

      const result = await runGracePeriodCheck();

      expect(result.expirations).toBe(0);
      expect(result.warnings).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('createGracePeriodJob', () => {
    it('should create a CronJob with custom expression', () => {
      const job = createGracePeriodJob('0 * * * *'); // Every hour

      expect(job).toBeDefined();
      expect(typeof job.start).toBe('function');
      expect(typeof job.stop).toBe('function');
    });

    it('should be stoppable after creation', () => {
      const job = createGracePeriodJob('0 * * * *');

      // CronJob can be stopped (it was created but not started)
      expect(() => job.stop()).not.toThrow();
    });
  });

  describe('startGracePeriodJob', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return null when disabled via environment variable', () => {
      process.env.DISABLE_GRACE_PERIOD_JOB = 'true';

      // Need to re-import to pick up env change
      jest.resetModules();
      const { startGracePeriodJob: freshStart } = require('../../jobs/gracePeriodCheck');

      const job = freshStart();
      expect(job).toBeNull();
    });
  });
});
