import { EventEmitter } from 'events';
import { stripe, getStripePriceId } from '../config/stripe';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types/versioning';

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
  canceled_at?: Date;
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
         AND status IN ('active', 'trialing', 'past_due')
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
        `SELECT stripe_customer_id FROM subscriptions
         WHERE organization_id = $1
         AND status IN ('active', 'trialing', 'past_due')
         ORDER BY created_at DESC
         LIMIT 1`,
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
      // Get active subscription
      const { rows } = await pool.query(
        `SELECT stripe_subscription_id FROM subscriptions
         WHERE organization_id = $1
         AND status IN ('active', 'trialing', 'past_due')
         ORDER BY created_at DESC
         LIMIT 1`,
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

      // Update database - target specific subscription by stripe_subscription_id
      const { rows: updated } = await pool.query<Subscription>(
        `UPDATE subscriptions
         SET cancel_at_period_end = $1,
             canceled_at = $2,
             status = $3,
             updated_at = NOW()
         WHERE stripe_subscription_id = $4
         RETURNING *`,
        [
          cancelAtPeriodEnd,
          cancelAtPeriodEnd ? null : new Date(),
          stripeSubscription.status,
          stripeSubscriptionId,
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
      // Get current active subscription
      const { rows } = await pool.query(
        `SELECT stripe_subscription_id, plan_tier FROM subscriptions
         WHERE organization_id = $1
         AND status IN ('active', 'trialing', 'past_due')
         ORDER BY created_at DESC
         LIMIT 1`,
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

      // Update database (webhook will sync final state) - target specific subscription
      const { rows: updated } = await pool.query<Subscription>(
        `UPDATE subscriptions
         SET plan_tier = $1,
             billing_cycle = $2,
             stripe_price_id = $3,
             updated_at = NOW()
         WHERE stripe_subscription_id = $4
         RETURNING *`,
        [newTier, newBillingCycle, newPriceId, stripeSubscriptionId]
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
