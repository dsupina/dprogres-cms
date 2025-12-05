import { Router, Request, Response } from 'express';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../config/stripe';
import { pool } from '../utils/database';
import { emailService } from '../services/EmailService';
import { organizationService } from '../services/OrganizationService';
import type Stripe from 'stripe';

const router = Router();

// Extend Stripe types with webhook-specific properties that exist in API but not in TypeScript defs
type StripeSubscriptionWithPeriod = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
};

type StripeInvoiceWithSubscription = Stripe.Invoice & {
  subscription: string | Stripe.Subscription | null;
};

// PostgreSQL INTEGER max value (2^31 - 1)
const MAX_INT = 2147483647;

// Zero-decimal currencies (no cents, e.g., ¥1000 = 1000, not 100000)
// Stripe returns these as the actual amount, not in subunits
const ZERO_DECIMAL_CURRENCIES = ['jpy', 'krw', 'vnd', 'clp', 'pyg', 'xaf', 'xof', 'xpf', 'bif', 'djf', 'gnf', 'kmf', 'mga', 'rwf', 'ugx'];

/**
 * Convert Stripe Unix timestamp (seconds since epoch) to JavaScript Date in UTC
 * @param unixTimestamp - Unix timestamp in seconds (Stripe format)
 * @returns Date object in UTC timezone
 */
function fromUnixTimestamp(unixTimestamp: number | null | undefined): Date | null {
  if (unixTimestamp === null || unixTimestamp === undefined) {
    return null;
  }
  // Unix timestamps are always in UTC. Multiplying by 1000 converts seconds to milliseconds.
  // The resulting Date object represents the same moment in time, stored internally as UTC.
  return new Date(unixTimestamp * 1000);
}

/**
 * Get current timestamp in UTC
 * @returns Date object representing current moment in UTC
 */
function nowUtc(): Date {
  // new Date() always creates a date in UTC internally, regardless of system timezone.
  // The timestamp is always UTC - toString() may show local timezone, but toISOString() shows UTC.
  return new Date();
}

/**
 * Determine if an error is transient (should retry) or permanent (should not retry)
 */
function isTransientError(error: any): boolean {
  const message = error.message?.toLowerCase() || '';

  // Database connection/timeout errors (transient)
  if (message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('network')) {
    return true;
  }

  // Database pool exhausted (transient)
  if (message.includes('pool') || message.includes('too many clients')) {
    return true;
  }

  // Stripe API rate limits or service errors (transient)
  if (error.type === 'StripeAPIError' ||
      error.type === 'StripeConnectionError' ||
      error.statusCode === 429 ||
      error.statusCode >= 500) {
    return true;
  }

  // Event ordering issues - subscription/invoice not yet created (transient)
  // These errors explicitly say "TRANSIENT:" prefix or "will be retried" in the message
  if (message.includes('transient:') || message.includes('will be retried')) {
    return true;
  }

  // Missing metadata errors - need to wait for subscription.created with metadata (transient)
  if (message.includes('cannot create subscription') && message.includes('without metadata')) {
    return true;
  }

  // All other errors are permanent (validation, missing data, constraint violations)
  return false;
}

