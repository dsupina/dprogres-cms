# SF-016: Subscription Lifecycle Management

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 4 (Webhooks & Email System)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: ✅ Completed (December 2025)
**Dependencies**: SF-015
**Assigned To**: Backend Engineer

---

## Objective

Implement subscription state machine and lifecycle transitions

---

## Requirements

### Functional Requirements

- trialing → active (trial ends, payment succeeds)
- active → past_due (payment fails)
- past_due → active (payment retried, succeeds)
- past_due → canceled (grace period expires)
- active → canceled (user cancels)
- Grace period: 7 days past_due before downgrade

---

## Technical Design

State Machine:
trialing ──payment_succeeds──> active
active ──payment_fails──> past_due
past_due ──payment_succeeds──> active
past_due ──grace_expires(7d)──> canceled
active ──user_cancels──> canceled

Downgrade Logic:
if (status === 'canceled') {
  await pool.query(`
    UPDATE organizations
    SET plan_tier = 'free'
    WHERE id = $1
  `, [organizationId]);

  await resetQuotasToFree(organizationId);
}

---

## Acceptance Criteria

- [ ] All state transitions handled
- [ ] Grace period enforced (7 days)
- [ ] Downgrade to Free tier automated
- [ ] Quotas reset when downgraded
- [ ] Integration test covers full lifecycle

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
