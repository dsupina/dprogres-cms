import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the database pool
const mockPoolQuery = jest.fn<any>();
const mockPoolConnect = jest.fn<any>();
const mockClient = {
  query: jest.fn<any>(),
  release: jest.fn<any>(),
};

jest.mock('../../utils/database', () => ({
  pool: {
    query: mockPoolQuery,
    connect: mockPoolConnect,
  },
}));

// Mock email service
const mockSendPaymentFailed = jest.fn<any>().mockResolvedValue({ success: true });
const mockSendSubscriptionCanceled = jest.fn<any>().mockResolvedValue({ success: true });

jest.mock('../../services/EmailService', () => ({
  emailService: {
    sendPaymentFailed: mockSendPaymentFailed,
    sendSubscriptionCanceled: mockSendSubscriptionCanceled,
  },
}));

// Mock organization service
const mockGetAdminEmails = jest.fn<any>();

jest.mock('../../services/OrganizationService', () => ({
  organizationService: {
    getAdminEmails: mockGetAdminEmails,
  },
}));

// Mock subscription cache invalidation
const mockInvalidateCache = jest.fn<any>();

jest.mock('../../middleware/quota', () => ({
  invalidateSubscriptionCache: mockInvalidateCache,
}));

// Mock Stripe
const mockStripeCancel = jest.fn<any>().mockResolvedValue({ id: 'sub_canceled' });

jest.mock('../../config/stripe', () => ({
  stripe: {
    subscriptions: {
      cancel: mockStripeCancel,
    },
  },
}));

// Import after mocks
import {
  SubscriptionLifecycleService,
  subscriptionLifecycleService,
  FREE_TIER_QUOTAS,
  GRACE_PERIOD_DAYS,
} from '../../services/SubscriptionLifecycleService';

