import { EventEmitter } from 'events';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types/versioning';
import { ServiceErrorCode } from '../types/versioning';
import { invalidateSubscriptionCache } from '../middleware/quota';
import { emailService } from './EmailService';
import { organizationService } from './OrganizationService';
import { stripe } from '../config/stripe';

/**
 * Subscription status types (matches Stripe statuses + our internal states)
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

/**
 * Plan tier types
 */
export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

/**
 * Quota dimension types
 */
export type QuotaDimension = 'sites' | 'posts' | 'users' | 'storage_bytes' | 'api_calls';

/**
 * Free tier quota limits
 * These are the default limits for organizations on the free tier
 */
export const FREE_TIER_QUOTAS: Record<QuotaDimension, number> = {
  sites: 1,
  posts: 100,
  users: 1,
  storage_bytes: 1073741824, // 1GB
  api_calls: 10000,
};

/**
 * Grace period configuration
 */
export const GRACE_PERIOD_DAYS = 7;

/**
 * Subscription info for lifecycle operations
 */
export interface SubscriptionInfo {
  id: number;
  organization_id: number;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan_tier: PlanTier;
  current_period_end: Date;
  updated_at: Date;
}

/**
 * Result of a state transition
 */
export interface StateTransitionResult {
  previousStatus: SubscriptionStatus;
  newStatus: SubscriptionStatus;
  organizationId: number;
  subscriptionId: number;
  action: string;
}

/**
 * Grace period check result
 */
export interface GracePeriodCheckResult {
  organizationId: number;
  subscriptionId: number;
  daysInGracePeriod: number;
  shouldCancel: boolean;
  canceledAt?: Date;
}

/**
 * SubscriptionLifecycleService
 *
 * Manages subscription state machine transitions and lifecycle events:
 *
 * State Machine:
 * - trialing → active (payment succeeds)
 * - active → past_due (payment fails)
 * - past_due → active (payment retried, succeeds)
 * - past_due → canceled (grace period expires - 7 days)
 * - active → canceled (user cancels)
 * - * → canceled (subscription.deleted event)
 *
 * Downgrade Logic:
 * - When status becomes 'canceled', organization is downgraded to free tier
 * - Quotas are reset to free tier limits
 * - Emails are sent to organization admins
 *
 * Events Emitted:
 * - lifecycle:state_changed - When subscription status changes
 * - lifecycle:grace_period_started - When subscription enters past_due
 * - lifecycle:grace_period_warning - 3 days before grace period expires
 * - lifecycle:downgrade_completed - When org is downgraded to free
 * - lifecycle:quota_reset - When quotas are reset to free tier
 *
 * Ticket: SF-016
 */
export class SubscriptionLifecycleService extends EventEmitter {
  /**
   * Handle subscription status transition
   * Called by webhook handlers when subscription status changes
   */
  async handleStatusTransition(
    subscriptionId: number,
    newStatus: SubscriptionStatus,
    stripeSubscriptionId?: string
  ): Promise<ServiceResponse<StateTransitionResult>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current subscription state
      const { rows: subRows } = await client.query(
        `SELECT id, organization_id, stripe_subscription_id, status, plan_tier, current_period_end
         FROM subscriptions
         WHERE id = $1
         FOR UPDATE`,
        [subscriptionId]
      );

      if (subRows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Subscription ${subscriptionId} not found`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      const subscription = subRows[0] as SubscriptionInfo;
      const previousStatus = subscription.status;
      const organizationId = subscription.organization_id;

      // Validate state transition (optional - for logging/debugging)
      const isValidTransition = this.isValidTransition(previousStatus, newStatus);
      if (!isValidTransition) {
        console.warn(
          `[SubscriptionLifecycle] Unexpected transition: ${previousStatus} → ${newStatus} ` +
          `for subscription ${subscriptionId}, org ${organizationId}`
        );
        // We still allow it since Stripe is the source of truth
      }

      // Update subscription status
      await client.query(
        `UPDATE subscriptions
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [newStatus, subscriptionId]
      );

      // Invalidate subscription cache
      invalidateSubscriptionCache(organizationId);

      // Handle specific state transitions
      let action = `${previousStatus} → ${newStatus}`;

      // If transitioning TO past_due, emit grace period started event
      if (newStatus === 'past_due' && previousStatus !== 'past_due') {
        this.emit('lifecycle:grace_period_started', {
          organizationId,
          subscriptionId,
          gracePeriodDays: GRACE_PERIOD_DAYS,
          timestamp: new Date(),
        });
        action = 'grace_period_started';
      }

      // If transitioning TO canceled, handle downgrade
      if (newStatus === 'canceled' && previousStatus !== 'canceled') {
        await this.performDowngradeInTransaction(client, organizationId, subscriptionId);
        action = 'downgraded_to_free';
      }

