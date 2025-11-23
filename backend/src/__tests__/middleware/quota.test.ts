import { Request, Response, NextFunction } from 'express';
import { enforceQuota, invalidateSubscriptionCache } from '../../middleware/quota';
import { ServiceErrorCode } from '../../types/versioning';

// Mock dependencies
jest.mock('../../utils/database');
jest.mock('../../services/QuotaService');
jest.mock('../../utils/subscriptionCache');

import { pool } from '../../utils/database';
import { quotaService } from '../../services/QuotaService';
import { subscriptionCache } from '../../utils/subscriptionCache';

const mockPool = pool as jest.Mocked<typeof pool>;
const mockQuotaService = quotaService as jest.Mocked<typeof quotaService>;
const mockSubscriptionCache = subscriptionCache as jest.Mocked<typeof subscriptionCache>;

describe('enforceQuota Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      user: {
        userId: 1,
        email: 'test@example.com',
        role: 'admin',
        organizationId: 1,
      },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();

    // Default cache miss
    mockSubscriptionCache.getTier = jest.fn().mockReturnValue(null);
    mockSubscriptionCache.setTier = jest.fn();
    mockSubscriptionCache.invalidateTier = jest.fn();
  });

  describe('organizationId validation', () => {
    it('should return 400 when organizationId is missing', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'test@example.com',
        role: 'admin',
        // organizationId missing
      };

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Organization ID is required for quota enforcement',
        errorCode: ServiceErrorCode.VALIDATION_ERROR,
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 400 when user is undefined', async () => {
      mockRequest.user = undefined;

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('subscription tier lookup', () => {
    it('should use cached tier when available', async () => {
      const cachedTier = { planTier: 'pro' as const, status: 'active' };
      mockSubscriptionCache.getTier = jest.fn().mockReturnValue(cachedTier);
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 5,
          limit: 10,
          remaining: 5,
          percentage_used: 50,
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockSubscriptionCache.getTier).toHaveBeenCalledWith(1);
      expect(mockPool.query).not.toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should fetch and cache tier when not in cache', async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'starter', status: 'active' }],
      });
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 2,
          limit: 5,
          remaining: 3,
          percentage_used: 40,
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT plan_tier, status'),
        [1]
      );
      expect(mockSubscriptionCache.setTier).toHaveBeenCalledWith(1, {
        planTier: 'starter',
        status: 'active',
      });
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should default to free tier when no subscription exists', async () => {
      mockPool.query = jest.fn().mockResolvedValue({ rows: [] });
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 1,
          limit: 3,
          remaining: 2,
          percentage_used: 33,
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockSubscriptionCache.setTier).toHaveBeenCalledWith(1, {
        planTier: 'free',
        status: 'active',
      });
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should fail-safe to free tier on database error', async () => {
      mockPool.query = jest.fn().mockRejectedValue(new Error('Database connection error'));
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 3,
          limit: 3,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Should still proceed with free tier assumption
      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });
    });
  });

  describe('enterprise tier bypass', () => {
    it('should bypass quota check for enterprise tier', async () => {
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'enterprise', status: 'active' }],
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockQuotaService.checkQuota).not.toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should bypass quota check for enterprise tier from cache', async () => {
      const enterpriseTier = { planTier: 'enterprise' as const, status: 'active' };
      mockSubscriptionCache.getTier = jest.fn().mockReturnValue(enterpriseTier);

      const middleware = enforceQuota('posts');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockQuotaService.checkQuota).not.toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('quota check - allowed', () => {
    beforeEach(() => {
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'pro', status: 'active' }],
      });
    });

    it('should allow request when quota check passes', async () => {
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 5,
          limit: 20,
          remaining: 15,
          percentage_used: 25,
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should work with different quota dimensions', async () => {
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 100,
          limit: 1000,
          remaining: 900,
          percentage_used: 10,
        },
      });

      const dimensions: Array<'sites' | 'posts' | 'users' | 'storage_bytes'> = [
        'sites',
        'posts',
        'users',
        'storage_bytes',
      ];

      for (const dimension of dimensions) {
        jest.clearAllMocks();
        const middleware = enforceQuota(dimension);
        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
          organizationId: 1,
          dimension,
          amount: 1,
        });
        expect(nextFunction).toHaveBeenCalled();
      }
    });
  });

  describe('quota check - exceeded', () => {
    beforeEach(() => {
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'free', status: 'active' }],
      });
    });

    it('should return 402 when quota is exceeded', async () => {
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 3,
          limit: 3,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(402);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quota exceeded for sites',
        errorCode: ServiceErrorCode.QUOTA_EXCEEDED,
        quota: {
          dimension: 'sites',
          current: 3,
          limit: 3,
          remaining: 0,
          percentageUsed: 100,
        },
        tier: 'free',
        upgradeUrl: expect.any(String),
        message: expect.stringContaining('You have reached your free plan limit for sites'),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should include correct upgrade URL in error response', async () => {
      const originalEnv = process.env.BILLING_PORTAL_URL;
      process.env.BILLING_PORTAL_URL = 'https://billing.example.com/upgrade';

      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 10,
          limit: 10,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const middleware = enforceQuota('posts');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          upgradeUrl: 'https://billing.example.com/upgrade',
        })
      );

      // Restore original env
      if (originalEnv) {
        process.env.BILLING_PORTAL_URL = originalEnv;
      } else {
        delete process.env.BILLING_PORTAL_URL;
      }
    });

    it('should use default upgrade URL when env var not set', async () => {
      const originalEnv = process.env.BILLING_PORTAL_URL;
      delete process.env.BILLING_PORTAL_URL;

      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 5,
          limit: 5,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const middleware = enforceQuota('storage_bytes');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          upgradeUrl: '/billing/upgrade',
        })
      );

      // Restore original env
      if (originalEnv) {
        process.env.BILLING_PORTAL_URL = originalEnv;
      }
    });
  });

  describe('quota service errors', () => {
    beforeEach(() => {
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'starter', status: 'active' }],
      });
    });

    it('should return 500 when quotaService returns error', async () => {
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: false,
        error: 'Database connection failed',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database connection failed',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle quotaService throwing exception', async () => {
      mockQuotaService.checkQuota = jest.fn().mockRejectedValue(new Error('Unexpected error'));

      const middleware = enforceQuota('posts');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Quota enforcement failed',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'pro', status: 'active' }],
      });
    });

    it('should handle quota data with missing fields', async () => {
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          // Missing current, limit, remaining, percentage_used
        },
      });

      const middleware = enforceQuota('sites');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(402);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          quota: {
            dimension: 'sites',
            current: 0,
            limit: 0,
            remaining: 0,
            percentageUsed: 100,
          },
        })
      );
    });

    it('should handle quota service returning success but no data', async () => {
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        // data is undefined
      });

      const middleware = enforceQuota('posts');
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Should treat undefined data.allowed as quota exceeded
      expect(mockResponse.status).toHaveBeenCalledWith(402);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('invalidateSubscriptionCache', () => {
    it('should call subscriptionCache.invalidateTier', () => {
      invalidateSubscriptionCache(123);
      expect(mockSubscriptionCache.invalidateTier).toHaveBeenCalledWith(123);
    });
  });
});
