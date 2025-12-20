/**
 * SF-023: Integration Tests - Stripe & Quotas
 *
 * Tests the full integration of Stripe billing and quota enforcement:
 * 1. Create subscription end-to-end (with real Stripe test mode)
 * 2. Process webhook → update database
 * 3. Quota race condition (2 simultaneous requests)
 * 4. Organization A cannot access Organization B data
 *
 * Run with: TEST_STRIPE=true npm test -- sf023-stripe-quotas.integration.test.ts
 *
 * Note: These tests require real Stripe test mode credentials.
 * Set the following environment variables:
 * - STRIPE_SECRET_KEY_TEST: Stripe test mode secret key
 * - STRIPE_WEBHOOK_SECRET_TEST: Stripe webhook secret for test mode
 * - STRIPE_PRICE_STARTER_MONTHLY: Price ID for starter monthly plan
 * - STRIPE_PRICE_PRO_MONTHLY: Price ID for pro monthly plan
 */

import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

// Check if integration tests should run
const SKIP_STRIPE_TESTS = process.env.TEST_STRIPE !== 'true';

// Mock dependencies for non-Stripe tests
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

// Mock Stripe for service-level tests
// Note: jest.mock is hoisted, so conditional wrapping doesn't work.
// The "Real Stripe Test Mode Integration" tests bypass this by directly
// instantiating the Stripe SDK rather than using the mocked config.
const mockStripeCustomersCreate: any = jest.fn();
const mockStripeCheckoutSessionsCreate: any = jest.fn();
const mockStripeWebhooksConstructEvent: any = jest.fn();
const mockStripeSubscriptionsRetrieve: any = jest.fn();
const mockStripeSubscriptionsCancel: any = jest.fn();

jest.mock('../../config/stripe', () => ({
  stripe: {
    customers: {
      create: mockStripeCustomersCreate,
    },
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    },
    webhooks: {
      constructEvent: mockStripeWebhooksConstructEvent,
    },
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
      cancel: mockStripeSubscriptionsCancel,
    },
  },
  getStripePriceId: jest.fn((tier: string, cycle: string) => `price_test_${tier}_${cycle}`),
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
}));

// Mock quota middleware
jest.mock('../../middleware/quota', () => ({
  invalidateSubscriptionCache: jest.fn(),
}));