/**
 * Stripe Webhook Endpoint
 *
 * Processes Stripe webhook events with signature verification and idempotency.
 *
 * POST /api/webhooks/stripe
 *
 * Requirements:
 * - Verify Stripe signature using stripe.webhooks.constructEvent()
 * - Check stripe_event_id uniqueness in subscription_events table
 * - Route event to appropriate handler based on event.type
 * - Return 200 OK within 5 seconds (Stripe timeout)
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature (STRIPE_WEBHOOK_SECRET is validated at startup)
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    // Security logging: potential attack or misconfiguration
    const securityEvent = {
      type: 'webhook_signature_failed',
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
      error: err.message,
    };
    console.error('SECURITY: Webhook signature verification failed:', JSON.stringify(securityEvent));

    // TODO: Send to security monitoring system (e.g., Sentry, DataDog)
    // await securityMonitor.logEvent(securityEvent);

    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    // Quick idempotency check BEFORE external API calls
    // This prevents wasting Stripe API calls on duplicate events
    const { rows: existingCheck } = await pool.query(
      `SELECT processed_at FROM subscription_events WHERE stripe_event_id = $1`,
      [event.id]
    );

    // If event already processed, return immediately without calling Stripe API
    if (existingCheck.length > 0 && existingCheck[0].processed_at) {
      console.log(`Event ${event.id} already processed (quick check), skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // For checkout.session.completed, fetch subscription from Stripe BEFORE transaction
    // to avoid holding database locks during external API call
    // Only do this AFTER confirming event is not already processed
    let preloadedSubscription: Stripe.Subscription | null = null;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        if (typeof session.subscription === 'string') {
          // Subscription is an ID string - fetch from Stripe
          try {
            preloadedSubscription = await stripe.subscriptions.retrieve(session.subscription);
          } catch (err: any) {
            console.error(`Failed to fetch subscription ${session.subscription}:`, err.message);
            // Re-throw original error to preserve Stripe metadata (type, statusCode)
            // isTransientError() needs these fields to classify rate limits and 5xx errors
            throw err;
          }
        } else {
          // Subscription is already expanded - use it directly (no need to fetch)
          preloadedSubscription = session.subscription as Stripe.Subscription;
        }
      }
    }

    // Idempotency insert: Insert event with processed_at = NULL (not processed yet)
    const { rows } = await pool.query(
      `INSERT INTO subscription_events (stripe_event_id, event_type, data, processed_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING id`,
      [event.id, event.type, JSON.stringify(event.data)]
    );

    // Always use transaction with locking to prevent concurrent processing
    // This handles both first-time inserts and retries
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Use SELECT FOR UPDATE to prevent concurrent processing of the same event
      const { rows: existingRows } = await client.query(
        `SELECT id, processed_at FROM subscription_events
         WHERE stripe_event_id = $1
         FOR UPDATE SKIP LOCKED`,
        [event.id]
      );

      // If SKIP LOCKED returned no rows, another process is currently handling this event
      if (existingRows.length === 0) {
        await client.query('COMMIT');
        console.log(`Event ${event.id} is being processed by another request, skipping`);
        return res.status(200).json({ received: true, concurrent: true });
      }

      const existingEvent = existingRows[0];

      // Check if already processed
      if (existingEvent.processed_at) {
        await client.query('COMMIT');
        console.log(`Event ${event.id} already processed, skipping`);
        return res.status(200).json({ received: true, duplicate: true });
      }

      // Process event (lock held until COMMIT)
      // This handles both first-time events and retries
      const isRetry = rows.length === 0;
      if (isRetry) {
        console.log(`Event ${event.id} exists but not processed, retrying`);
      }

      const eventRecordId = existingEvent.id;

      // Pass client to handlers to avoid deadlock (outer transaction holds row lock)
      // Pass preloaded subscription data to avoid Stripe API call inside transaction
      // Handlers may return a post-commit callback for actions like sending emails
      const postCommitCallback = await handleWebhookEvent(event, eventRecordId, client, preloadedSubscription);

      // Mark as successfully processed (clear any prior error from failed attempts)
      await client.query(
        `UPDATE subscription_events
         SET processed_at = NOW(), processing_error = NULL
         WHERE id = $1`,
        [eventRecordId]
      );

      await client.query('COMMIT');

      // Execute post-commit callback (e.g., send emails) AFTER transaction commits
      // This prevents duplicate emails on retry since event is now marked as processed
      if (postCommitCallback) {
        postCommitCallback();
      }

      return res.status(200).json({ received: true, retried: isRetry });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error processing webhook event:', error);

    // Determine if error is transient (should retry) or permanent (should not retry)
    const isRetryable = isTransientError(error);

    // Log error to subscription_events table (use INSERT...ON CONFLICT to handle race condition)
    // CRITICAL: Must explicitly set processed_at = NULL to allow retries
    // If initial INSERT failed (transient error), this creates new row. Schema has DEFAULT NOW()
    // for processed_at, which would mark event as processed and prevent retries.
    try {
      await pool.query(
        `INSERT INTO subscription_events (stripe_event_id, event_type, data, processing_error, processed_at)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT (stripe_event_id) DO UPDATE
         SET processing_error = EXCLUDED.processing_error`,
        [event.id, event.type, JSON.stringify(event.data), error.message]
      );
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }

    // Return 500 for transient errors (Stripe will retry)
    // Return 200 for permanent errors (don't retry, prevents endless loops)
    if (isRetryable) {
      return res.status(500).json({
        received: false,
        error: 'Transient error - will retry',
        details: error.message
      });
    } else {
      return res.status(200).json({
        received: true,
        error: 'Permanent error - not retrying',
        details: error.message
      });
    }
  }
});

/** Callback to execute after transaction commits (for emails, notifications, etc.) */
type PostCommitCallback = () => void;

/**
 * Route webhook event to appropriate handler
 * Returns an optional post-commit callback for actions that should run after transaction commits
 */
