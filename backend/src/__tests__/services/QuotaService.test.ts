import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock function instances
const mockPoolQuery: any = jest.fn();
const mockPoolConnect: any = jest.fn();
const mockClientQuery: any = jest.fn();
const mockClientRelease: any = jest.fn();

// Mock database pool
jest.mock('../../utils/database', () => ({
  pool: {
    query: mockPoolQuery,
    connect: mockPoolConnect,
  },
}));

// Import after mocks are defined
import { QuotaService } from '../../services/QuotaService';

describe('QuotaService', () => {
  let quotaService: QuotaService;

  beforeEach(() => {
    jest.clearAllMocks();
    quotaService = new QuotaService();

    // Default mock client
    mockClientQuery.mockResolvedValue({ rows: [] });
    mockClientRelease.mockResolvedValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  describe('checkQuota', () => {
    it('should return allowed true when within quota', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 50, quota_limit: 100 }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data?.allowed).toBe(true);
      expect(result.data?.current).toBe(50);
      expect(result.data?.limit).toBe(100);
      expect(result.data?.remaining).toBe(50);
      expect(result.data?.percentage_used).toBe(50);
    });

    it('should return allowed false when exceeding quota', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 95, quota_limit: 100 }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data?.allowed).toBe(false);
      expect(result.data?.current).toBe(95);
      expect(result.data?.remaining).toBe(5);
    });

    it('should return error when quota record not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await quotaService.checkQuota({
        organizationId: 999,
        dimension: 'sites',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No quota record found');
    });

    it('should default amount to 1 when not provided', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 50, quota_limit: 100 }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'posts',
      });

      expect(result.success).toBe(true);
      expect(result.data?.allowed).toBe(true);
    });

    it('should handle exact quota limit', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 99, quota_limit: 100 }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'posts',
        amount: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.allowed).toBe(true);
      expect(result.data?.remaining).toBe(1);
    });

    it('should calculate percentage used correctly', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 750, quota_limit: 1000 }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'api_calls',
      });

      expect(result.success).toBe(true);
      expect(result.data?.percentage_used).toBe(75);
    });
  });

  describe('incrementQuota', () => {
    it('should increment quota successfully when within limit', async () => {
      // Mock database function call
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      // Mock getQuotaStatusForDimension call
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'sites',
            current_usage: 51,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:incremented', eventSpy);

      const result = await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should return error when quota exceeded', async () => {
      // Mock database function returning false
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: false }],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:exceeded', eventSpy);

      const result = await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Quota exceeded');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          dimension: 'sites',
        })
      );
    });

    it('should emit approaching_limit event at 80% threshold', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:approaching_limit', eventSpy);

      await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'posts',
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 80,
          dimension: 'posts',
        })
      );
    });

    it('should emit approaching_limit event at 90% threshold', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 92,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:approaching_limit', eventSpy);

      await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'posts',
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 90,
          dimension: 'posts',
        })
      );
    });

    it('should emit approaching_limit event at 95% threshold', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 97,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:approaching_limit', eventSpy);

      await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'posts',
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 95,
          dimension: 'posts',
        })
      );
    });
  });

  describe('decrementQuota', () => {
    it('should decrement quota successfully', async () => {
      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 50 }],
      }); // SELECT FOR UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // COMMIT

      const eventSpy = jest.fn();
      quotaService.on('quota:decremented', eventSpy);

      const result = await quotaService.decrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      expect(eventSpy).toHaveBeenCalled();
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should not allow negative usage', async () => {
      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 5 }],
      }); // SELECT FOR UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // COMMIT

      const result = await quotaService.decrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 10, // More than current usage
      });

      expect(result.success).toBe(true);
      // Should have called UPDATE with 0 (clamped to zero)
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE usage_quotas'),
        expect.arrayContaining([0, 1, 'sites'])
      );
    });

    it('should rollback on error', async () => {
      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await quotaService.decrementQuota({
        organizationId: 1,
        dimension: 'sites',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should return error when quota record not found', async () => {
      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE returns empty

      const result = await quotaService.decrementQuota({
        organizationId: 999,
        dimension: 'sites',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No quota record found');
    });
  });

  describe('getQuotaStatus', () => {
    it('should return all quota dimensions for organization', async () => {
      const mockQuotas = [
        {
          dimension: 'sites',
          current_usage: 5,
          quota_limit: 10,
          period_start: new Date('2025-01-01'),
          period_end: null,
          last_reset_at: null,
        },
        {
          dimension: 'posts',
          current_usage: 100,
          quota_limit: 1000,
          period_start: new Date('2025-01-01'),
          period_end: null,
          last_reset_at: null,
        },
        {
          dimension: 'api_calls',
          current_usage: 50000,
          quota_limit: 100000,
          period_start: new Date('2025-01-01'),
          period_end: new Date('2025-02-01'),
          last_reset_at: null,
        },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockQuotas });

      const result = await quotaService.getQuotaStatus(1);

      expect(result.success).toBe(true);
      expect(result.data?.sites).toBeDefined();
      expect(result.data?.posts).toBeDefined();
      expect(result.data?.api_calls).toBeDefined();

      expect(result.data?.sites.current_usage).toBe(5);
      expect(result.data?.sites.remaining).toBe(5);
      expect(result.data?.sites.percentage_used).toBe(50);

      expect(result.data?.api_calls.period_end).toBeDefined();
    });

    it('should return error when no quotas found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await quotaService.getQuotaStatus(999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No quota records found');
    });
  });

  describe('resetMonthlyQuotas', () => {
    it('should reset monthly quotas for organization', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ dimension: 'api_calls' }],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:reset', eventSpy);

      const result = await quotaService.resetMonthlyQuotas(1);

      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          dimensions: ['api_calls'],
        })
      );
    });

    it('should return 0 when no quotas reset', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await quotaService.resetMonthlyQuotas(1);

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });

    it('should NOT reset quotas when period has not expired (period_end > NOW)', async () => {
      // Mock returns empty because period_end is in the future
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await quotaService.resetMonthlyQuotas(1);

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);

      // Verify SQL includes period_end < NOW() check
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('period_end < NOW()'),
        [1]
      );
    });

    it('should advance period_end by 1 month to prevent repeated resets', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ dimension: 'api_calls' }],
      });

      await quotaService.resetMonthlyQuotas(1);

      // Verify SQL advances period_end
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("period_end = period_end + INTERVAL '1 month'"),
        [1]
      );
    });
  });

  describe('resetAllMonthlyQuotas', () => {
    it('should reset all monthly quotas across all organizations', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ rows_updated: 50 }],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:global_reset', eventSpy);

      const result = await quotaService.resetAllMonthlyQuotas();

      expect(result.success).toBe(true);
      expect(result.data).toBe(50);
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('setQuotaOverride', () => {
    it('should set quota override successfully', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'sites',
            current_usage: 5,
            quota_limit: 50, // New limit
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      const eventSpy = jest.fn();
      quotaService.on('quota:override_set', eventSpy);

      const result = await quotaService.setQuotaOverride({
        organizationId: 1,
        dimension: 'sites',
        newLimit: 50,
      });

      expect(result.success).toBe(true);
      expect(result.data?.quota_limit).toBe(50);
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          dimension: 'sites',
          newLimit: 50,
        })
      );
    });

    it('should return error when new limit is <= 0', async () => {
      const result = await quotaService.setQuotaOverride({
        organizationId: 1,
        dimension: 'sites',
        newLimit: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be greater than 0');
    });

    it('should return error when quota record not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await quotaService.setQuotaOverride({
        organizationId: 999,
        dimension: 'sites',
        newLimit: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No quota record found');
    });
  });

  describe('Performance Tests', () => {
    it('should check quota in less than 50ms', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 50, quota_limit: 100 }],
      });

      const startTime = Date.now();

      await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'sites',
      });

      const duration = Date.now() - startTime;

      // Should be significantly less than 50ms in test environment
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle BigInt values from database', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: '9999999999', quota_limit: '10000000000' }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'storage_bytes',
      });

      expect(result.success).toBe(true);
      expect(result.data?.current).toBe(9999999999);
      expect(result.data?.limit).toBe(10000000000);
    });

    it('should handle all quota dimensions', async () => {
      const dimensions = ['sites', 'posts', 'users', 'storage_bytes', 'api_calls'];

      for (const dimension of dimensions) {
        mockPoolQuery.mockResolvedValueOnce({
          rows: [{ current_usage: 1, quota_limit: 100 }],
        });

        const result = await quotaService.checkQuota({
          organizationId: 1,
          dimension: dimension as any,
        });

        expect(result.success).toBe(true);
      }
    });
  });
});