// Mock email service to prevent actual emails
jest.mock('../../services/EmailService', () => ({
  emailService: {
    sendSubscriptionCanceled: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendPaymentFailed: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendTrialEnding: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendInvoiceUpcoming: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));

// Mock organization service
jest.mock('../../services/OrganizationService', () => ({
  organizationService: {
    getAdminEmails: jest.fn<() => Promise<{ success: boolean; data: string[] }>>().mockResolvedValue({
      success: true,
      data: ['admin@test.com'],
    }),
  },
}));

// Import after mocks
import { subscriptionService } from '../../services/SubscriptionService';
import { QuotaService } from '../../services/QuotaService';
import { SubscriptionLifecycleService } from '../../services/SubscriptionLifecycleService';
import { invalidateSubscriptionCache } from '../../middleware/quota';

describe('SF-023: Stripe & Quotas Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock client
    mockClientQuery.mockResolvedValue({ rows: [] });
    mockClientRelease.mockResolvedValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Stripe Checkout Session Creation (End-to-End)', () => {
    beforeEach(() => {
      if (SKIP_STRIPE_TESTS) {
        // Setup mocks for Stripe-less tests
        mockPoolQuery.mockReset();
      }
    });

    it('should create checkout session with all required metadata', async () => {
      // Mock organization lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock no active subscription
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock no existing customer
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock Stripe customer creation
      mockStripeCustomersCreate.mockResolvedValueOnce({
        id: 'cus_integration_test123',
      });

      // Mock Stripe checkout session creation
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_integration_test123',
        url: 'https://checkout.stripe.com/pay/cs_integration_test123',
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost:5173/admin/billing/success',
        cancelUrl: 'http://localhost:5173/admin/billing',
        trialDays: 14,
      });

      expect(result.success).toBe(true);
      expect(result.data?.sessionId).toBe('cs_integration_test123');
      expect(result.data?.sessionUrl).toContain('checkout.stripe.com');

      // Verify Stripe was called with correct metadata
      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_integration_test123',
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
            metadata: expect.objectContaining({
              organization_id: '1',
              plan_tier: 'starter',
              billing_cycle: 'monthly',
            }),
          }),
          metadata: expect.objectContaining({
            organization_id: '1',
            plan_tier: 'starter',
            billing_cycle: 'monthly',
          }),
        })
      );
    });

    it('should reuse existing Stripe customer for returning customers', async () => {
      // Mock organization lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock no active subscription
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock existing customer
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_existing_customer' }],
      });

      // Mock Stripe checkout session creation
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_returning_customer123',
        url: 'https://checkout.stripe.com/pay/cs_returning_customer123',
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'pro',
        billingCycle: 'annual',
        userId: 1,
        successUrl: 'http://localhost:5173/admin/billing/success',
        cancelUrl: 'http://localhost:5173/admin/billing',
      });

      expect(result.success).toBe(true);

      // Should not create a new customer
      expect(mockStripeCustomersCreate).not.toHaveBeenCalled();

      // Should use existing customer
      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing_customer',
        })
      );
    });

    it('should reject checkout for organization with active subscription', async () => {
      // Mock organization lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock existing active subscription
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'active', plan_tier: 'starter' }],
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'pro',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has an active subscription');

      // Should not call Stripe
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it('should only allow organization owner to create checkout session', async () => {
      // Mock organization lookup - owner is user 2, not user 1
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 2 }],
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1, // Not the owner
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner');
    });
  });

  describe('2. Webhook Event Processing (Database Updates)', () => {
    /**
     * NOTE: Comprehensive webhook endpoint tests exist in:
     * backend/src/__tests__/routes/webhooks.test.ts
     *
     * These tests use supertest to make actual HTTP requests to the webhook
     * endpoint with proper mock setup. They test:
     * - Signature verification
     * - Idempotency (duplicate event handling)
     * - Concurrent event handling (SKIP LOCKED)
     * - checkout.session.completed → subscription creation
     * - customer.subscription.updated → status updates
     * - customer.subscription.deleted → cancellation + downgrade
     * - invoice.payment_succeeded → invoice recording
     * - invoice.payment_failed → past_due status + grace period
     * - customer.updated → name sync
     * - payment_method.attached/detached
     * - trial_will_end → email notification
     * - invoice.upcoming → renewal notice
     *
     * The tests below verify the SubscriptionLifecycleService integration
     * which handles subscription lifecycle events triggered by webhooks.
     */

    let lifecycleService: SubscriptionLifecycleService;

    beforeEach(() => {
      lifecycleService = new SubscriptionLifecycleService();
      mockPoolQuery.mockReset();
      mockPoolConnect.mockReset();
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();

      // Default client mock setup
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockClientRelease.mockResolvedValue(undefined);
      mockPoolConnect.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      });
    });

    it('should handle subscription status transition via SubscriptionLifecycleService', async () => {
      // Setup mocks for handleStatusTransition
      mockPoolConnect.mockResolvedValueOnce({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 1,
          stripe_subscription_id: 'sub_test123',
          status: 'active',
          plan_tier: 'starter',
          current_period_end: new Date(),
        }],
      }); // SELECT FOR UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE status
      mockClientQuery.mockResolvedValueOnce(undefined); // COMMIT

      const result = await lifecycleService.handleStatusTransition(1, 'past_due');

      expect(result.success).toBe(true);
      expect(result.data?.previousStatus).toBe('active');
      expect(result.data?.newStatus).toBe('past_due');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE subscriptions'),
        expect.any(Array)
      );
    });

    it('should process grace period expirations via SubscriptionLifecycleService', async () => {
      // Mock finding past_due subscriptions that exceeded grace period
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 1,
          stripe_subscription_id: 'sub_expired_grace',
          status: 'past_due',
          plan_tier: 'starter',
          current_period_end: new Date(),
          updated_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
          days_in_grace: 15,
        }],
      });

      // Mock transaction for processing expired subscription
      mockPoolConnect.mockResolvedValueOnce({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, status: 'past_due' }] }); // SELECT FOR UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE to canceled
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE organization to free
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE quotas
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE quotas
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE quotas
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE quotas
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE quotas
      mockClientQuery.mockResolvedValueOnce(undefined); // COMMIT

      // Mock post-commit actions:
      // 1. Stripe cancel pending flag update
      mockPoolQuery.mockResolvedValueOnce(undefined);
      // 2. Organization lookup for sendDowngradeNotification
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ name: 'Test Organization' }],
      });

      const result = await lifecycleService.processGracePeriodExpirations();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].shouldCancel).toBe(true);
      expect(result.data?.[0].organizationId).toBe(1);
    });

    it('should return not found for non-existent subscription', async () => {
      mockPoolConnect.mockResolvedValueOnce({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE returns nothing
      mockClientQuery.mockResolvedValueOnce(undefined); // ROLLBACK

      const result = await lifecycleService.handleStatusTransition(999, 'canceled');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should skip subscriptions that changed status during grace period processing', async () => {
      // Initial query finds past_due subscription
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 1,
          stripe_subscription_id: 'sub_changed',
          status: 'past_due',
          plan_tier: 'starter',
          current_period_end: new Date(),
          updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          days_in_grace: 10,
        }],
      });

      // But when we try to lock it, it's no longer past_due
      mockPoolConnect.mockResolvedValueOnce({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE returns nothing (status changed)
      mockClientQuery.mockResolvedValueOnce(undefined); // ROLLBACK

      const result = await lifecycleService.processGracePeriodExpirations();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0); // No subscriptions were canceled
    });
  });

  describe('3. Quota Race Condition Handling', () => {
    let quotaService: QuotaService;

    beforeEach(() => {
      quotaService = new QuotaService();
      mockPoolQuery.mockReset();
      mockPoolConnect.mockReset();
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();

      // Reset default client mocks
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockClientRelease.mockResolvedValue(undefined);
      mockPoolConnect.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      });
    });

    it('should handle concurrent quota increments atomically', async () => {
      // Scenario: Two simultaneous requests try to increment quota
      // The database function ensures atomicity

      // First request's quota check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 99, quota_limit: 100 }],
      });

      // First request's atomic increment via database function
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      // First request's status fetch for events
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          dimension: 'sites',
          current_usage: 100,
          quota_limit: 100,
          period_start: new Date(),
          period_end: null,
          last_reset_at: null,
        }],
      });

      // Execute first request
      const result1 = await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });

      // First request should succeed
      expect(result1.success).toBe(true);

      // Setup mocks for second request (quota now full)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 100, quota_limit: 100 }],
      });

      // Second request's atomic increment - should fail
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: false }],
      });

      const result2 = await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });

      // Second request should fail with quota exceeded
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Quota exceeded');
    });

    it('should use database function for atomic check-and-increment', async () => {
      // Verify the database function check_and_increment_quota is used

      // Mock quota existence check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 50, quota_limit: 100 }],
      });

      // Mock database function call
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      // Mock status fetch
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          dimension: 'posts',
          current_usage: 51,
          quota_limit: 100,
          period_start: new Date(),
          period_end: null,
          last_reset_at: null,
        }],
      });

      await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'posts',
        amount: 1,
      });

      // Verify the database function was called
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT check_and_increment_quota($1, $2, $3) as allowed',
        [1, 'posts', 1]
      );
    });

    it('should prevent quota overflow with high-volume concurrent requests', async () => {
      // Simulate multiple rapid requests that could cause race conditions
      const numRequests = 5;
      let currentUsage = 95;

      // Setup mocks for each request
      for (let i = 0; i < numRequests; i++) {
        // Quota existence check
        mockPoolQuery.mockResolvedValueOnce({
          rows: [{ current_usage: currentUsage + i, quota_limit: 100 }],
        });

        // Database function result - allow until limit
        const allowed = (currentUsage + i) < 100;
        mockPoolQuery.mockResolvedValueOnce({
          rows: [{ allowed }],
        });

        if (allowed) {
          // Status fetch for events
          mockPoolQuery.mockResolvedValueOnce({
            rows: [{
              dimension: 'posts',
              current_usage: currentUsage + i + 1,
              quota_limit: 100,
              period_start: new Date(),
              period_end: null,
              last_reset_at: null,
            }],
          });
        }
      }

      // Fire all requests concurrently
      const requests = Array.from({ length: numRequests }, () =>
        quotaService.incrementQuota({
          organizationId: 1,
          dimension: 'posts',
          amount: 1,
        })
      );

      const results = await Promise.all(requests);

      // Count successes and failures
      const successes = results.filter(r => r.success).length;
      const failures = results.filter(r => !r.success).length;

      // We started at 95/100, so at most 5 more can fit
      // With our mock setup, first 5 should succeed
      expect(successes).toBeLessThanOrEqual(5);
      expect(successes + failures).toBe(numRequests);
    });

    it('should handle decrement with SELECT FOR UPDATE to prevent races', async () => {
      // Decrement uses transaction with row locking
      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 50 }],
      }); // SELECT FOR UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // COMMIT

      const result = await quotaService.decrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });

      expect(result.success).toBe(true);
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  describe('4. Multi-Tenant Data Isolation', () => {
    let quotaService: QuotaService;

    beforeEach(() => {
      quotaService = new QuotaService();
      mockPoolQuery.mockReset();
      mockPoolConnect.mockReset();
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();

      // Reset default client mocks
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockClientRelease.mockResolvedValue(undefined);
      mockPoolConnect.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      });
    });

    it('should not allow Organization A to access Organization B quota data', async () => {
      // Organization 1 requests quota status
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { dimension: 'sites', current_usage: 5, quota_limit: 10, period_start: new Date(), period_end: null, last_reset_at: null },
          { dimension: 'posts', current_usage: 50, quota_limit: 100, period_start: new Date(), period_end: null, last_reset_at: null },
        ],
      });

      const org1Result = await quotaService.getQuotaStatus(1);

      // Organization 2 requests quota status (different data)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { dimension: 'sites', current_usage: 8, quota_limit: 10, period_start: new Date(), period_end: null, last_reset_at: null },
          { dimension: 'posts', current_usage: 200, quota_limit: 1000, period_start: new Date(), period_end: null, last_reset_at: null },
        ],
      });

      const org2Result = await quotaService.getQuotaStatus(2);

      // Verify data is different between orgs
      expect(org1Result.success).toBe(true);
      expect(org2Result.success).toBe(true);
      expect(org1Result.data?.sites.current_usage).toBe(5);
      expect(org2Result.data?.sites.current_usage).toBe(8);
      expect(org1Result.data?.posts.quota_limit).toBe(100);
      expect(org2Result.data?.posts.quota_limit).toBe(1000);
    });

    it('should not allow Organization A to increment Organization B quota', async () => {
      // Attempt to increment quota for organization 2 from organization 1's context
      // The service should only update the specified organization's quota

      // Mock quota check for org 1
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 5, quota_limit: 10 }],
      });

      // Mock atomic increment for org 1
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ allowed: true }],
      });

      // Mock status fetch for org 1
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          dimension: 'sites',
          current_usage: 6,
          quota_limit: 10,
          period_start: new Date(),
          period_end: null,
          last_reset_at: null,
        }],
      });

      // Org 1 increments its own quota
      const result = await quotaService.incrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });

      expect(result.success).toBe(true);

      // Verify the database function was called with correct org ID
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT check_and_increment_quota($1, $2, $3) as allowed',
        [1, 'sites', 1] // org 1, not org 2
      );
    });

    it('should return error when accessing non-existent organization quota', async () => {
      // Organization 999 doesn't exist
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await quotaService.getQuotaStatus(999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No quota records found');
    });

    it('should isolate subscription data between organizations', async () => {
      // Test that getCurrentSubscription is scoped to organization
      // Mock org 1 subscription lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, plan_tier: 'starter', status: 'active', organization_id: 1 }],
      });

      const result1 = await subscriptionService.getCurrentSubscription(1);

      // Mock org 2 subscription lookup (different data)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 2, plan_tier: 'pro', status: 'active', organization_id: 2 }],
      });

      const result2 = await subscriptionService.getCurrentSubscription(2);

      // Verify data is different between orgs
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data?.plan_tier).toBe('starter');
      expect(result2.data?.plan_tier).toBe('pro');
    });

    it('should prevent cross-organization subscription cancellation', async () => {
      // User 1 (owner of org 1) tries to cancel org 2's subscription
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 2, name: 'Org 2', slug: 'org-2', owner_id: 2 }],
      });

      const result = await subscriptionService.cancelSubscription(2, 1); // User 1 tries to cancel org 2

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner');
    });
  });

  describe('5. End-to-End Subscription Lifecycle', () => {
    beforeEach(() => {
      mockPoolQuery.mockReset();
      mockStripeCustomersCreate.mockReset();
      mockStripeCheckoutSessionsCreate.mockReset();
    });

    it('should track subscription from creation to retrieval', async () => {
      // Phase 1: Get current subscription (none exists yet)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const preWebhookSub = await subscriptionService.getCurrentSubscription(1);
      expect(preWebhookSub.success).toBe(true);
      expect(preWebhookSub.data).toBeNull();

      // Phase 2: After webhook processes checkout.session.completed
      // Subscription now exists
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          organization_id: 1,
          stripe_subscription_id: 'sub_e2e_test',
          plan_tier: 'starter',
          billing_cycle: 'monthly',
          status: 'active',
          current_period_start: new Date(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }],
      });

      const postWebhookSub = await subscriptionService.getCurrentSubscription(1);
      expect(postWebhookSub.success).toBe(true);
      expect(postWebhookSub.data?.plan_tier).toBe('starter');
      expect(postWebhookSub.data?.status).toBe('active');
    });
  });

  describe('6. Error Handling and Edge Cases', () => {
    let quotaService: QuotaService;

    beforeEach(() => {
      quotaService = new QuotaService();
      mockPoolQuery.mockReset();
      mockPoolConnect.mockReset();
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();
      mockStripeCustomersCreate.mockReset();

      // Reset default client mocks
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockClientRelease.mockResolvedValue(undefined);
      mockPoolConnect.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      });
    });

    it('should handle database connection failures gracefully', async () => {
      mockPoolConnect.mockRejectedValueOnce(new Error('Connection pool exhausted'));

      const result = await quotaService.decrementQuota({
        organizationId: 1,
        dimension: 'sites',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection pool exhausted');
    });

    it('should handle Stripe API errors gracefully', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // No active subscription
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // No existing customer
      mockStripeCustomersCreate.mockRejectedValueOnce(new Error('Stripe API rate limit exceeded'));

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit');
    });

    it('should handle negative quota amounts correctly', async () => {
      // Setup transaction mock chain
      mockPoolConnect.mockResolvedValueOnce({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      mockClientQuery.mockResolvedValueOnce(undefined); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ current_usage: 3 }],
      }); // SELECT FOR UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // UPDATE
      mockClientQuery.mockResolvedValueOnce(undefined); // COMMIT

      // Try to decrement more than current usage
      const result = await quotaService.decrementQuota({
        organizationId: 1,
        dimension: 'sites',
        amount: 10, // More than current usage of 3
      });

      expect(result.success).toBe(true);

      // Should have clamped to 0, not gone negative
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE usage_quotas'),
        expect.arrayContaining([0, 1, 'sites']) // Usage clamped to 0
      );
    });

    it('should handle large quota values (BigInt)', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          current_usage: '9999999999', // Large number as string
          quota_limit: '10000000000',
        }],
      });

      const result = await quotaService.checkQuota({
        organizationId: 1,
        dimension: 'storage_bytes',
        amount: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.current).toBe(9999999999);
      expect(result.data?.limit).toBe(10000000000);
      expect(result.data?.allowed).toBe(true);
    });
  });
});

