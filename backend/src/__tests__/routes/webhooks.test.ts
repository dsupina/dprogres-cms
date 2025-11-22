import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Create mock function instances with explicit 'any' type
const mockPoolConnect: any = jest.fn();
const mockPoolQuery: any = jest.fn();
const mockClientQuery: any = jest.fn();
const mockClientRelease: any = jest.fn();
const mockStripeWebhooksConstructEvent: any = jest.fn();
const mockStripeSubscriptionsRetrieve: any = jest.fn();

// Mock Stripe
jest.mock('../../config/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockStripeWebhooksConstructEvent,
    },
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  },
}));

// Mock database
jest.mock('../../utils/database', () => ({
  pool: {
    connect: mockPoolConnect,
    query: mockPoolQuery,
  },
}));

// Import webhook routes after mocks are defined
import webhooksRoutes from '../../routes/webhooks';

describe('Webhooks - Stripe Event Handler', () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup Express app with webhook routes
    app = express();
    app.use(express.raw({ type: 'application/json' }));
    app.use('/webhooks', webhooksRoutes);

    // Setup mock client
    const mockClient = {
      query: mockClientQuery,
      release: mockClientRelease,
    };

    mockPoolConnect.mockResolvedValue(mockClient);
  });

  describe('POST /webhooks/stripe', () => {
    it('should reject webhook without signature header', async () => {
      const response = await request(app)
        .post('/webhooks/stripe')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing stripe-signature');
    });

    it('should reject webhook with invalid signature', async () => {
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'invalid_sig')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Webhook Error');
    });

    it('should reject duplicate events (idempotency check)', async () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            metadata: {
              organization_id: '1',
              plan_tier: 'starter',
              billing_cycle: 'monthly',
            },
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - no rows returned (duplicate)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock transaction BEGIN
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE SKIP LOCKED - event was already processed
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, processed_at: new Date() }] });

      // Mock COMMIT
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.duplicate).toBe(true);
    });

    it('should skip events being processed concurrently (SKIP LOCKED)', async () => {
      const mockEvent = {
        id: 'evt_concurrent',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_concurrent',
            subscription: 'sub_concurrent',
            customer: 'cus_concurrent',
            metadata: {
              organization_id: '1',
              plan_tier: 'starter',
              billing_cycle: 'monthly',
            },
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - no rows returned (duplicate event ID)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock transaction BEGIN
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE SKIP LOCKED - returns no rows (locked by another process)
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      // Mock COMMIT
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.concurrent).toBe(true);
    });

    it('should retry events that failed previously (processed_at = NULL)', async () => {
      const mockEvent = {
        id: 'evt_test_retry',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test456',
            subscription: 'sub_test456',
            customer: 'cus_test456',
            metadata: {
              organization_id: '1',
              plan_tier: 'starter',
              billing_cycle: 'monthly',
            },
          },
        },
      };

      const mockSubscription = {
        id: 'sub_test456',
        status: 'active',
        current_period_start: 1672531200,
        current_period_end: 1675209600,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: {
                id: 'price_test456',
                unit_amount: 2900,
              },
            },
          ],
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - no rows returned (duplicate event ID)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Mock outer transaction BEGIN (for retry path)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE SKIP LOCKED - returns row with processed_at = NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 10, processed_at: null }] });

      // Mock Stripe subscription retrieve
      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce(mockSubscription);

      // Mock inner transaction BEGIN (for handleCheckoutCompleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock INSERT subscription
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (for handleCheckoutCompleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for retry path)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.retried).toBe(true);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test456');
    });

    it('should handle checkout.session.completed event', async () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            metadata: {
              organization_id: '1',
              plan_tier: 'starter',
              billing_cycle: 'monthly',
            },
          },
        },
      };

      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        current_period_start: 1672531200,
        current_period_end: 1675209600,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: {
                id: 'price_test123',
                unit_amount: 2900,
              },
            },
          ],
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, processed_at: null }] });

      // Mock Stripe subscription retrieve
      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce(mockSubscription);

      // Mock inner transaction BEGIN (handleCheckoutCompleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock INSERT subscription
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (handleCheckoutCompleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test123');
    });

    it('should handle customer.subscription.created event with metadata', async () => {
      const mockEvent = {
        id: 'evt_test_created',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_new',
            customer: 'cus_test123',
            status: 'active',
            current_period_start: 1672531200,
            current_period_end: 1675209600,
            cancel_at_period_end: false,
            canceled_at: null,
            metadata: {
              organization_id: '1',
              plan_tier: 'pro',
              billing_cycle: 'annual',
            },
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_annual',
                    unit_amount: 9900,
                  },
                },
              ],
            },
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 2, processed_at: null }] });

      // Mock inner transaction BEGIN (handleSubscriptionUpdated)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock INSERT subscription (UPSERT)
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, organization_id: 1 }] });

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (handleSubscriptionUpdated)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle customer.subscription.updated event', async () => {
      const mockEvent = {
        id: 'evt_test456',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active',
            current_period_start: 1672531200,
            current_period_end: 1675209600,
            cancel_at_period_end: false,
            canceled_at: null,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test123',
                    unit_amount: 2900,
                  },
                },
              ],
            },
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 2, processed_at: null }] });

      // Mock inner transaction BEGIN (handleSubscriptionUpdated)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE subscription
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, organization_id: 1 }] });

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (handleSubscriptionUpdated)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle customer.subscription.deleted event', async () => {
      const mockEvent = {
        id: 'evt_test789',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test123',
            canceled_at: 1672531200,
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 3, processed_at: null }] });

      // Mock inner transaction BEGIN (handleSubscriptionDeleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE subscription to canceled
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, organization_id: 1 }] });

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (handleSubscriptionDeleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle invoice.payment_succeeded event', async () => {
      const mockEvent = {
        id: 'evt_test101',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            amount_paid: 2900,
            invoice_pdf: 'https://invoice.pdf',
            hosted_invoice_url: 'https://invoice.url',
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 4 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 4, processed_at: null }] });

      // Mock inner transaction BEGIN (handleInvoicePaid)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT subscription
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, organization_id: 1 }] });

      // Mock INSERT invoice
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (handleInvoicePaid)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle invoice.payment_failed event', async () => {
      const mockEvent = {
        id: 'evt_test202',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test456',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            amount_due: 2900,
            invoice_pdf: 'https://invoice.pdf',
            hosted_invoice_url: 'https://invoice.url',
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 5, processed_at: null }] });

      // Mock inner transaction BEGIN (handleInvoiceFailed)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT subscription
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, organization_id: 1 }] });

      // Mock UPDATE subscription to past_due
      mockClientQuery.mockResolvedValueOnce({});

      // Mock INSERT invoice
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE subscription_events
      mockClientQuery.mockResolvedValueOnce({});

      // Mock inner COMMIT (handleInvoiceFailed)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle unknown event types gracefully', async () => {
      const mockEvent = {
        id: 'evt_test303',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test123',
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 6 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 6, processed_at: null }] });

      // No handler queries for unknown event type

      // Mock UPDATE to set processed_at
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer COMMIT (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should log errors but still return 200 OK', async () => {
      const mockEvent = {
        id: 'evt_test404',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
            metadata: {}, // Missing required metadata
          },
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

      // Mock idempotency check - event is new
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });

      // Mock outer transaction BEGIN (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock SELECT FOR UPDATE - returns row with processed_at=NULL
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 7, processed_at: null }] });

      // Mock Stripe subscription retrieve
      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
        id: 'sub_test123',
      });

      // Mock inner transaction BEGIN (handleCheckoutCompleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock will fail due to missing metadata
      mockClientQuery.mockRejectedValueOnce(new Error('Missing required metadata'));

      // Mock inner ROLLBACK (handleCheckoutCompleted)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock outer ROLLBACK (for locking)
      mockClientQuery.mockResolvedValueOnce({});

      // Mock error logging
      mockPoolQuery.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(mockEvent);

      // Should still return 200 to prevent Stripe retries
      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
    });
  });
});
