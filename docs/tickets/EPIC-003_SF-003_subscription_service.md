# SF-003: SubscriptionService Foundation

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 1 (Database & Stripe Foundation)
**Priority**: P0 (Blocker)
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: SF-001 (Database), SF-002 (Stripe Setup)
**Assigned To**: Backend Engineer

---

## Objective

Build the core SubscriptionService class that handles Stripe Checkout session creation, subscription retrieval, and basic lifecycle operations. This service is the foundation for all billing operations.

---

## Requirements

### Functional Requirements

1. **Checkout Session Creation**:
   - Create Stripe Checkout session for new subscriptions
   - Support both monthly and annual billing cycles
   - Pass organization metadata to Stripe
   - Handle success/cancel redirect URLs

2. **Subscription Retrieval**:
   - Get current subscription for organization
   - Retrieve subscription by Stripe ID
   - List all subscriptions (admin only)

3. **Customer Portal**:
   - Generate Stripe Customer Portal URL
   - Allow customers to manage subscription, payment methods, invoices

4. **Subscription Operations**:
   - Upgrade subscription (Starter → Pro)
   - Downgrade subscription (Pro → Starter)
   - Cancel subscription (immediate or at period end)
   - Reactivate canceled subscription

### Non-Functional Requirements

- **Performance**: Checkout session creation <200ms
- **Error Handling**: Clear error messages for Stripe API failures
- **Logging**: Log all Stripe API calls for debugging
- **Type Safety**: Full TypeScript types for all methods
- **Event Emission**: Emit events for subscription lifecycle changes

---

## Technical Design

### Service Class Structure

Create `backend/src/services/SubscriptionService.ts`:

