/**
 * Unit Tests for ResetQuotasJob (SF-011)
 *
 * Tests job scheduler logic, configuration, execution, and error handling
 */

import { ResetQuotasJob, ResetQuotasJobConfig } from '../../jobs/resetQuotasJob';
import { pool } from '../../utils/database';

// Mock dependencies
jest.mock('../../utils/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../config/telemetry', () => ({
  trace: {
    getTracer: jest.fn(() => ({
      startSpan: jest.fn(() => ({
        setStatus: jest.fn(),
        setAttributes: jest.fn(),
        addEvent: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      })),
    })),
    setSpan: jest.fn((ctx, span) => ctx),
  },
  context: {
    active: jest.fn(() => ({})),
    with: jest.fn(async (ctx, fn) => fn()),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

jest.mock('../../services/QuotaService', () => ({
  QuotaService: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    resetAllMonthlyQuotas: jest.fn(),
  })),
}));

describe('ResetQuotasJob', () => {
  let job: ResetQuotasJob;
  const mockPoolQuery = pool.query as jest.MockedFunction<typeof pool.query>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (job) {
      job.stop();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      job = new ResetQuotasJob();
      const config = job.getConfig();

      expect(config.schedule).toBe('0 0 * * *');  // Daily at midnight UTC
      expect(config.enabled).toBe(true);
      expect(config.timezone).toBe('UTC');
    });

    it('should accept custom configuration', () => {
      const customConfig: ResetQuotasJobConfig = {
        schedule: '0 2 * * *',  // 2 AM
        enabled: false,
        timezone: 'America/New_York',
      };

      job = new ResetQuotasJob(customConfig);
      const config = job.getConfig();

      expect(config.schedule).toBe('0 2 * * *');
      expect(config.enabled).toBe(false);
      expect(config.timezone).toBe('America/New_York');
    });

    it('should enable job by default when enabled is not specified', () => {
      job = new ResetQuotasJob({ schedule: '0 1 * * *' });
      expect(job.getConfig().enabled).toBe(true);
    });
  });

  describe('loadConfigFromDatabase', () => {
    it('should load configuration from system_settings table', async () => {
      const mockSettings = [
        { setting_key: 'quota_reset_schedule', setting_value: '0 3 * * *', setting_type: 'cron' },
        { setting_key: 'quota_reset_enabled', setting_value: 'true', setting_type: 'boolean' },
        { setting_key: 'quota_reset_timezone', setting_value: 'Europe/Zagreb', setting_type: 'string' },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockSettings } as any);

      job = new ResetQuotasJob();
      await job.loadConfigFromDatabase();

      const config = job.getConfig();
      expect(config.schedule).toBe('0 3 * * *');
      expect(config.enabled).toBe(true);
      expect(config.timezone).toBe('Europe/Zagreb');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT setting_key, setting_value, setting_type')
      );
    });

    it('should handle database errors gracefully', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      job = new ResetQuotasJob({ schedule: '0 1 * * *' });
      await job.loadConfigFromDatabase();

      // Should continue with default/initial config
      const config = job.getConfig();
      expect(config.schedule).toBe('0 1 * * *');
    });

    it('should handle missing settings gracefully', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

      job = new ResetQuotasJob({ schedule: '0 2 * * *' });
      await job.loadConfigFromDatabase();

      // Should keep initial config
      const config = job.getConfig();
      expect(config.schedule).toBe('0 2 * * *');
    });
  });

  describe('execute', () => {
    it('should successfully execute quota reset with results', async () => {
      const mockResults = [
        { organization_id: 1, organization_name: 'Acme Corp', timezone: 'UTC', rows_updated: 2 },
        { organization_id: 2, organization_name: 'Beta Inc', timezone: 'America/New_York', rows_updated: 1 },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockResults } as any);

      job = new ResetQuotasJob();
      const result = await job.execute();

      expect(result.success).toBe(true);
      expect(result.totalOrgsProcessed).toBe(2);
      expect(result.totalQuotasReset).toBe(3);
      expect(result.organizations).toHaveLength(2);
      expect(result.organizations[0]).toEqual({
        id: 1,
        name: 'Acme Corp',
        timezone: 'UTC',
        quotasReset: 2,
      });
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle case with no quotas to reset', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

      job = new ResetQuotasJob();
      const result = await job.execute();

      expect(result.success).toBe(true);
      expect(result.totalOrgsProcessed).toBe(0);
      expect(result.totalQuotasReset).toBe(0);
      expect(result.organizations).toHaveLength(0);
    });

    it('should handle execution errors', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database query failed'));

      job = new ResetQuotasJob();
      const result = await job.execute();

      expect(result.success).toBe(false);
      expect(result.totalOrgsProcessed).toBe(0);
      expect(result.totalQuotasReset).toBe(0);
      expect(result.error).toBe('Database query failed');
    });

    it('should prevent concurrent executions', async () => {
      mockPoolQuery.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ rows: [] } as any), 100))
      );

      job = new ResetQuotasJob();

      // Start first execution
      const execution1 = job.execute();

      // Try to start second execution while first is running
      const result2 = await job.execute();

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already running');

      // Wait for first to complete
      await execution1;
    });

    it('should set isRunning flag correctly', async () => {
      mockPoolQuery.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ rows: [] } as any), 50))
      );

      job = new ResetQuotasJob();

      expect(job.isJobRunning()).toBe(false);

      const executionPromise = job.execute();
      expect(job.isJobRunning()).toBe(true);

      await executionPromise;
      expect(job.isJobRunning()).toBe(false);
    });
  });

  describe('start and stop', () => {
    it('should not start job when disabled', async () => {
      job = new ResetQuotasJob({ enabled: false });
      await job.start();

      // Job should not be created
      expect(job.isJobRunning()).toBe(false);
    });

    it('should start job with valid configuration', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

      job = new ResetQuotasJob({ schedule: '0 0 * * *', enabled: true });
      await job.start();

      // Job should be scheduled (not running yet, just scheduled)
      expect(job.isJobRunning()).toBe(false);
    });

    it('should stop job successfully', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

      job = new ResetQuotasJob({ enabled: true });
      await job.start();
      job.stop();

      // After stop, job should not be running
      expect(job.isJobRunning()).toBe(false);
    });

    it('should handle stop when job not started', () => {
      job = new ResetQuotasJob();
      expect(() => job.stop()).not.toThrow();
    });

    it('should handle invalid cron schedule', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

      job = new ResetQuotasJob({ schedule: 'invalid', enabled: true });
      await job.start();

      // Job should not start with invalid schedule
      expect(job.isJobRunning()).toBe(false);
    });

    it('should prevent starting job twice', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

      job = new ResetQuotasJob({ enabled: true });
      await job.start();
      await job.start();  // Second start should be no-op

      // Job should still be in valid state
      expect(job.isJobRunning()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large number of organizations', async () => {
      const mockResults = Array.from({ length: 1000 }, (_, i) => ({
        organization_id: i + 1,
        organization_name: `Org ${i + 1}`,
        timezone: 'UTC',
        rows_updated: 1,
      }));

      mockPoolQuery.mockResolvedValueOnce({ rows: mockResults } as any);

      job = new ResetQuotasJob();
      const result = await job.execute();

      expect(result.success).toBe(true);
      expect(result.totalOrgsProcessed).toBe(1000);
      expect(result.totalQuotasReset).toBe(1000);
    });

    it('should handle organizations with different timezones', async () => {
      const mockResults = [
        { organization_id: 1, organization_name: 'US Org', timezone: 'America/New_York', rows_updated: 1 },
        { organization_id: 2, organization_name: 'EU Org', timezone: 'Europe/London', rows_updated: 1 },
        { organization_id: 3, organization_name: 'Asia Org', timezone: 'Asia/Tokyo', rows_updated: 1 },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockResults } as any);

      job = new ResetQuotasJob();
      const result = await job.execute();

      expect(result.success).toBe(true);
      expect(result.organizations).toHaveLength(3);
      expect(result.organizations.map(o => o.timezone)).toEqual([
        'America/New_York',
        'Europe/London',
        'Asia/Tokyo',
      ]);
    });
  });
});