      await client.query('COMMIT');

      const result: StateTransitionResult = {
        previousStatus,
        newStatus,
        organizationId,
        subscriptionId,
        action,
      };

      // Emit state change event
      this.emit('lifecycle:state_changed', {
        ...result,
        timestamp: new Date(),
      });

      console.log(
        `[SubscriptionLifecycle] State transition: ${previousStatus} → ${newStatus} ` +
        `for subscription ${subscriptionId}, org ${organizationId}`
      );

      return { success: true, data: result };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[SubscriptionLifecycle] Error handling status transition:', error);
      return {
        success: false,
        error: error.message || 'Failed to handle status transition',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Check and process grace period expirations
   * Should be called by a scheduled job (e.g., daily)
   *
   * Grace period: 7 days from when subscription entered past_due status
   *
   * P1 FIX: Each subscription is processed in its own transaction to avoid
   * Stripe/DB state mismatch if a later subscription fails. Stripe cancellation
   * happens AFTER the DB transaction commits to ensure consistency.
   */
  async processGracePeriodExpirations(): Promise<ServiceResponse<GracePeriodCheckResult[]>> {
    try {
      // First, find all expired subscriptions (read-only query, no lock)
      const { rows: expiredSubs } = await pool.query(
        `SELECT id, organization_id, stripe_subscription_id, status, plan_tier,
                current_period_end, updated_at,
                EXTRACT(DAY FROM (NOW() - updated_at)) as days_in_grace
         FROM subscriptions
         WHERE status = 'past_due'
         AND updated_at <= NOW() - INTERVAL '${GRACE_PERIOD_DAYS} days'`,
        []
      );

      const results: GracePeriodCheckResult[] = [];
      const postCommitActions: Array<() => Promise<void>> = [];

      // Process each subscription in its own transaction
      for (const sub of expiredSubs) {
        const subscriptionId = sub.id;
        const organizationId = sub.organization_id;
        const stripeSubscriptionId = sub.stripe_subscription_id;
        const daysInGracePeriod = Math.floor(sub.days_in_grace);

        console.log(
          `[SubscriptionLifecycle] Grace period expired for subscription ${subscriptionId}, ` +
          `org ${organizationId}, days: ${daysInGracePeriod}`
        );

        // Process this subscription in its own transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Lock and verify the subscription is still past_due (could have changed)
          const { rows: currentRows } = await client.query(
            `SELECT id, status FROM subscriptions WHERE id = $1 AND status = 'past_due' FOR UPDATE`,
            [subscriptionId]
          );

          if (currentRows.length === 0) {
            // Subscription status changed since our initial query, skip
            await client.query('ROLLBACK');
            console.log(
              `[SubscriptionLifecycle] Subscription ${subscriptionId} no longer past_due, skipping`
            );
            continue;
          }

          // Update status to canceled in our database
          await client.query(
            `UPDATE subscriptions
             SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [subscriptionId]
          );

          // Perform downgrade (updates org tier and quotas)
          await this.performDowngradeInTransaction(client, organizationId, subscriptionId, true);

          await client.query('COMMIT');

          // Invalidate subscription cache AFTER commit
          invalidateSubscriptionCache(organizationId);

          results.push({
            organizationId,
            subscriptionId,
            daysInGracePeriod,
            shouldCancel: true,
            canceledAt: new Date(),
          });

          // Emit event AFTER commit
          this.emit('lifecycle:grace_period_expired', {
            organizationId,
            subscriptionId,
            daysInGracePeriod,
            timestamp: new Date(),
          });

          // Queue post-commit actions: Stripe cancellation and email
          // These happen AFTER the DB transaction is committed
          if (stripeSubscriptionId) {
            postCommitActions.push(async () => {
              try {
                await stripe.subscriptions.cancel(stripeSubscriptionId, {
                  prorate: false,
                });
                console.log(
                  `[SubscriptionLifecycle] Canceled Stripe subscription ${stripeSubscriptionId} ` +
                  `for org ${organizationId}`
                );
              } catch (stripeError: any) {
                if (stripeError.code === 'resource_missing') {
                  console.log(
                    `[SubscriptionLifecycle] Stripe subscription ${stripeSubscriptionId} already canceled`
                  );
                } else {
                  console.error(
                    `[SubscriptionLifecycle] Failed to cancel Stripe subscription ${stripeSubscriptionId}:`,
                    stripeError.message
                  );
                }
              }
            });
          }

          // Queue email notification
          postCommitActions.push(async () => {
            await this.sendDowngradeNotification(organizationId);
          });

        } catch (error: any) {
          await client.query('ROLLBACK');
          console.error(
            `[SubscriptionLifecycle] Error processing subscription ${subscriptionId}:`,
            error.message
          );
          // Continue with other subscriptions even if one fails
        } finally {
          client.release();
        }
      }

      // Execute all post-commit actions (Stripe cancellations and emails)
      // These are fire-and-forget, errors are logged but don't affect the result
      for (const action of postCommitActions) {
        action().catch((err) => {
          console.error('[SubscriptionLifecycle] Post-commit action failed:', err);
        });
      }

      console.log(`[SubscriptionLifecycle] Processed ${results.length} grace period expirations`);

      return { success: true, data: results };
    } catch (error: any) {
      console.error('[SubscriptionLifecycle] Error processing grace period expirations:', error);
      return {
        success: false,
        error: error.message || 'Failed to process grace period expirations',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Check subscriptions approaching grace period expiration (for warning emails)
   * Should be called by a scheduled job (e.g., daily)
   * Sends warnings at 4 days into grace period (3 days remaining)
   */
  async checkGracePeriodWarnings(): Promise<ServiceResponse<number>> {
    try {
      // P2 FIX: Find subscriptions at exactly 4 days into grace period (3 days before cancellation)
      // Grace period is 7 days, so warning at day 4 means 3 days remaining
      // We want subscriptions where: 4 days <= elapsed < 5 days
      // This means: updated_at < NOW() - 3 days AND updated_at >= NOW() - 4 days
      // Wait - that's backwards. Let me think again:
      // - updated_at is when subscription entered past_due
      // - NOW() - updated_at = days elapsed since entering past_due
      // - If elapsed is 4 days, then 3 days remain (7 - 4 = 3)
      // - Query: updated_at BETWEEN (NOW() - 5 days) AND (NOW() - 4 days)
      //   This catches: elapsed >= 4 AND elapsed < 5, so ~4 days elapsed = 3 days remaining
      const daysElapsedForWarning = GRACE_PERIOD_DAYS - 3; // 4 days elapsed = 3 days remaining

      const { rows: warningSubs } = await pool.query(
        `SELECT s.id, s.organization_id, s.plan_tier, o.name as org_name
         FROM subscriptions s
         JOIN organizations o ON s.organization_id = o.id
         WHERE s.status = 'past_due'
         AND s.updated_at <= NOW() - INTERVAL '${daysElapsedForWarning} days'
         AND s.updated_at > NOW() - INTERVAL '${daysElapsedForWarning + 1} days'`,
        []
      );

      let emailsSent = 0;

      for (const sub of warningSubs) {
        const organizationId = sub.organization_id;
        const orgName = sub.org_name;
        const planTier = sub.plan_tier;

        // Get admin emails
        const adminsResult = await organizationService.getAdminEmails(organizationId);
        if (!adminsResult.success || !adminsResult.data || adminsResult.data.length === 0) {
          console.warn(`[SubscriptionLifecycle] No admin emails found for org ${organizationId}`);
          continue;
        }

        // Send warning email
        try {
          await emailService.sendPaymentFailed(adminsResult.data, {
            organization_name: orgName,
            plan_tier: planTier,
            amount: '0', // Amount will be filled by the actual invoice
            failure_reason: `Payment failed. ${3} days remaining before account downgrade to free tier.`,
            update_payment_url: `${process.env.APP_URL || 'https://app.dprogres.com'}/billing/retry`,
          });
          emailsSent++;

          // Emit warning event
          this.emit('lifecycle:grace_period_warning', {
            organizationId,
            subscriptionId: sub.id,
            daysRemaining: 3,
            timestamp: new Date(),
          });
        } catch (emailError) {
          console.error(`[SubscriptionLifecycle] Failed to send grace period warning email:`, emailError);
        }
      }

      console.log(`[SubscriptionLifecycle] Sent ${emailsSent} grace period warning emails`);

      return { success: true, data: emailsSent };
    } catch (error: any) {
      console.error('[SubscriptionLifecycle] Error checking grace period warnings:', error);
      return {
        success: false,
        error: error.message || 'Failed to check grace period warnings',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Downgrade organization to free tier
   * Updates organization plan_tier and resets quotas
   * Called when subscription is canceled (either by user or grace period expiry)
   */
  async downgradeToFreeTier(
    organizationId: number,
    subscriptionId?: number
  ): Promise<ServiceResponse<void>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await this.performDowngradeInTransaction(client, organizationId, subscriptionId);

      await client.query('COMMIT');

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[SubscriptionLifecycle] Error downgrading to free tier:', error);
      return {
        success: false,
        error: error.message || 'Failed to downgrade to free tier',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Reset quotas to free tier limits
   * Called during downgrade process
   */
  async resetQuotasToFreeTier(organizationId: number): Promise<ServiceResponse<void>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await this.resetQuotasInTransaction(client, organizationId);

      await client.query('COMMIT');

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[SubscriptionLifecycle] Error resetting quotas:', error);
      return {
        success: false,
        error: error.message || 'Failed to reset quotas',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get subscription status summary for an organization
   */
  async getSubscriptionStatus(
    organizationId: number
  ): Promise<ServiceResponse<SubscriptionInfo | null>> {
    try {
      const { rows } = await pool.query(
        `SELECT id, organization_id, stripe_subscription_id, status, plan_tier,
                current_period_end, updated_at
         FROM subscriptions
         WHERE organization_id = $1
         AND status NOT IN ('canceled', 'incomplete_expired')
         ORDER BY created_at DESC
         LIMIT 1`,
        [organizationId]
      );

      if (rows.length === 0) {
        return { success: true, data: null };
      }

      return { success: true, data: rows[0] as SubscriptionInfo };
    } catch (error: any) {
      console.error('[SubscriptionLifecycle] Error getting subscription status:', error);
      return {
        success: false,
        error: error.message || 'Failed to get subscription status',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Check if a state transition is valid according to the state machine
   * This is informational - we still process all transitions from Stripe
   */
  private isValidTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    // Define valid transitions
    const validTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
      trialing: ['active', 'canceled', 'past_due', 'incomplete'],
      active: ['past_due', 'canceled', 'trialing'],
      past_due: ['active', 'canceled', 'unpaid'],
      canceled: [], // Terminal state (but can technically restart)
      incomplete: ['active', 'incomplete_expired', 'canceled'],
      incomplete_expired: [], // Terminal state
      unpaid: ['active', 'canceled'],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Perform downgrade within an existing transaction
   * Updates organization plan_tier and resets quotas
   *
   * @param client - Database client (within transaction)
   * @param organizationId - Organization to downgrade
   * @param subscriptionId - Optional subscription ID for event context
   * @param skipEmail - If true, skip sending email (caller handles it post-commit)
   */
  private async performDowngradeInTransaction(
    client: any,
    organizationId: number,
    subscriptionId?: number,
    skipEmail: boolean = false
  ): Promise<void> {
    // Update organization plan_tier to free
    await client.query(
      `UPDATE organizations
       SET plan_tier = 'free', updated_at = NOW()
       WHERE id = $1`,
      [organizationId]
    );

    // Reset quotas to free tier
    await this.resetQuotasInTransaction(client, organizationId);

    // Invalidate subscription cache
    invalidateSubscriptionCache(organizationId);

    console.log(`[SubscriptionLifecycle] Downgraded organization ${organizationId} to free tier`);

    // Emit downgrade completed event
    this.emit('lifecycle:downgrade_completed', {
      organizationId,
      subscriptionId,
      newTier: 'free',
      timestamp: new Date(),
    });

    // Send downgrade notification email (fire and forget, don't block transaction)
    // Skip if caller handles email post-commit (e.g., processGracePeriodExpirations)
    if (!skipEmail) {
      this.sendDowngradeNotification(organizationId).catch((err) => {
        console.error('[SubscriptionLifecycle] Failed to send downgrade notification:', err);
      });
    }
  }

  /**
   * Reset quotas to free tier limits within an existing transaction
   */
  private async resetQuotasInTransaction(client: any, organizationId: number): Promise<void> {
    // Update each quota dimension to free tier limit
    for (const [dimension, limit] of Object.entries(FREE_TIER_QUOTAS)) {
      await client.query(
        `UPDATE usage_quotas
         SET quota_limit = $1, updated_at = NOW()
         WHERE organization_id = $2 AND dimension = $3`,
        [limit, organizationId, dimension]
      );
    }

    console.log(`[SubscriptionLifecycle] Reset quotas to free tier for organization ${organizationId}`);

    // Emit quota reset event
    this.emit('lifecycle:quota_reset', {
      organizationId,
      newLimits: FREE_TIER_QUOTAS,
      timestamp: new Date(),
    });
  }

  /**
   * Send downgrade notification email to organization admins
   */
  private async sendDowngradeNotification(organizationId: number): Promise<void> {
    // Get organization name
    const { rows: orgRows } = await pool.query(
      'SELECT name FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (orgRows.length === 0) {
      return;
    }

    const orgName = orgRows[0].name;

    // Get admin emails
    const adminsResult = await organizationService.getAdminEmails(organizationId);
    if (!adminsResult.success || !adminsResult.data || adminsResult.data.length === 0) {
      return;
    }

    // Send downgrade notification
    // Using a generic notification template (could be extended with specific downgrade template)
    await emailService.sendSubscriptionCanceled(adminsResult.data, {
      organization_name: orgName,
      plan_tier: 'free',
      cancellation_date: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      reactivate_url: `${process.env.APP_URL || 'https://app.dprogres.com'}/billing/reactivate`,
    });
  }
}

// Export singleton instance
export const subscriptionLifecycleService = new SubscriptionLifecycleService();