```typescript
import { EventEmitter } from 'events';
import { stripe, getStripePriceId } from '../config/stripe';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types';

export interface Subscription {
  id: number;
  organization_id: number;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_tier: 'free' | 'starter' | 'pro' | 'enterprise';
  billing_cycle: 'monthly' | 'annual';
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  amount_cents: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCheckoutSessionInput {
  organizationId: number;
  planTier: 'starter' | 'pro';
  billingCycle: 'monthly' | 'annual';
  userId: number;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number; // Optional 14-day trial
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  sessionUrl: string;
}

export class SubscriptionService extends EventEmitter {
  /**
   * Create Stripe Checkout session for new subscription
   */
  async createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<ServiceResponse<CreateCheckoutSessionResponse>> {
    try {
      const { organizationId, planTier, billingCycle, userId, successUrl, cancelUrl, trialDays } = input;

      // Get organization details
      const { rows: orgs } = await pool.query(
        'SELECT id, name, slug, owner_id FROM organizations WHERE id = $1',
        [organizationId]
      );

      if (orgs.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const organization = orgs[0];

      // Verify user is organization owner
      if (organization.owner_id !== userId) {
        return { success: false, error: 'Only organization owner can manage billing' };
      }

      // Get Stripe price ID
      const priceId = getStripePriceId(planTier, billingCycle);

      // Create or get Stripe customer
      const { rows: existingSubs } = await pool.query(
        'SELECT stripe_customer_id FROM subscriptions WHERE organization_id = $1',
        [organizationId]
      );

      let customerId: string;

      if (existingSubs.length > 0 && existingSubs[0].stripe_customer_id) {
        customerId = existingSubs[0].stripe_customer_id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          name: organization.name,
          metadata: {
            organization_id: organizationId.toString(),
            organization_slug: organization.slug,
          },
        });
        customerId = customer.id;
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          trial_period_days: trialDays,
          metadata: {
            organization_id: organizationId.toString(),
            plan_tier: planTier,
            billing_cycle: billingCycle,
          },
        },
        metadata: {
          organization_id: organizationId.toString(),
          plan_tier: planTier,
          billing_cycle: billingCycle,
        },
      });

      // Emit event
      this.emit('checkout:session_created', {
        organizationId,
        sessionId: session.id,
        planTier,
        billingCycle,
        userId,
      });

      return {
        success: true,
        data: {
          sessionId: session.id,
          sessionUrl: session.url!,
        },
      };
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create checkout session',
      };
    }
  }

  /**
   * Get current subscription for organization
   */
  async getCurrentSubscription(
    organizationId: number
  ): Promise<ServiceResponse<Subscription | null>> {
    try {
      const { rows } = await pool.query<Subscription>(
        `SELECT * FROM subscriptions
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [organizationId]
      );

      return {
        success: true,
        data: rows[0] || null,
      };
    } catch (error: any) {
      console.error('Error getting subscription:', error);
      return {
        success: false,
        error: 'Failed to retrieve subscription',
      };
    }
  }

  /**
   * Get Stripe Customer Portal URL for subscription management
   */
  async getCustomerPortalUrl(
    organizationId: number,
    returnUrl: string
  ): Promise<ServiceResponse<{ portalUrl: string }>> {
    try {
      // Get subscription with customer ID
      const { rows } = await pool.query(
        'SELECT stripe_customer_id FROM subscriptions WHERE organization_id = $1',
        [organizationId]
      );

      if (rows.length === 0 || !rows[0].stripe_customer_id) {
        return { success: false, error: 'No active subscription found' };
      }

      const customerId = rows[0].stripe_customer_id;

      // Create portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return {
        success: true,
        data: { portalUrl: session.url },
      };
    } catch (error: any) {
      console.error('Error creating portal session:', error);
      return {
        success: false,
        error: 'Failed to create customer portal session',
      };
    }
  }

  /**
   * Cancel subscription (at period end or immediately)
   */
  async cancelSubscription(
    organizationId: number,
    cancelAtPeriodEnd: boolean = true
  ): Promise<ServiceResponse<Subscription>> {
    try {
      // Get subscription
      const { rows } = await pool.query(
        'SELECT stripe_subscription_id FROM subscriptions WHERE organization_id = $1',
        [organizationId]
      );

      if (rows.length === 0) {
        return { success: false, error: 'No subscription found' };
      }

      const stripeSubscriptionId = rows[0].stripe_subscription_id;

      // Cancel in Stripe
      let stripeSubscription;
      if (cancelAtPeriodEnd) {
        stripeSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } else {
        stripeSubscription = await stripe.subscriptions.cancel(stripeSubscriptionId);
      }

      // Update database
      const { rows: updated } = await pool.query<Subscription>(
        `UPDATE subscriptions
         SET cancel_at_period_end = $1,
             canceled_at = $2,
             status = $3,
             updated_at = NOW()
         WHERE organization_id = $4
         RETURNING *`,
        [
          cancelAtPeriodEnd,
          cancelAtPeriodEnd ? null : new Date(),
          stripeSubscription.status,
          organizationId,
        ]
      );

      // Emit event
      this.emit('subscription:canceled', {
        organizationId,
        cancelAtPeriodEnd,
        subscription: updated[0],
      });

      return {
        success: true,
        data: updated[0],
      };
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      return {
        success: false,
        error: 'Failed to cancel subscription',
      };
    }
  }

  /**
   * Upgrade subscription to higher tier
   */
  async upgradeSubscription(
    organizationId: number,
    newTier: 'starter' | 'pro',
    newBillingCycle: 'monthly' | 'annual'
  ): Promise<ServiceResponse<Subscription>> {
    try {
      // Get current subscription
      const { rows } = await pool.query(
        'SELECT stripe_subscription_id, plan_tier FROM subscriptions WHERE organization_id = $1',
        [organizationId]
      );

      if (rows.length === 0) {
        return { success: false, error: 'No subscription found' };
      }

      const currentTier = rows[0].plan_tier;
      const stripeSubscriptionId = rows[0].stripe_subscription_id;

      // Validate upgrade path (starter -> pro)
      if (currentTier === 'pro' && newTier === 'starter') {
        return { success: false, error: 'Cannot downgrade using upgrade method. Use downgrade instead.' };
      }

      // Get new price ID
      const newPriceId = getStripePriceId(newTier, newBillingCycle);

      // Update subscription in Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'always_invoice', // Charge prorated amount immediately
      });

      // Update database (webhook will sync final state)
      const { rows: updated } = await pool.query<Subscription>(
        `UPDATE subscriptions
         SET plan_tier = $1,
             billing_cycle = $2,
             stripe_price_id = $3,
             updated_at = NOW()
         WHERE organization_id = $4
         RETURNING *`,
        [newTier, newBillingCycle, newPriceId, organizationId]
      );

      // Emit event
      this.emit('subscription:upgraded', {
        organizationId,
        oldTier: currentTier,
        newTier,
        subscription: updated[0],
      });

      return {
        success: true,
        data: updated[0],
      };
    } catch (error: any) {
      console.error('Error upgrading subscription:', error);
      return {
        success: false,
        error: 'Failed to upgrade subscription',
      };
    }
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();
```

---

## Acceptance Criteria

- [ ] SubscriptionService class created with EventEmitter
- [ ] `createCheckoutSession()` creates valid Stripe Checkout session
- [ ] `getCurrentSubscription()` retrieves subscription from database
- [ ] `getCustomerPortalUrl()` generates valid Customer Portal URL
- [ ] `cancelSubscription()` marks subscription for cancellation
- [ ] `upgradeSubscription()` changes plan tier and prorates charges
- [ ] All methods return `ServiceResponse<T>` type
- [ ] Events emitted for all lifecycle changes
- [ ] TypeScript types defined for all interfaces
- [ ] Error handling covers Stripe API failures
- [ ] Unit tests cover all public methods with >90% coverage

---

## Testing

### Unit Tests

Create `backend/src/__tests__/services/SubscriptionService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from '@jest/globals';
import { subscriptionService } from '../../services/SubscriptionService';
import { stripe } from '../../config/stripe';
import { pool } from '../../utils/database';

