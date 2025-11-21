import { Router, Request, Response } from 'express';
import { stripe } from '../config/stripe';
import { pool } from '../utils/database';
import type Stripe from 'stripe';

const router = Router();

// Webhook signing secret from environment
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

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
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    // Idempotency check: Try to insert event into subscription_events
    const { rows } = await pool.query(
      `INSERT INTO subscription_events (stripe_event_id, event_type, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING id`,
      [event.id, event.type, JSON.stringify(event.data)]
    );

    // If no rows returned, event was already processed
    if (rows.length === 0) {
      console.log(`Event ${event.id} already processed, skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    const eventRecordId = rows[0].id;

    // Route event to appropriate handler
    await handleWebhookEvent(event, eventRecordId);

    // Return 200 OK to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook event:', error);

    // Log error to subscription_events table
    try {
      await pool.query(
        `UPDATE subscription_events
         SET processing_error = $1
         WHERE stripe_event_id = $2`,
        [error.message, event.id]
      );
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }

    // Still return 200 to prevent Stripe retries for unrecoverable errors
    return res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Route webhook event to appropriate handler
 */
async function handleWebhookEvent(event: Stripe.Event, eventRecordId: number): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, eventRecordId);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, eventRecordId);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, eventRecordId);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event.data.object as Stripe.Invoice, eventRecordId);
      break;

    case 'invoice.payment_failed':
      await handleInvoiceFailed(event.data.object as Stripe.Invoice, eventRecordId);
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
  eventRecordId: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get subscription details from Stripe
    const subscriptionId = session.subscription as string;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Extract metadata from session
    const organizationId = parseInt(session.metadata?.organization_id || '0');
    const planTier = session.metadata?.plan_tier as 'free' | 'starter' | 'pro' | 'enterprise';
    const billingCycle = session.metadata?.billing_cycle as 'monthly' | 'annual';

    if (!organizationId || !planTier || !billingCycle) {
      throw new Error('Missing required metadata in checkout session');
    }

    // Create subscription record
    const { rows } = await client.query(
      `INSERT INTO subscriptions (
        organization_id, stripe_customer_id, stripe_subscription_id,
        stripe_price_id, plan_tier, billing_cycle, status,
        current_period_start, current_period_end, cancel_at_period_end,
        amount_cents
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        subscription.items.data[0].price.unit_amount || 0,
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

    await client.query('COMMIT');

    console.log(`Checkout completed for org ${organizationId}, subscription ${subscriptionId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle customer.subscription.updated event
 * Updates subscription status and details
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  eventRecordId: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update subscription record
    const { rows } = await client.query(
      `UPDATE subscriptions
       SET status = $1,
           current_period_start = $2,
           current_period_end = $3,
           cancel_at_period_end = $4,
           canceled_at = $5,
           updated_at = NOW()
       WHERE stripe_subscription_id = $6
       RETURNING id, organization_id`,
      [
        subscription.status,
        new Date((subscription as any).current_period_start * 1000),
        new Date((subscription as any).current_period_end * 1000),
        (subscription as any).cancel_at_period_end,
        (subscription as any).canceled_at ? new Date((subscription as any).canceled_at * 1000) : null,
        subscription.id,
      ]
    );

    if (rows.length > 0) {
      // Link event to subscription and organization
      await client.query(
        `UPDATE subscription_events
         SET organization_id = $1, subscription_id = $2
         WHERE id = $3`,
        [rows[0].organization_id, rows[0].id, eventRecordId]
      );
    }

    await client.query('COMMIT');

    console.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle customer.subscription.deleted event
 * Marks subscription as canceled
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  eventRecordId: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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

    if (rows.length > 0) {
      // Link event to subscription and organization
      await client.query(
        `UPDATE subscription_events
         SET organization_id = $1, subscription_id = $2
         WHERE id = $3`,
        [rows[0].organization_id, rows[0].id, eventRecordId]
      );
    }

    await client.query('COMMIT');

    console.log(`Subscription deleted: ${subscription.id}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle invoice.payment_succeeded event
 * Creates invoice record and sends receipt
 */
async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventRecordId: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find subscription in our database
    const stripeSubId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id;

    if (!stripeSubId) {
      console.warn(`No subscription found for invoice ${invoice.id}`);
      await client.query('COMMIT');
      return;
    }

    const { rows: subRows } = await client.query(
      `SELECT id, organization_id FROM subscriptions
       WHERE stripe_subscription_id = $1`,
      [stripeSubId]
    );

    if (subRows.length === 0) {
      console.warn(`Subscription not found for invoice ${invoice.id}`);
      await client.query('COMMIT');
      return;
    }

    const { id: dbSubscriptionId, organization_id: organizationId } = subRows[0];

    // Create invoice record
    await client.query(
      `INSERT INTO invoices (
        organization_id, subscription_id, stripe_invoice_id,
        stripe_customer_id, amount_cents, status, invoice_pdf_url, hosted_invoice_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_invoice_id) DO UPDATE
      SET status = EXCLUDED.status,
          updated_at = NOW()`,
      [
        organizationId,
        dbSubscriptionId,
        invoice.id,
        invoice.customer,
        invoice.amount_paid,
        'paid',
        invoice.invoice_pdf,
        invoice.hosted_invoice_url,
      ]
    );

    // Link event to subscription and organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    await client.query('COMMIT');

    console.log(`Invoice paid: ${invoice.id}, amount: ${invoice.amount_paid}`);

    // TODO: Send receipt email via email service
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle invoice.payment_failed event
 * Marks subscription as past_due and sends warning email
 */
async function handleInvoiceFailed(
  invoice: Stripe.Invoice,
  eventRecordId: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find subscription in our database
    const stripeSubId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id;

    if (!stripeSubId) {
      console.warn(`No subscription found for failed invoice ${invoice.id}`);
      await client.query('COMMIT');
      return;
    }

    const { rows: subRows } = await client.query(
      `SELECT id, organization_id FROM subscriptions
       WHERE stripe_subscription_id = $1`,
      [stripeSubId]
    );

    if (subRows.length === 0) {
      console.warn(`Subscription not found for failed invoice ${invoice.id}`);
      await client.query('COMMIT');
      return;
    }

    const { id: dbSubscriptionId, organization_id: organizationId } = subRows[0];

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
        stripe_customer_id, amount_cents, status, invoice_pdf_url, hosted_invoice_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_invoice_id) DO UPDATE
      SET status = EXCLUDED.status,
          updated_at = NOW()`,
      [
        organizationId,
        dbSubscriptionId,
        invoice.id,
        invoice.customer,
        invoice.amount_due,
        'failed',
        invoice.invoice_pdf,
        invoice.hosted_invoice_url,
      ]
    );

    // Link event to subscription and organization
    await client.query(
      `UPDATE subscription_events
       SET organization_id = $1, subscription_id = $2
       WHERE id = $3`,
      [organizationId, dbSubscriptionId, eventRecordId]
    );

    await client.query('COMMIT');

    console.log(`Invoice payment failed: ${invoice.id}, amount: ${invoice.amount_due}`);

    // TODO: Send warning email via email service
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default router;
