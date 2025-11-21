# SF-018: Stripe Checkout Integration

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Not Started
**Dependencies**: SF-017
**Assigned To**: Backend Engineer

---

## Objective

Integrate Stripe Checkout redirect flow in frontend

---

## Requirements

### Functional Requirements

- Upgrade button calls POST /api/billing/checkout
- Redirect to Stripe Checkout session URL
- Handle success/cancel redirects
- Show loading state during redirect
- Display error messages on failure

---

## Technical Design

frontend/src/components/UpgradeModal.tsx

const handleUpgrade = async (tier, cycle) => {
  setLoading(true);

  const response = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planTier: tier,
      billingCycle: cycle,
      successUrl: window.location.origin + '/billing/success',
      cancelUrl: window.location.origin + '/billing',
    }),
  });

  const { sessionUrl } = await response.json();
  window.location.href = sessionUrl; // Redirect to Stripe
};

---

## Acceptance Criteria

- [ ] Upgrade button redirects to Stripe Checkout
- [ ] Success URL shows confirmation message
- [ ] Cancel URL returns to billing page
- [ ] Loading state shown during redirect
- [ ] Error messages displayed on API failure

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