async function handleWebhookEvent(
  event: Stripe.Event,
  eventRecordId: number,
  client?: any,
  preloadedSubscription?: any
): Promise<PostCommitCallback | void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, eventRecordId, client, preloadedSubscription);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, eventRecordId, client);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, eventRecordId, client);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event.data.object as Stripe.Invoice, eventRecordId, client);
      break;

    case 'invoice.payment_failed':
      await handleInvoiceFailed(event.data.object as Stripe.Invoice, eventRecordId, client);
      break;

    // SF-015: New webhook handlers
    case 'customer.updated':
      await handleCustomerUpdated(event.data.object as Stripe.Customer, eventRecordId, client);
      break;

    case 'payment_method.attached':
      await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod, eventRecordId, client);
      break;

    case 'payment_method.detached':
      await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod, eventRecordId, client);
      break;

    case 'customer.subscription.trial_will_end':
      // Returns post-commit callback for email sending
      return await handleTrialWillEnd(event.data.object as Stripe.Subscription, eventRecordId, client);

    case 'invoice.upcoming':
      // Returns post-commit callback for email sending
      return await handleInvoiceUpcoming(event.data.object as Stripe.Invoice, eventRecordId, client);

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle checkout.session.completed event
 * Creates subscription record in database
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventRecordId: number,
  providedClient?: any,
  preloadedSubscription?: any
): Promise<void> {
  // Validate session has required fields
  if (!session.subscription) {
    throw new Error(`Checkout session ${session.id} missing subscription ID`);
  }
  if (!session.customer) {
    throw new Error(`Checkout session ${session.id} missing customer ID`);
  }

  // Validate Stripe customer ID format (must start with 'cus_')
  // session.customer can be a string (customer ID) or expanded Customer object
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
  if (!customerId || !/^cus_/.test(customerId)) {
    throw new Error(`Invalid Stripe customer ID format: ${customerId}`);
  }

  // Extract subscription ID (can be string or expanded Subscription object)
  // When Stripe expands objects via expand[] parameter, session.subscription is an object
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : (session.subscription as Stripe.Subscription).id;

  if (!subscriptionId) {
    throw new Error(`Checkout session ${session.id} missing subscription ID`);
  }

  // Use preloaded subscription (fetched BEFORE outer transaction) or fetch now
  // Preloaded subscription avoids holding database locks during external API call
  const subscription = preloadedSubscription || await stripe.subscriptions.retrieve(subscriptionId);

  // Validate subscription has price information
  if (!subscription.items?.data?.[0]?.price?.id) {
    throw new Error(`Subscription ${subscription.id} has no price information`);
  }

  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Extract metadata from session
    const orgIdStr = session.metadata?.organization_id;
    if (!orgIdStr) {
      throw new Error('Missing organization_id in checkout session metadata');
    }

    const organizationId = parseInt(orgIdStr, 10);
    if (isNaN(organizationId) || organizationId < 1) {
      throw new Error(`Invalid organization_id: ${orgIdStr} (must be positive integer)`);
    }

    const planTier = session.metadata?.plan_tier as 'free' | 'starter' | 'pro' | 'enterprise';
    const billingCycle = session.metadata?.billing_cycle as 'monthly' | 'annual';

    if (!planTier || !billingCycle) {
      throw new Error('Missing plan_tier or billing_cycle in checkout session metadata');
    }

    // Calculate total amount from all subscription items (handles add-ons, metered billing, quantities)
    // For seat-based billing: 5 users × $10/seat = $50, not $10
    const amountCents = subscription.items.data.reduce(
      (sum: number, item: any) => sum + ((item.price.unit_amount || 0) * (item.quantity || 1)),
      0
    );

    // Validate amount doesn't exceed PostgreSQL INTEGER max
    if (amountCents > MAX_INT) {
      throw new Error(`Subscription amount ${amountCents} exceeds max integer value`);
    }

    // Get currency from subscription (defaults to USD if not specified)
    const currency = subscription.currency?.toUpperCase() || 'USD';

    // Create subscription record
    const { rows } = await client.query(
      `INSERT INTO subscriptions (
        organization_id, stripe_customer_id, stripe_subscription_id,
        stripe_price_id, plan_tier, billing_cycle, status,
        current_period_start, current_period_end, cancel_at_period_end,
        amount_cents, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (stripe_subscription_id) DO UPDATE
      SET status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = NOW()
      RETURNING id`,
      [
        organizationId,
        customerId,
        subscriptionId,
        subscription.items.data[0].price.id,
        planTier,
        billingCycle,
        subscription.status,
        fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).current_period_start),
        fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).current_period_end),
        (subscription as StripeSubscriptionWithPeriod).cancel_at_period_end,
        amountCents,
        currency,
      ]
    );

    const dbSubscriptionId = rows[0].id;

    // Link event to subscription
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Checkout completed for org ${organizationId}, subscription ${subscriptionId}`);
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle customer.subscription.created/updated events
 * Creates or updates subscription record in database
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Validate subscription has price information
    if (!subscription.items?.data?.[0]?.price?.id) {
      throw new Error(`Subscription ${subscription.id} has no price information`);
    }

    // Extract metadata for new subscriptions (may not exist for updates)
    const orgIdStr = subscription.metadata?.organization_id;
    let organizationId: number | undefined;

    // Parse and validate organization ID if present
    if (orgIdStr) {
      organizationId = parseInt(orgIdStr, 10);
      if (isNaN(organizationId) || organizationId < 1) {
        throw new Error(`Invalid organization_id in subscription metadata: ${orgIdStr}`);
      }
    }

    const planTier = subscription.metadata?.plan_tier as 'free' | 'starter' | 'pro' | 'enterprise' | undefined;
    const billingCycle = subscription.metadata?.billing_cycle as 'monthly' | 'annual' | undefined;

    let rows;

    // Calculate total amount from all subscription items (handles add-ons, metered billing, quantities)
    // For seat-based billing: 5 users × $10/seat = $50, not $10
    const amountCents = subscription.items.data.reduce(
      (sum: number, item: any) => sum + ((item.price.unit_amount || 0) * (item.quantity || 1)),
      0
    );

    // Validate amount doesn't exceed PostgreSQL INTEGER max
    if (amountCents > MAX_INT) {
      throw new Error(`Subscription amount ${amountCents} exceeds max integer value`);
    }

    // Get currency from subscription (defaults to USD if not specified)
    const currency = subscription.currency?.toUpperCase() || 'USD';

    // If we have full metadata, use UPSERT (handles both created and updated)
    if (organizationId !== undefined && planTier && billingCycle) {
      const result = await client.query(
        `INSERT INTO subscriptions (
          organization_id, stripe_customer_id, stripe_subscription_id,
          stripe_price_id, plan_tier, billing_cycle, status,
          current_period_start, current_period_end, cancel_at_period_end,
          canceled_at, amount_cents, currency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (stripe_subscription_id) DO UPDATE
        SET stripe_price_id = EXCLUDED.stripe_price_id,
            plan_tier = EXCLUDED.plan_tier,
            billing_cycle = EXCLUDED.billing_cycle,
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            canceled_at = EXCLUDED.canceled_at,
            amount_cents = EXCLUDED.amount_cents,
            currency = EXCLUDED.currency,
            updated_at = NOW()
        RETURNING id, organization_id`,
        [
          organizationId,
          subscription.customer,
          subscription.id,
          subscription.items.data[0].price.id,
          planTier,
          billingCycle,
          subscription.status,
          fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).current_period_start),
          fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).current_period_end),
          (subscription as StripeSubscriptionWithPeriod).cancel_at_period_end,
          fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).canceled_at),
          amountCents,
          currency,
        ]
      );
      rows = result.rows;
      console.log(`Subscription upserted: ${subscription.id}, status: ${subscription.status}`);
    } else {
      // Missing metadata, try UPDATE only (assumes row exists from checkout.session.completed)
      // This path handles dashboard upgrades/downgrades, so we must update pricing fields too
      const result = await client.query(
        `UPDATE subscriptions
         SET stripe_price_id = $1,
             amount_cents = $2,
             currency = $3,
             status = $4,
             current_period_start = $5,
             current_period_end = $6,
             cancel_at_period_end = $7,
             canceled_at = $8,
             updated_at = NOW()
         WHERE stripe_subscription_id = $9
         RETURNING id, organization_id`,
        [
          subscription.items.data[0].price.id,
          amountCents,
          currency,
          subscription.status,
          fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).current_period_start),
          fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).current_period_end),
          (subscription as StripeSubscriptionWithPeriod).cancel_at_period_end,
          fromUnixTimestamp((subscription as StripeSubscriptionWithPeriod).canceled_at),
          subscription.id,
        ]
      );
      rows = result.rows;

      if (rows.length === 0) {
        console.warn(
          `Subscription ${subscription.id} not found and missing metadata for creation. ` +
          `Ensure checkout.session.completed event is processed first or subscription has metadata.`
        );
        throw new Error(`Cannot create subscription ${subscription.id} without metadata`);
      }

      console.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
    }

    if (rows.length > 0) {
      // Link event to subscription and organization
      await client.query(
        `UPDATE subscription_events
         SET organization_id = $1, subscription_id = $2
         WHERE id = $3`,
        [rows[0].organization_id, rows[0].id, eventRecordId]
      );
    }

    if (useTransaction) {
      await client.query('COMMIT');
    }
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle customer.subscription.deleted event
 * Marks subscription as canceled
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Update subscription to canceled status
    const { rows } = await client.query(
      `UPDATE subscriptions
       SET status = 'canceled',
           canceled_at = $1,
           updated_at = NOW()
       WHERE stripe_subscription_id = $2
       RETURNING id, organization_id`,
      [
        fromUnixTimestamp(subscription.canceled_at) || nowUtc(),
        subscription.id,
      ]
    );

    if (rows.length === 0) {
      throw new Error(
        `Subscription ${subscription.id} not found for deletion. ` +
        `Ensure checkout.session.completed or subscription.created event is processed first. Event will be retried.`
      );
    }

    // Link event to subscription and organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [rows[0].organization_id, rows[0].id, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Subscription deleted: ${subscription.id}`);
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle invoice.payment_succeeded event
 * Creates invoice record and sends receipt
 */
