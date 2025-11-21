# SF-004: Webhook Handler with Idempotency

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 1 (Database & Stripe Foundation)
**Priority**: P0
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: SF-003
**Assigned To**: Backend Engineer

---

## Objective

Build webhook handler to process Stripe events with idempotency protection

---

## Requirements

### Functional Requirements

- Process checkout.session.completed event
- Process customer.subscription.created/updated/deleted events
- Process invoice.payment_succeeded/failed events
- Implement idempotency using stripe_event_id uniqueness
- Store all events in subscription_events table for audit
- Handle webhook signature verification
- Return 200 OK immediately, process async if needed

---

## Technical Design

Create backend/src/routes/webhooks.ts:

POST /api/webhooks/stripe
- Verify Stripe signature using stripe.webhooks.constructEvent()
- Check stripe_event_id uniqueness in subscription_events table
- Route event to appropriate handler based on event.type
- Update subscriptions table based on event data
- Emit events for downstream processing (email, quota updates)
- Return 200 OK within 5 seconds (Stripe timeout)

Event Handlers:
- handleCheckoutCompleted(): Create subscription record
- handleSubscriptionUpdated(): Update subscription status
- handleSubscriptionDeleted(): Mark as canceled
- handleInvoicePaid(): Create invoice record, send receipt
- handleInvoiceFailed(): Mark past_due, send warning email

Idempotency:
INSERT INTO subscription_events (stripe_event_id, ...)
ON CONFLICT (stripe_event_id) DO NOTHING
RETURNING id;

If no rows returned, event already processed

---

## Acceptance Criteria

- [ ] Webhook endpoint at /api/webhooks/stripe responds 200
- [ ] Stripe signature verified correctly
- [ ] Duplicate events ignored (idempotency check)
- [ ] All event types handled without errors
- [ ] Database updated atomically (transaction)
- [ ] Events logged in subscription_events table
- [ ] Integration test with Stripe CLI passes

---

## Testing

### Unit Tests

Write comprehensive unit tests covering all methods and edge cases.

Target coverage: >90%

### Integration Tests

Test end-to-end flows with real dependencies (Stripe test mode, database).

### Manual Testing

Verify functionality in development environment before marking as complete.

---

## Documentation

Update relevant documentation files:
- `docs/COMPONENTS.md` - Add service description
- `docs/API_BILLING.md` - Document new endpoints
- `docs/PATTERNS.md` - Document patterns used

---

## Deployment Notes

### Environment Variables

List required environment variables and their purposes.

### Database Changes

List any database migrations or schema changes.

### Testing Checklist

Provide checklist for validating deployment:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Code review approved

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
