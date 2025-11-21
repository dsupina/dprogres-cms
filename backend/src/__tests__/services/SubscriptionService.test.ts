import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock function instances with explicit 'any' type to avoid TypeScript strict checking
const mockPoolQuery: any = jest.fn();
const mockStripeCustomersCreate: any = jest.fn();
const mockStripeCheckoutSessionsCreate: any = jest.fn();
const mockStripeBillingPortalSessionsCreate: any = jest.fn();
const mockStripeSubscriptionsRetrieve: any = jest.fn();
const mockStripeSubscriptionsUpdate: any = jest.fn();
const mockStripeSubscriptionsCancel: any = jest.fn();
const mockGetStripePriceId: any = jest.fn((tier: string, cycle: string) => `price_test_${tier}_${cycle}`);

// Mock dependencies with factory functions
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
    billingPortal: {
      sessions: {
        create: mockStripeBillingPortalSessionsCreate,
      },
    },
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
      update: mockStripeSubscriptionsUpdate,
      cancel: mockStripeSubscriptionsCancel,
    },
  },
  getStripePriceId: mockGetStripePriceId,
}));

jest.mock('../../utils/database', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

// Import after mocks are defined
import { subscriptionService } from '../../services/SubscriptionService';

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStripePriceId.mockImplementation((tier: string, cycle: string) => `price_test_${tier}_${cycle}`);
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session for new subscription', async () => {
      // Mock database query (organization)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock active subscription check (no active subscription)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock database query (no existing subscription)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock Stripe customer creation
      mockStripeCustomersCreate.mockResolvedValueOnce({
        id: 'cus_test123',
      });

      // Mock Stripe checkout session creation
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result.success).toBe(true);
      expect(result.data?.sessionId).toBe('cs_test123');
      expect(result.data?.sessionUrl).toContain('checkout.stripe.com');
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 999,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Organization not found');
    });

    it('should return error if user is not organization owner', async () => {
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

    it('should reuse existing Stripe customer if available', async () => {
      // Mock database query (organization)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock active subscription check (no active subscription)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock database query (existing subscription with customer)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_existing123' }],
      });

      // Mock Stripe checkout session creation
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      });

      const result = await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result.success).toBe(true);
      expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing123',
        })
      );
    });

    it('should include trial period if specified', async () => {
      // Mock database query (organization)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock active subscription check (no active subscription)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock database query (no existing subscription)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock Stripe customer creation
      mockStripeCustomersCreate.mockResolvedValueOnce({
        id: 'cus_test123',
      });

      // Mock Stripe checkout session creation
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      });

      await subscriptionService.createCheckoutSession({
        organizationId: 1,
        planTier: 'starter',
        billingCycle: 'monthly',
        userId: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
        trialDays: 14,
      });

      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
          }),
        })
      );
    });

    it('should return error if organization already has active subscription', async () => {
      // Mock database query (organization)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock active subscription check (existing active subscription)
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
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentSubscription', () => {
    it('should retrieve current subscription', async () => {
      const mockSubscription = {
        id: 1,
        organization_id: 1,
        plan_tier: 'pro',
        status: 'active',
      };

      mockPoolQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
      });

      const result = await subscriptionService.getCurrentSubscription(1);

      expect(result.success).toBe(true);
      expect(result.data?.plan_tier).toBe('pro');
    });

    it('should return null if no subscription found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.getCurrentSubscription(1);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await subscriptionService.getCurrentSubscription(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to retrieve subscription');
    });
  });

  describe('getCustomerPortalUrl', () => {
    it('should generate customer portal URL', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_test123' }],
      });

      mockStripeBillingPortalSessionsCreate.mockResolvedValueOnce({
        url: 'https://billing.stripe.com/session/portal_test123',
      });

      const result = await subscriptionService.getCustomerPortalUrl(1, 1, 'http://localhost/return');

      expect(result.success).toBe(true);
      expect(result.data?.portalUrl).toContain('billing.stripe.com');
    });

    it('should return error if no subscription found', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await subscriptionService.getCustomerPortalUrl(1, 1, 'http://localhost/return');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active subscription found');
    });

    it('should return error if customer ID missing', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: null }],
      });

      const result = await subscriptionService.getCustomerPortalUrl(1, 1, 'http://localhost/return');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active subscription found');
    });

    it('should return error if user is not organization owner', async () => {
      // Mock organization ownership check - user 2 is not owner (owner is user 1)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      const result = await subscriptionService.getCustomerPortalUrl(1, 2, 'http://localhost/return');

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription at period end', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_test123' }],
      });

      mockStripeSubscriptionsUpdate.mockResolvedValueOnce({
        id: 'sub_test123',
        status: 'active',
        cancel_at_period_end: true,
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, cancel_at_period_end: true, status: 'active' }],
      });

      const result = await subscriptionService.cancelSubscription(1, 1, true);

      expect(result.success).toBe(true);
      expect(result.data?.cancel_at_period_end).toBe(true);
      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith('sub_test123', {
        cancel_at_period_end: true,
      });
    });

    it('should cancel subscription immediately when specified', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_test123' }],
      });

      mockStripeSubscriptionsCancel.mockResolvedValueOnce({
        id: 'sub_test123',
        status: 'canceled',
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'canceled' }],
      });

      const result = await subscriptionService.cancelSubscription(1, 1, false);

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith('sub_test123');
    });

    it('should return error if no subscription found', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await subscriptionService.cancelSubscription(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subscription found');
    });

    it('should return error if user is not organization owner', async () => {
      // Mock organization ownership check - user 2 is not owner (owner is user 1)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      const result = await subscriptionService.cancelSubscription(1, 2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner');
    });
  });

  describe('upgradeSubscription', () => {
    it('should upgrade subscription from starter to pro', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_test123', plan_tier: 'starter' }],
      });

      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
        items: {
          data: [{ id: 'si_test123' }],
        },
      });

      mockStripeSubscriptionsUpdate.mockResolvedValueOnce({
        id: 'sub_test123',
        status: 'active',
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, plan_tier: 'pro', billing_cycle: 'monthly' }],
      });

      const result = await subscriptionService.upgradeSubscription(1, 1, 'pro', 'monthly');

      expect(result.success).toBe(true);
      expect(result.data?.plan_tier).toBe('pro');
    });

    it('should return error when attempting to downgrade with upgrade method', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_test123', plan_tier: 'pro' }],
      });

      const result = await subscriptionService.upgradeSubscription(1, 1, 'starter', 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot downgrade');
    });

    it('should return error if no subscription found', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await subscriptionService.upgradeSubscription(1, 1, 'pro', 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subscription found');
    });

    it('should use proration when upgrading', async () => {
      // Mock organization ownership check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_test123', plan_tier: 'starter' }],
      });

      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
        items: {
          data: [{ id: 'si_test123' }],
        },
      });

      mockStripeSubscriptionsUpdate.mockResolvedValueOnce({
        id: 'sub_test123',
        status: 'active',
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, plan_tier: 'pro' }],
      });

      await subscriptionService.upgradeSubscription(1, 1, 'pro', 'monthly');

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_test123',
        expect.objectContaining({
          proration_behavior: 'always_invoice',
        })
      );
    });

    it('should return error if user is not organization owner', async () => {
      // Mock organization ownership check - user 2 is not owner (owner is user 1)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      const result = await subscriptionService.upgradeSubscription(1, 2, 'pro', 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner');
    });
  });
});