async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Find subscription in our database
    // invoice.subscription can be string (subscription ID) or Stripe.Subscription object or null
    const invoiceWithSub = invoice as StripeInvoiceWithSubscription;
    const stripeSubId = typeof invoiceWithSub.subscription === 'string'
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id;

    if (!stripeSubId || stripeSubId.trim() === '') {
      throw new Error(`No valid subscription ID found for invoice ${invoice.id}. Event will be retried.`);
    }

    const { rows: subRows } = await client.query(
      `SELECT id, organization_id FROM subscriptions
       WHERE stripe_subscription_id = $1`,
      [stripeSubId]
    );

    if (subRows.length === 0) {
      throw new Error(
        `Subscription ${stripeSubId} not found for invoice ${invoice.id}. ` +
        `Ensure checkout.session.completed event is processed first. Event will be retried.`
      );
    }

    const { id: dbSubscriptionId, organization_id: organizationId } = subRows[0];

    // Validate amounts don't exceed PostgreSQL INTEGER max
    if (invoice.amount_due > MAX_INT || invoice.amount_paid > MAX_INT) {
      throw new Error(`Invoice amounts exceed max integer value: due=${invoice.amount_due}, paid=${invoice.amount_paid}`);
    }

    // Note: For zero-decimal currencies (JPY, KRW, etc.), Stripe returns the actual amount
    // without subunits (¥1000 = 1000, not 100000). Our amount_cents column stores the raw
    // Stripe value. Currency-aware display should be handled by frontend/reporting.
    // Normalize to uppercase to match subscription handler and ISO 4217 standard
    const currency = invoice.currency?.toUpperCase() || 'USD';

    // Validate and sanitize billing_reason
    // Known Stripe billing reasons: subscription_create, subscription_cycle, subscription_update,
    // subscription, manual, upcoming, subscription_threshold, automatic_pending_invoice_item_invoice
    const validBillingReasons = [
      'subscription_create',
      'subscription_cycle',
      'subscription_update',
      'subscription',
      'manual',
      'upcoming',
      'subscription_threshold',
      'automatic_pending_invoice_item_invoice',
    ];
    const billingReason = invoice.billing_reason && validBillingReasons.includes(invoice.billing_reason)
      ? invoice.billing_reason
      : (invoice.billing_reason?.substring(0, 100) || 'unknown');

    // Restore subscription to active if it was past_due (payment retry succeeded)
    await client.query(
      `UPDATE subscriptions
       SET status = 'active',
           updated_at = NOW()
       WHERE id = $1 AND status = 'past_due'`,
      [dbSubscriptionId]
    );

    // Create invoice record
    await client.query(
      `INSERT INTO invoices (
        organization_id, subscription_id, stripe_invoice_id,
        amount_cents, amount_paid_cents, currency, status,
        invoice_pdf_url, hosted_invoice_url, billing_reason,
        period_start, period_end, paid_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (stripe_invoice_id) DO UPDATE
      SET status = EXCLUDED.status,
          amount_cents = EXCLUDED.amount_cents,
          amount_paid_cents = EXCLUDED.amount_paid_cents,
          currency = EXCLUDED.currency,
          invoice_pdf_url = EXCLUDED.invoice_pdf_url,
          hosted_invoice_url = EXCLUDED.hosted_invoice_url,
          billing_reason = EXCLUDED.billing_reason,
          period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end,
          paid_at = EXCLUDED.paid_at`,
      [
        organizationId,
        dbSubscriptionId,
        invoice.id,
        invoice.amount_due,
        invoice.amount_paid,
        currency,
        'paid',
        invoice.invoice_pdf,
        invoice.hosted_invoice_url,
        billingReason,
        fromUnixTimestamp(invoice.period_start) || nowUtc(),
        fromUnixTimestamp(invoice.period_end) || nowUtc(),
        nowUtc(),
      ]
    );

    // Link event to subscription and organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Invoice paid: ${invoice.id}, amount: ${invoice.amount_paid}`);

    // TODO: Send receipt email via email service
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle invoice.payment_failed event
 * Marks subscription as past_due and sends warning email
 */
