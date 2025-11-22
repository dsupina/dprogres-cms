import { Router, Request, Response } from 'express';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../config/stripe';
import { pool } from '../utils/database';
import type Stripe from 'stripe';

const router = Router();

// PostgreSQL INTEGER max value (2^31 - 1)
const MAX_INT = 2147483647;

// Zero-decimal currencies (no cents, e.g., ¥1000 = 1000, not 100000)
// Stripe returns these as the actual amount, not in subunits
const ZERO_DECIMAL_CURRENCIES = ['jpy', 'krw', 'vnd', 'clp', 'pyg', 'xaf', 'xof', 'xpf', 'bif', 'djf', 'gnf', 'kmf', 'mga', 'rwf', 'ugx'];

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
  // These errors explicitly say "Event will be retried" in the error message
  if (message.includes('event will be retried')) {
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
    console.error('Webhook signature verification failed:', err.message);
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
    let preloadedSubscription: any = null;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      if (session.subscription) {
        try {
          preloadedSubscription = await stripe.subscriptions.retrieve(session.subscription as string);
        } catch (err: any) {
          console.error(`Failed to fetch subscription ${session.subscription}:`, err.message);
          // Re-throw original error to preserve Stripe metadata (type, statusCode)
          // isTransientError() needs these fields to classify rate limits and 5xx errors
          throw err;
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
      await handleWebhookEvent(event, eventRecordId, client, preloadedSubscription);

      // Mark as successfully processed (clear any prior error from failed attempts)
      await client.query(
        `UPDATE subscription_events
         SET processed_at = NOW(), processing_error = NULL
         WHERE id = $1`,
        [eventRecordId]
      );

      await client.query('COMMIT');

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

/**
 * Route webhook event to appropriate handler
 */
async function handleWebhookEvent(
  event: Stripe.Event,
  eventRecordId: number,
  client?: any,
  preloadedSubscription?: any
): Promise<void> {
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

  const subscriptionId = session.subscription as string;

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
    const organizationId = parseInt(session.metadata?.organization_id || '0');
    const planTier = session.metadata?.plan_tier as 'free' | 'starter' | 'pro' | 'enterprise';
    const billingCycle = session.metadata?.billing_cycle as 'monthly' | 'annual';

    if (!organizationId || isNaN(organizationId) || !planTier || !billingCycle) {
      throw new Error('Missing required metadata in checkout session');
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
        session.customer,
        subscriptionId,
        subscription.items.data[0].price.id,
        planTier,
        billingCycle,
        subscription.status,
        new Date((subscription as any).current_period_start * 1000),
        new Date((subscription as any).current_period_end * 1000),
        (subscription as any).cancel_at_period_end,
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
    const organizationId = parseInt((subscription as any).metadata?.organization_id || '0');
    const planTier = (subscription as any).metadata?.plan_tier as 'free' | 'starter' | 'pro' | 'enterprise' | undefined;
    const billingCycle = (subscription as any).metadata?.billing_cycle as 'monthly' | 'annual' | undefined;

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
    if (organizationId && !isNaN(organizationId) && planTier && billingCycle) {
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
          new Date((subscription as any).current_period_start * 1000),
          new Date((subscription as any).current_period_end * 1000),
          (subscription as any).cancel_at_period_end,
          (subscription as any).canceled_at ? new Date((subscription as any).canceled_at * 1000) : null,
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
          new Date((subscription as any).current_period_start * 1000),
          new Date((subscription as any).current_period_end * 1000),
          (subscription as any).cancel_at_period_end,
          (subscription as any).canceled_at ? new Date((subscription as any).canceled_at * 1000) : null,
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
        subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
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
    const stripeSubId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id;

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
    const currency = invoice.currency || 'usd';

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
          amount_paid_cents = EXCLUDED.amount_paid_cents,
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
        invoice.billing_reason,
        invoice.period_start !== null && invoice.period_start !== undefined
          ? new Date(invoice.period_start * 1000)
          : new Date(),
        invoice.period_end !== null && invoice.period_end !== undefined
          ? new Date(invoice.period_end * 1000)
          : new Date(),
        new Date(),
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
    const stripeSubId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id;

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
    const currency = invoice.currency || 'usd';

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
      SET status = EXCLUDED.status`,
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
        invoice.billing_reason,
        invoice.period_start !== null && invoice.period_start !== undefined
          ? new Date(invoice.period_start * 1000)
          : new Date(),
        invoice.period_end !== null && invoice.period_end !== undefined
          ? new Date(invoice.period_end * 1000)
          : new Date(),
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

export default router;