// Mock dependencies
vi.mock('../../config/stripe');
vi.mock('../../utils/database');

describe('SubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session for new subscription', async () => {
      // Mock database query (organization)
      (pool.query as any).mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org', slug: 'test-org', owner_id: 1 }],
      });

      // Mock database query (no existing subscription)
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      // Mock Stripe customer creation
      (stripe.customers.create as any).mockResolvedValueOnce({
        id: 'cus_test123',
      });

      // Mock Stripe checkout session creation
      (stripe.checkout.sessions.create as any).mockResolvedValueOnce({
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

    it('should return error if user is not organization owner', async () => {
      (pool.query as any).mockResolvedValueOnce({
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

  describe('getCurrentSubscription', () => {
    it('should retrieve current subscription', async () => {
      const mockSubscription = {
        id: 1,
        organization_id: 1,
        plan_tier: 'pro',
        status: 'active',
      };

      (pool.query as any).mockResolvedValueOnce({
        rows: [mockSubscription],
      });

      const result = await subscriptionService.getCurrentSubscription(1);

      expect(result.success).toBe(true);
      expect(result.data?.plan_tier).toBe('pro');
    });

    it('should return null if no subscription found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.getCurrentSubscription(1);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription at period end', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_test123' }],
      });

      (stripe.subscriptions.update as any).mockResolvedValueOnce({
        id: 'sub_test123',
        status: 'active',
        cancel_at_period_end: true,
      });

      (pool.query as any).mockResolvedValueOnce({
        rows: [{ id: 1, cancel_at_period_end: true, status: 'active' }],
      });

      const result = await subscriptionService.cancelSubscription(1, true);

      expect(result.success).toBe(true);
      expect(result.data?.cancel_at_period_end).toBe(true);
    });
  });
});
```

### Integration Test

```typescript
describe('SubscriptionService Integration', () => {
  it('should create subscription end-to-end', async () => {
    // This test requires actual Stripe test mode keys
    // Run with: TEST_STRIPE=true npm test

    if (process.env.TEST_STRIPE !== 'true') {
      console.log('Skipping Stripe integration test');
      return;
    }

    // 1. Create organization
    const { rows: orgs } = await pool.query(
      `INSERT INTO organizations (name, slug, owner_id, plan_tier)
       VALUES ('Test Org', 'test-org', 1, 'free')
       RETURNING id`
    );
    const orgId = orgs[0].id;

    // 2. Create checkout session
    const checkoutResult = await subscriptionService.createCheckoutSession({
      organizationId: orgId,
      planTier: 'starter',
      billingCycle: 'monthly',
      userId: 1,
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
    });

    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.data?.sessionUrl).toContain('stripe.com');

    // Cleanup
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
  });
});
```

---

## Documentation

Update `docs/COMPONENTS.md`:

```markdown
### SubscriptionService

**Purpose**: Manages Stripe subscription lifecycle

**Key Methods**:
- `createCheckoutSession()` - Create Stripe Checkout session
- `getCurrentSubscription()` - Get organization's subscription
- `getCustomerPortalUrl()` - Generate Customer Portal URL
- `cancelSubscription()` - Cancel subscription
- `upgradeSubscription()` - Upgrade to higher tier

**Events**:
- `checkout:session_created` - Checkout session created
- `subscription:canceled` - Subscription canceled
- `subscription:upgraded` - Subscription upgraded

**Dependencies**:
- Stripe API client
- PostgreSQL (subscriptions table)
```

---

## Deployment Notes

### Environment Variables Required

```env
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_PRICE_STARTER_MONTHLY=price_test_...
STRIPE_PRICE_STARTER_ANNUAL=price_test_...
STRIPE_PRICE_PRO_MONTHLY=price_test_...
STRIPE_PRICE_PRO_ANNUAL=price_test_...
```

### Testing in Development

```bash
# 1. Install dependencies
npm install stripe

# 2. Run unit tests
npm test -- SubscriptionService.test.ts

# 3. Test checkout session creation
curl -X POST http://localhost:5000/api/billing/checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planTier": "starter",
    "billingCycle": "monthly",
    "successUrl": "http://localhost:5173/billing/success",
    "cancelUrl": "http://localhost:5173/billing"
  }'
```

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