async function handleInvoiceFailed(
  invoice: Stripe.Invoice,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Find subscription in our database
    // invoice.subscription can be string (subscription ID) or Stripe.Subscription object or null
    const invoiceWithSub = invoice as StripeInvoiceWithSubscription;
    const stripeSubId = typeof invoiceWithSub.subscription === 'string'
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id;

    if (!stripeSubId || stripeSubId.trim() === '') {
      throw new Error(`No valid subscription ID found for failed invoice ${invoice.id}. Event will be retried.`);
    }

    const { rows: subRows } = await client.query(
      `SELECT id, organization_id FROM subscriptions
       WHERE stripe_subscription_id = $1`,
      [stripeSubId]
    );

    if (subRows.length === 0) {
      throw new Error(
        `Subscription ${stripeSubId} not found for failed invoice ${invoice.id}. ` +
        `Ensure checkout.session.completed event is processed first. Event will be retried.`
      );
    }

    const { id: dbSubscriptionId, organization_id: organizationId } = subRows[0];

    // Validate amounts don't exceed PostgreSQL INTEGER max
    const amountPaid = invoice.amount_paid || 0;
    if (invoice.amount_due > MAX_INT || amountPaid > MAX_INT) {
      throw new Error(`Invoice amounts exceed max integer value: due=${invoice.amount_due}, paid=${amountPaid}`);
    }

    // Note: For zero-decimal currencies (JPY, KRW, etc.), Stripe returns the actual amount
    // without subunits (¥1000 = 1000, not 100000). Our amount_cents column stores the raw
    // Stripe value. Currency-aware display should be handled by frontend/reporting.
    // Normalize to uppercase to match subscription handler and ISO 4217 standard
    const currency = invoice.currency?.toUpperCase() || 'USD';

    // Validate and sanitize billing_reason
    // Known Stripe billing reasons: subscription_create, subscription_cycle, subscription_update,
    // subscription, manual, upcoming, subscription_threshold, automatic_pending_invoice_item_invoice
    const validBillingReasons = [
      'subscription_create',
      'subscription_cycle',
      'subscription_update',
      'subscription',
      'manual',
      'upcoming',
      'subscription_threshold',
      'automatic_pending_invoice_item_invoice',
    ];
    const billingReason = invoice.billing_reason && validBillingReasons.includes(invoice.billing_reason)
      ? invoice.billing_reason
      : (invoice.billing_reason?.substring(0, 100) || 'unknown');

    // Update subscription status to past_due
    await client.query(
      `UPDATE subscriptions
       SET status = 'past_due',
           updated_at = NOW()
       WHERE id = $1`,
      [dbSubscriptionId]
    );

    // Create/update invoice record
    await client.query(
      `INSERT INTO invoices (
        organization_id, subscription_id, stripe_invoice_id,
        amount_cents, amount_paid_cents, currency, status,
        invoice_pdf_url, hosted_invoice_url, billing_reason,
        period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (stripe_invoice_id) DO UPDATE
      SET status = EXCLUDED.status,
          amount_cents = EXCLUDED.amount_cents,
          amount_paid_cents = EXCLUDED.amount_paid_cents,
          currency = EXCLUDED.currency,
          invoice_pdf_url = EXCLUDED.invoice_pdf_url,
          hosted_invoice_url = EXCLUDED.hosted_invoice_url,
          billing_reason = EXCLUDED.billing_reason,
          period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end`,
      [
        organizationId,
        dbSubscriptionId,
        invoice.id,
        invoice.amount_due,
        amountPaid,
        currency,
        'open',
        invoice.invoice_pdf,
        invoice.hosted_invoice_url,
        billingReason,
        fromUnixTimestamp(invoice.period_start) || nowUtc(),
        fromUnixTimestamp(invoice.period_end) || nowUtc(),
      ]
    );

    // Link event to subscription and organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Invoice payment failed: ${invoice.id}, amount: ${invoice.amount_due}`);

    // TODO: Send warning email via email service
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

// ============================================
// SF-015: New Webhook Handlers
// ============================================

/**
 * Handle customer.updated event
 * Syncs customer name to organization table
 */
async function handleCustomerUpdated(
  customer: Stripe.Customer,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Find subscription by customer ID to get organization ID
    const { rows: subRows } = await client.query(
      `SELECT s.id, s.organization_id, o.name as org_name, o.billing_email as org_billing_email
       FROM subscriptions s
       JOIN organizations o ON s.organization_id = o.id
       WHERE s.stripe_customer_id = $1
       LIMIT 1`,
      [customer.id]
    );

    if (subRows.length === 0) {
      console.log(`No subscription found for customer ${customer.id}, skipping customer.updated`);
      if (useTransaction) {
        await client.query('COMMIT');
      }
      return;
    }

    const { organization_id: organizationId, org_name: currentOrgName, org_billing_email: currentBillingEmail } = subRows[0];

    // Sync customer name and billing email to organization if changed
    // Stripe customer.name may be company name or individual's name
    // Stripe customer.email is the billing contact email
    const nameChanged = customer.name && customer.name !== currentOrgName;
    const emailChanged = customer.email && customer.email !== currentBillingEmail;

    if (nameChanged || emailChanged) {
      const updates: string[] = [];
      const params: (string | number)[] = [];
      let paramIndex = 1;

      if (nameChanged) {
        updates.push(`name = $${paramIndex++}`);
        params.push(customer.name!);
      }
      if (emailChanged) {
        updates.push(`billing_email = $${paramIndex++}`);
        params.push(customer.email!);
      }
      updates.push('updated_at = NOW()');
      params.push(organizationId);

      await client.query(
        `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );

      if (nameChanged) {
        console.log(`Updated organization ${organizationId} name from "${currentOrgName}" to "${customer.name}"`);
      }
      if (emailChanged) {
        console.log(`Updated organization ${organizationId} billing_email from "${currentBillingEmail}" to "${customer.email}"`);
      }
    }

    // Link event to organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1
       WHERE id = $2`,
      [organizationId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Customer updated: ${customer.id}, org: ${organizationId}`);
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle payment_method.attached event
 * Stores payment method in payment_methods table
 */
async function handlePaymentMethodAttached(
  paymentMethod: Stripe.PaymentMethod,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Get customer ID from the payment method
    const customerId = typeof paymentMethod.customer === 'string'
      ? paymentMethod.customer
      : paymentMethod.customer?.id;

    if (!customerId) {
      throw new Error(`Payment method ${paymentMethod.id} has no customer attached`);
    }

    // Find organization by customer ID
    const { rows: subRows } = await client.query(
      `SELECT organization_id FROM subscriptions
       WHERE stripe_customer_id = $1
       LIMIT 1`,
      [customerId]
    );

    if (subRows.length === 0) {
      // Throw error to trigger retry - payment_method.attached can arrive before
      // checkout.session.completed creates the subscription record
      // Stripe will retry, and by then the subscription should exist
      throw new Error(`TRANSIENT: No subscription found for customer ${customerId}, will retry payment_method.attached`);
    }

    const organizationId = subRows[0].organization_id;

    // Extract card details if it's a card payment method
    const cardBrand = paymentMethod.card?.brand || null;
    const cardLast4 = paymentMethod.card?.last4 || null;
    const cardExpMonth = paymentMethod.card?.exp_month || null;
    const cardExpYear = paymentMethod.card?.exp_year || null;

    // Check if this is the first active payment method (make it default)
    // Exclude soft-deleted methods AND the current payment method (for idempotent retries)
    // so a reattach of a previously-default card doesn't lose its default status
    const { rows: existingMethods } = await client.query(
      `SELECT id FROM payment_methods
       WHERE organization_id = $1
       AND deleted_at IS NULL
       AND stripe_payment_method_id != $2`,
      [organizationId, paymentMethod.id]
    );
    const shouldBeDefault = existingMethods.length === 0;

    // Insert or update payment method
    // On conflict (reattach/retry):
    // - Clear deleted_at to reactivate
    // - Preserve existing is_default if card was already default, OR set to true if no other active methods
    // - Use GREATEST to ensure we never downgrade from default to non-default on retry
    await client.query(
      `INSERT INTO payment_methods (
        organization_id, stripe_payment_method_id, type,
        card_brand, card_last4, card_exp_month, card_exp_year,
        is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_payment_method_id) DO UPDATE
      SET type = EXCLUDED.type,
          card_brand = EXCLUDED.card_brand,
          card_last4 = EXCLUDED.card_last4,
          card_exp_month = EXCLUDED.card_exp_month,
          card_exp_year = EXCLUDED.card_exp_year,
          deleted_at = NULL,
          is_default = GREATEST(payment_methods.is_default, EXCLUDED.is_default),
          updated_at = NOW()`,
      [
        organizationId,
        paymentMethod.id,
        paymentMethod.type,
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        shouldBeDefault,
      ]
    );

    // Link event to organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1
       WHERE id = $2`,
      [organizationId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Payment method attached: ${paymentMethod.id}, org: ${organizationId}, type: ${paymentMethod.type}`);
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle payment_method.detached event
 * Soft deletes payment method (sets deleted_at) to preserve audit trail
 */
async function handlePaymentMethodDetached(
  paymentMethod: Stripe.PaymentMethod,
  eventRecordId: number,
  providedClient?: any
): Promise<void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // First, get the current is_default value BEFORE updating
    // (RETURNING returns the value AFTER the update, which would always be FALSE)
    const { rows: currentRows } = await client.query(
      `SELECT id, organization_id, is_default FROM payment_methods
       WHERE stripe_payment_method_id = $1 AND deleted_at IS NULL`,
      [paymentMethod.id]
    );

    if (currentRows.length === 0) {
      console.log(`Payment method ${paymentMethod.id} not found or already deleted, skipping`);
      if (useTransaction) {
        await client.query('COMMIT');
      }
      return;
    }

    const { id: paymentMethodId, organization_id: organizationId, is_default: wasDefault } = currentRows[0];

    // Soft delete: set deleted_at and clear is_default (preserves audit trail)
    await client.query(
      `UPDATE payment_methods
       SET deleted_at = NOW(), is_default = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [paymentMethodId]
    );

    // If the detached method was the default, promote another active method to default
    if (wasDefault) {
      await client.query(
        `UPDATE payment_methods
         SET is_default = TRUE, updated_at = NOW()
         WHERE organization_id = $1
         AND deleted_at IS NULL
         AND id = (
           SELECT id FROM payment_methods
           WHERE organization_id = $1 AND deleted_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [organizationId]
      );
    }

    // Link event to organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1
       WHERE id = $2`,
      [organizationId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Payment method detached: ${paymentMethod.id}, org: ${organizationId}`);
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle customer.subscription.trial_will_end event
 * Sends a 3-day warning email to organization admins
 */
async function handleTrialWillEnd(
  subscription: Stripe.Subscription,
  eventRecordId: number,
  providedClient?: any
): Promise<PostCommitCallback | void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Find subscription and organization details
    const { rows: subRows } = await client.query(
      `SELECT s.id, s.organization_id, s.plan_tier, s.trial_end,
              o.name as org_name
       FROM subscriptions s
       JOIN organizations o ON s.organization_id = o.id
       WHERE s.stripe_subscription_id = $1`,
      [subscription.id]
    );

    if (subRows.length === 0) {
      console.log(`Subscription ${subscription.id} not found, skipping trial_will_end`);
      if (useTransaction) {
        await client.query('COMMIT');
      }
      return;
    }

    const { id: dbSubscriptionId, organization_id: organizationId, plan_tier: planTier, org_name: orgName } = subRows[0];

    // Calculate days remaining
    const trialEnd = subscription.trial_end ? fromUnixTimestamp(subscription.trial_end) : null;
    const daysRemaining = trialEnd
      ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 3;

    // Link event to organization and subscription
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Trial will end: subscription ${subscription.id}, org: ${organizationId}, days: ${daysRemaining}`);

    // Return post-commit callback for email sending
    // This ensures email is only sent AFTER the transaction commits successfully
    // preventing duplicate emails on webhook retries
    return () => {
      organizationService.getAdminEmails(organizationId).then((adminsResult) => {
        if (adminsResult.success && adminsResult.data && adminsResult.data.length > 0) {
          const trialEndDate = trialEnd ? trialEnd.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }) : 'in 3 days';

          const adminEmails = adminsResult.data;
          const adminCount = adminEmails.length;
          emailService.sendTrialEnding(adminEmails, {
            organization_name: orgName,
            plan_tier: planTier,
            trial_end_date: trialEndDate,
            days_remaining: Math.max(1, daysRemaining),
            features_at_risk: [
              'Unlimited sites and content',
              'Priority support',
              'Advanced collaboration features',
              'Custom branding options',
            ],
          }).then(() => {
            console.log(`Trial ending email sent to ${adminCount} admin(s) for org ${organizationId}`);
          }).catch((emailError) => {
            console.error(`Failed to send trial ending email for org ${organizationId}:`, emailError);
          });
        }
      }).catch((error) => {
        console.error(`Failed to get admin emails for org ${organizationId}:`, error);
      });
    };
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

/**
 * Handle invoice.upcoming event
 * Sends a 7-day renewal notice email to organization admins
 */
async function handleInvoiceUpcoming(
  invoice: Stripe.Invoice,
  eventRecordId: number,
  providedClient?: any
): Promise<PostCommitCallback | void> {
  // Use provided client (from outer transaction) or create new one
  const client = providedClient || await pool.connect();
  const useTransaction = !providedClient;

  try {
    if (useTransaction) {
      await client.query('BEGIN');
    }

    // Get subscription ID from invoice
    const invoiceWithSub = invoice as StripeInvoiceWithSubscription;
    const stripeSubId = typeof invoiceWithSub.subscription === 'string'
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id;

    if (!stripeSubId) {
      console.log(`Invoice ${invoice.id} has no subscription, skipping invoice.upcoming`);
      if (useTransaction) {
        await client.query('COMMIT');
      }
      return;
    }

    // Find subscription and organization details
    const { rows: subRows } = await client.query(
      `SELECT s.id, s.organization_id, s.plan_tier, s.billing_cycle, s.amount_cents, s.currency,
              o.name as org_name
       FROM subscriptions s
       JOIN organizations o ON s.organization_id = o.id
       WHERE s.stripe_subscription_id = $1`,
      [stripeSubId]
    );

    if (subRows.length === 0) {
      console.log(`Subscription ${stripeSubId} not found, skipping invoice.upcoming`);
      if (useTransaction) {
        await client.query('COMMIT');
      }
      return;
    }

    const {
      id: dbSubscriptionId,
      organization_id: organizationId,
      plan_tier: planTier,
      billing_cycle: billingCycle,
      amount_cents: amountCents,
      currency,
      org_name: orgName,
    } = subRows[0];

    // Link event to organization and subscription
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    if (useTransaction) {
      await client.query('COMMIT');
    }

    console.log(`Invoice upcoming: ${invoice.id}, subscription: ${stripeSubId}, org: ${organizationId}`);

    // Pre-compute email variables from invoice data (captured in closure)
    // Use invoice amount_due from Stripe (includes coupons, tax, proration, metered usage)
    const invoiceAmountCents = invoice.amount_due ?? invoice.total ?? amountCents;
    const invoiceCurrency = invoice.currency?.toUpperCase() || currency?.toUpperCase() || 'USD';

    // Handle Stripe currency decimal places
    const zeroDecimalCurrencies = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
    const threeDecimalCurrencies = ['BHD', 'JOD', 'KWD', 'OMR', 'TND'];

    let amount: string;
    if (zeroDecimalCurrencies.includes(invoiceCurrency)) {
      amount = invoiceAmountCents.toString();
    } else if (threeDecimalCurrencies.includes(invoiceCurrency)) {
      amount = (invoiceAmountCents / 1000).toFixed(3);
    } else {
      amount = (invoiceAmountCents / 100).toFixed(2);
    }

    // Calculate billing date from invoice timestamps
    const billingTimestamp = invoice.next_payment_attempt || invoice.due_date;
    const billingDate = billingTimestamp
      ? fromUnixTimestamp(billingTimestamp)?.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'in approximately 7 days';

    const collectionMethod = invoice.collection_method as 'charge_automatically' | 'send_invoice' | undefined;

    // Return post-commit callback for email sending
    // This ensures email is only sent AFTER the transaction commits successfully
    // preventing duplicate emails on webhook retries
    return () => {
      organizationService.getAdminEmails(organizationId).then((adminsResult) => {
        if (adminsResult.success && adminsResult.data && adminsResult.data.length > 0) {
          const adminEmails = adminsResult.data;
          const adminCount = adminEmails.length;

          emailService.sendInvoiceUpcoming(adminEmails, {
            organization_name: orgName,
            plan_tier: planTier,
            amount,
            currency: invoiceCurrency,
            billing_date: billingDate || 'soon',
            billing_period: billingCycle === 'annual' ? 'year' : 'month',
            collection_method: collectionMethod,
          }).then(() => {
            console.log(`Invoice upcoming email sent to ${adminCount} admin(s) for org ${organizationId}`);
          }).catch((emailError) => {
            console.error(`Failed to send invoice upcoming email for org ${organizationId}:`, emailError);
          });
        }
      }).catch((error) => {
        console.error(`Failed to get admin emails for org ${organizationId}:`, error);
      });
    };
  } catch (error) {
    if (useTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (useTransaction) {
      client.release();
    }
  }
}

export default router;