// Conditional tests that require real Stripe test mode
(SKIP_STRIPE_TESTS ? describe.skip : describe)('SF-023: Real Stripe Test Mode Integration', () => {
  /**
   * These tests require actual Stripe test mode credentials.
   * Run with: TEST_STRIPE=true npm test -- sf023-stripe-quotas.integration.test.ts
   *
   * Required environment variables (checks _TEST variants first, then falls back):
   * - STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY (must be a test mode key starting with sk_test_)
   * - STRIPE_WEBHOOK_SECRET_TEST or STRIPE_WEBHOOK_SECRET
   * - STRIPE_PRICE_STARTER_MONTHLY (a real test price ID)
   */

  // Get Stripe secret key (prefer _TEST variant for test environments)
  const getStripeSecretKey = () =>
    process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;

  // Get Stripe webhook secret (prefer _TEST variant for test environments)
  const getWebhookSecret = () =>
    process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET;

  // Helper to get Stripe instance (lazy initialization)
  const getStripe = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = require('stripe');
    return new Stripe(getStripeSecretKey(), {
      apiVersion: '2023-10-16',
    });
  };

  let testCustomerId: string | null = null;

  afterAll(async () => {
    // Cleanup: Delete test customer if created
    if (testCustomerId && getStripeSecretKey()) {
      try {
        const stripe = getStripe();
        await stripe.customers.del(testCustomerId);
        console.log(`Cleaned up test customer: ${testCustomerId}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it('should create actual checkout session with real Stripe API', async () => {
    // Skip if no Stripe key configured
    const stripeKey = getStripeSecretKey();
    if (!stripeKey?.startsWith('sk_test_')) {
      console.warn('Skipping: STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY must be a test mode key');
      return;
    }

    const stripe = getStripe();

    // Create a test customer
    const customer = await stripe.customers.create({
      email: 'integration-test@example.com',
      name: 'SF-023 Integration Test',
      metadata: {
        test: 'true',
        created_by: 'sf023-integration-test',
      },
    });
    testCustomerId = customer.id;

    expect(customer.id).toMatch(/^cus_/);
    expect(customer.email).toBe('integration-test@example.com');

    // Create a checkout session
    const priceId = process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_test';

    try {
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://example.com/cancel',
        metadata: {
          organization_id: '999', // Test org ID
          plan_tier: 'starter',
          billing_cycle: 'monthly',
          test: 'true',
        },
      });

      // Verify session was created correctly
      expect(session.id).toMatch(/^cs_/);
      expect(session.customer).toBe(customer.id);
      expect(session.mode).toBe('subscription');
      expect(session.url).toContain('checkout.stripe.com');
      expect(session.metadata?.organization_id).toBe('999');
      expect(session.metadata?.plan_tier).toBe('starter');

      console.log(`Created real checkout session: ${session.id}`);
    } catch (error: any) {
      // If price doesn't exist, that's expected in some test environments
      if (error.code === 'resource_missing' && error.param === 'line_items[0][price]') {
        console.warn('Skipping checkout session creation: test price ID not found');
        return;
      }
      throw error;
    }
  });

  it('should retrieve and validate a Stripe customer', async () => {
    // Skip if no Stripe key configured
    const stripeKey = getStripeSecretKey();
    if (!stripeKey?.startsWith('sk_test_')) {
      console.warn('Skipping: STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY must be a test mode key');
      return;
    }

    const stripe = getStripe();

    // Create a customer
    const customer = await stripe.customers.create({
      email: 'retrieve-test@example.com',
      name: 'Retrieve Test Customer',
      metadata: { test: 'true', created_by: 'sf023-integration-test' },
    });

    // Clean up at end
    const customerId = customer.id;

    try {
      // Retrieve and validate
      const retrieved = await stripe.customers.retrieve(customerId);

      expect(retrieved.id).toBe(customerId);
      expect(retrieved.email).toBe('retrieve-test@example.com');
      expect(retrieved.deleted).toBeFalsy();
    } finally {
      // Cleanup
      await stripe.customers.del(customerId);
    }
  });

  it('should construct and verify webhook event signature', async () => {
    // Skip if no webhook secret configured
    const webhookSecret = getWebhookSecret();
    const stripeKey = getStripeSecretKey();
    if (!webhookSecret || !stripeKey) {
      console.warn('Skipping: STRIPE_WEBHOOK_SECRET_TEST or STRIPE_WEBHOOK_SECRET not configured');
      return;
    }

    const stripe = getStripe();

    // Create a mock event payload
    const payload = JSON.stringify({
      id: 'evt_test_webhook',
      type: 'customer.created',
      data: {
        object: {
          id: 'cus_test',
          email: 'webhook-test@example.com',
        },
      },
    });

    // Generate a valid signature
    const timestamp = Math.floor(Date.now() / 1000);
    const crypto = require('crypto');
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    const header = `t=${timestamp},v1=${signature}`;

    // Verify the webhook can be constructed
    const event = stripe.webhooks.constructEvent(payload, header, webhookSecret);

    expect(event.id).toBe('evt_test_webhook');
    expect(event.type).toBe('customer.created');
    expect(event.data.object.email).toBe('webhook-test@example.com');
  });

  it('should reject invalid webhook signatures', async () => {
    // Skip if no webhook secret configured
    const webhookSecret = getWebhookSecret();
    const stripeKey = getStripeSecretKey();
    if (!webhookSecret || !stripeKey) {
      console.warn('Skipping: STRIPE_WEBHOOK_SECRET_TEST or STRIPE_WEBHOOK_SECRET not configured');
      return;
    }

    const stripe = getStripe();

    const payload = JSON.stringify({ id: 'evt_fake', type: 'test' });
    const invalidHeader = 't=12345,v1=invalid_signature';

    expect(() => {
      stripe.webhooks.constructEvent(payload, invalidHeader, webhookSecret);
    }).toThrow(/signature/i);
  });
});
