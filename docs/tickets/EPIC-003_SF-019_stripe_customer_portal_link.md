# SF-019: Stripe Customer Portal Link

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 1 day
**Status**: Not Started
**Dependencies**: SF-017
**Assigned To**: Backend Engineer

---

## Objective

Add "Manage Billing" button that opens Stripe Customer Portal

---

## Requirements

### Functional Requirements

- Button calls GET /api/billing/portal
- Redirect to Customer Portal URL
- Portal allows plan changes, payment method updates
- Return URL set to billing page

---

## Technical Design

const handleManageBilling = async () => {
  const response = await fetch('/api/billing/portal');
  const { portalUrl } = await response.json();
  window.location.href = portalUrl;
};

<button onClick={handleManageBilling}>
  Manage Billing
</button>

---

## Acceptance Criteria

- [ ] Button opens Stripe Customer Portal
- [ ] Portal allows subscription changes
- [ ] Return URL brings user back to billing page
- [ ] Works for all plan tiers

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