describe('SubscriptionLifecycleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolConnect.mockResolvedValue(mockClient);
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockStripeCancel.mockReset();
    mockStripeCancel.mockResolvedValue({ id: 'sub_canceled' });
  });

  afterEach(() => {
    subscriptionLifecycleService.removeAllListeners();
  });

  describe('Constants', () => {
    it('should export FREE_TIER_QUOTAS with correct values', () => {
      expect(FREE_TIER_QUOTAS).toEqual({
        sites: 1,
        posts: 100,
        users: 1,
        storage_bytes: 1073741824,
        api_calls: 10000,
      });
    });

    it('should export GRACE_PERIOD_DAYS as 7', () => {
      expect(GRACE_PERIOD_DAYS).toBe(7);
    });
  });

  describe('handleStatusTransition', () => {
    it('should update subscription status and emit state_changed event', async () => {
      // Mock transaction queries
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'active',
            plan_tier: 'pro',
            current_period_end: new Date(),
          }],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE status
        .mockResolvedValueOnce({}); // COMMIT

      const events: any[] = [];
      subscriptionLifecycleService.on('lifecycle:state_changed', (e) => events.push(e));

      const result = await subscriptionLifecycleService.handleStatusTransition(1, 'past_due');

      expect(result.success).toBe(true);
      expect(result.data?.previousStatus).toBe('active');
      expect(result.data?.newStatus).toBe('past_due');
      expect(result.data?.organizationId).toBe(100);
      expect(mockInvalidateCache).toHaveBeenCalledWith(100);
      expect(events.length).toBe(1);
      expect(events[0].previousStatus).toBe('active');
      expect(events[0].newStatus).toBe('past_due');
    });

    it('should emit grace_period_started when transitioning to past_due', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'active',
            plan_tier: 'pro',
            current_period_end: new Date(),
          }],
        })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const gracePeriodEvents: any[] = [];
      subscriptionLifecycleService.on('lifecycle:grace_period_started', (e) => gracePeriodEvents.push(e));

      await subscriptionLifecycleService.handleStatusTransition(1, 'past_due');

      expect(gracePeriodEvents.length).toBe(1);
      expect(gracePeriodEvents[0].organizationId).toBe(100);
      expect(gracePeriodEvents[0].gracePeriodDays).toBe(GRACE_PERIOD_DAYS);
    });

    it('should perform downgrade when transitioning to canceled', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'active',
            plan_tier: 'pro',
            current_period_end: new Date(),
          }],
        })
        .mockResolvedValueOnce({}) // UPDATE subscription status
        .mockResolvedValueOnce({}) // UPDATE org plan_tier
        .mockResolvedValueOnce({}) // UPDATE quotas (sites)
        .mockResolvedValueOnce({}) // UPDATE quotas (posts)
        .mockResolvedValueOnce({}) // UPDATE quotas (users)
        .mockResolvedValueOnce({}) // UPDATE quotas (storage)
        .mockResolvedValueOnce({}) // UPDATE quotas (api_calls)
        .mockResolvedValueOnce({}); // COMMIT

      mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Test Org' }] }); // Get org name
      mockGetAdminEmails.mockResolvedValueOnce({ success: true, data: [{ email: 'admin@test.com' }] });

      const downgradeEvents: any[] = [];
      subscriptionLifecycleService.on('lifecycle:downgrade_completed', (e) => downgradeEvents.push(e));

      const result = await subscriptionLifecycleService.handleStatusTransition(1, 'canceled');

      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('downgraded_to_free');
      expect(downgradeEvents.length).toBe(1);
      expect(downgradeEvents[0].newTier).toBe('free');
    });

    it('should return NOT_FOUND error for non-existent subscription', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE - empty
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await subscriptionLifecycleService.handleStatusTransition(999, 'canceled');

      expect(result.success).toBe(false);
      expect(result.error).toContain('999');
      expect(result.error).toContain('not found');
    });

    it('should handle database errors gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database connection lost')); // Fail

      const result = await subscriptionLifecycleService.handleStatusTransition(1, 'canceled');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection lost');
    });
  });

  describe('processGracePeriodExpirations', () => {
    it('should cancel subscriptions past grace period and downgrade orgs', async () => {
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 10); // 10 days ago

      // P1 FIX: New flow - initial read-only query via pool.query, then per-subscription transactions
      // Step 1: Initial read-only query via pool.query (not through client)
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'past_due',
            plan_tier: 'pro',
            current_period_end: new Date(),
            updated_at: pastDueDate,
            days_in_grace: 10,
          }],
        }) // SELECT past_due subs (read-only)
        .mockResolvedValue({ rows: [{ name: 'Test Org' }] }); // For sendDowngradeNotification

      // Step 2: Per-subscription transaction via client
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'past_due' }] }) // SELECT FOR UPDATE (re-verify)
        .mockResolvedValueOnce({}) // UPDATE subscription to canceled
        .mockResolvedValueOnce({}) // UPDATE org plan_tier
        .mockResolvedValueOnce({}) // UPDATE quotas (sites)
        .mockResolvedValueOnce({}) // UPDATE quotas (posts)
        .mockResolvedValueOnce({}) // UPDATE quotas (users)
        .mockResolvedValueOnce({}) // UPDATE quotas (storage)
        .mockResolvedValueOnce({}) // UPDATE quotas (api_calls)
        .mockResolvedValueOnce({}); // COMMIT

      mockGetAdminEmails.mockResolvedValue({ success: true, data: [{ email: 'admin@test.com' }] });

      const expirationEvents: any[] = [];
      subscriptionLifecycleService.on('lifecycle:grace_period_expired', (e) => expirationEvents.push(e));

      const result = await subscriptionLifecycleService.processGracePeriodExpirations();

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].shouldCancel).toBe(true);
      expect(result.data?.[0].daysInGracePeriod).toBe(10);
      expect(mockInvalidateCache).toHaveBeenCalledWith(100);
      expect(expirationEvents.length).toBe(1);

      // P1 FIX: Stripe cancellation is now a post-commit action (fire-and-forget)
      // Need to wait for the async post-commit actions to execute
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockStripeCancel).toHaveBeenCalledWith('sub_test123', { prorate: false });
      // P1 FIX: After successful Stripe cancel, stripe_cancel_pending should be cleared
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('stripe_cancel_pending = false'),
        [1]
      );
    });

    it('should handle Stripe cancellation errors gracefully', async () => {
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 10);

      // P1 FIX: New flow - initial read-only query via pool.query, then per-subscription transactions
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'past_due',
            plan_tier: 'pro',
            current_period_end: new Date(),
            updated_at: pastDueDate,
            days_in_grace: 10,
          }],
        })
        .mockResolvedValue({ rows: [{ name: 'Test Org' }] }); // For sendDowngradeNotification

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'past_due' }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE subscription
        .mockResolvedValueOnce({}) // UPDATE org
        .mockResolvedValueOnce({}) // quotas
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      // Simulate Stripe error
      mockStripeCancel.mockRejectedValueOnce(new Error('Stripe API error'));

      mockGetAdminEmails.mockResolvedValue({ success: true, data: [] });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await subscriptionLifecycleService.processGracePeriodExpirations();

      // Should still succeed - local downgrade happens even if Stripe fails
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);

      // P1 FIX: Stripe cancellation is now a post-commit action, need to wait for it
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return empty array when no subscriptions have expired', async () => {
      // P1 FIX: Initial query is now via pool.query, not client
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // No expired subs

      const result = await subscriptionLifecycleService.processGracePeriodExpirations();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      // P1 FIX: Initial query is now via pool.query
      mockPoolQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await subscriptionLifecycleService.processGracePeriodExpirations();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Query failed');
    });
  });

  describe('retryPendingStripeCancellations', () => {
    it('should retry pending Stripe cancellations and clear flag on success', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_pending123',
          }],
        }) // SELECT pending subs
        .mockResolvedValueOnce({}); // UPDATE to clear flag

      const result = await subscriptionLifecycleService.retryPendingStripeCancellations();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
      expect(mockStripeCancel).toHaveBeenCalledWith('sub_pending123', { prorate: false });
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('stripe_cancel_pending = false'),
        [1]
      );
    });

    it('should handle already-canceled subscriptions in Stripe', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_already_canceled',
          }],
        })
        .mockResolvedValueOnce({}); // UPDATE to clear flag

      // Simulate Stripe returning resource_missing
      mockStripeCancel.mockRejectedValueOnce({ code: 'resource_missing' });

      const result = await subscriptionLifecycleService.retryPendingStripeCancellations();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1); // Still counts as success
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('stripe_cancel_pending = false'),
        [1]
      );
    });

    it('should keep flag on transient Stripe errors for next retry', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 100,
          stripe_subscription_id: 'sub_transient_fail',
        }],
      });

      // Simulate transient Stripe error
      mockStripeCancel.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await subscriptionLifecycleService.retryPendingStripeCancellations();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0); // No successes
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retry failed')
      );

      consoleSpy.mockRestore();
    });

    it('should return 0 when no pending cancellations', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionLifecycleService.retryPendingStripeCancellations();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
      expect(mockStripeCancel).not.toHaveBeenCalled();
    });
  });

  describe('checkGracePeriodWarnings', () => {
    it('should send warning emails for subscriptions at 4 days into grace period', async () => {
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 100,
          plan_tier: 'pro',
          org_name: 'Test Org',
        }],
      });

      mockGetAdminEmails.mockResolvedValueOnce({
        success: true,
        data: [{ email: 'admin@test.com', name: 'Admin' }],
      });

      const warningEvents: any[] = [];
      subscriptionLifecycleService.on('lifecycle:grace_period_warning', (e) => warningEvents.push(e));

      const result = await subscriptionLifecycleService.checkGracePeriodWarnings();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
      expect(mockSendPaymentFailed).toHaveBeenCalledWith(
        [{ email: 'admin@test.com', name: 'Admin' }],
        expect.objectContaining({
          organization_name: 'Test Org',
          plan_tier: 'pro',
        })
      );
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].daysRemaining).toBe(3);
    });

    it('should skip organizations with no admin emails', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 100,
          plan_tier: 'pro',
          org_name: 'Test Org',
        }],
      });

      mockGetAdminEmails.mockResolvedValueOnce({ success: false });

      const result = await subscriptionLifecycleService.checkGracePeriodWarnings();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
      expect(mockSendPaymentFailed).not.toHaveBeenCalled();
    });
  });

  describe('downgradeToFreeTier', () => {
    it('should update organization tier and reset quotas', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE organizations
        .mockResolvedValueOnce({}) // UPDATE quotas (sites)
        .mockResolvedValueOnce({}) // UPDATE quotas (posts)
        .mockResolvedValueOnce({}) // UPDATE quotas (users)
        .mockResolvedValueOnce({}) // UPDATE quotas (storage)
        .mockResolvedValueOnce({}) // UPDATE quotas (api_calls)
        .mockResolvedValueOnce({}); // COMMIT

      mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Test Org' }] });
      mockGetAdminEmails.mockResolvedValueOnce({
        success: true,
        data: [{ email: 'admin@test.com' }],
      });

      const downgradeEvents: any[] = [];
      const quotaResetEvents: any[] = [];
      subscriptionLifecycleService.on('lifecycle:downgrade_completed', (e) => downgradeEvents.push(e));
      subscriptionLifecycleService.on('lifecycle:quota_reset', (e) => quotaResetEvents.push(e));

      const result = await subscriptionLifecycleService.downgradeToFreeTier(100, 1);

      expect(result.success).toBe(true);
      expect(mockInvalidateCache).toHaveBeenCalledWith(100);
      expect(downgradeEvents.length).toBe(1);
      expect(quotaResetEvents.length).toBe(1);
      expect(quotaResetEvents[0].newLimits).toEqual(FREE_TIER_QUOTAS);
    });

    it('should handle database errors gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Update failed')); // Fail

      const result = await subscriptionLifecycleService.downgradeToFreeTier(100);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Update failed');
    });
  });

  describe('resetQuotasToFreeTier', () => {
    it('should reset all quota dimensions to free tier limits', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE quotas (sites)
        .mockResolvedValueOnce({}) // UPDATE quotas (posts)
        .mockResolvedValueOnce({}) // UPDATE quotas (users)
        .mockResolvedValueOnce({}) // UPDATE quotas (storage)
        .mockResolvedValueOnce({}) // UPDATE quotas (api_calls)
        .mockResolvedValueOnce({}); // COMMIT

      const quotaResetEvents: any[] = [];
      subscriptionLifecycleService.on('lifecycle:quota_reset', (e) => quotaResetEvents.push(e));

      const result = await subscriptionLifecycleService.resetQuotasToFreeTier(100);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE usage_quotas'),
        [1, 100, 'sites']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE usage_quotas'),
        [100, 100, 'posts']
      );
      expect(quotaResetEvents.length).toBe(1);
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return subscription info for active subscription', async () => {
      const periodEnd = new Date();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 100,
          stripe_subscription_id: 'sub_test123',
          status: 'active',
          plan_tier: 'pro',
          current_period_end: periodEnd,
          updated_at: new Date(),
        }],
      });

      const result = await subscriptionLifecycleService.getSubscriptionStatus(100);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('active');
      expect(result.data?.plan_tier).toBe('pro');
    });

    it('should return null for organization with no active subscription', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionLifecycleService.getSubscriptionStatus(100);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should exclude canceled and incomplete_expired subscriptions', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // Query excludes canceled

      await subscriptionLifecycleService.getSubscriptionStatus(100);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status NOT IN ('canceled', 'incomplete_expired')"),
        [100]
      );
    });
  });

  describe('State Machine Validation', () => {
    it('should log warning for unexpected state transitions but still process', async () => {
      // trialing -> canceled is valid
      // canceled -> active is NOT in the valid transitions, but we still process
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'canceled', // Terminal state
            plan_tier: 'free',
            current_period_end: new Date(),
          }],
        })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await subscriptionLifecycleService.handleStatusTransition(1, 'active');

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected transition: canceled → active')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Event Emission', () => {
    it('should emit lifecycle:state_changed with correct data', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            organization_id: 100,
            stripe_subscription_id: 'sub_test123',
            status: 'trialing',
            plan_tier: 'starter',
            current_period_end: new Date(),
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const eventPromise = new Promise<void>((resolve) => {
        subscriptionLifecycleService.once('lifecycle:state_changed', (event) => {
          expect(event.previousStatus).toBe('trialing');
          expect(event.newStatus).toBe('active');
          expect(event.organizationId).toBe(100);
          expect(event.subscriptionId).toBe(1);
          expect(event.timestamp).toBeInstanceOf(Date);
          resolve();
        });
      });

      await subscriptionLifecycleService.handleStatusTransition(1, 'active');
      await eventPromise;
    });
  });
});
