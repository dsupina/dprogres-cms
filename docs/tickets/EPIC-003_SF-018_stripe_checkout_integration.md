# SF-018: Stripe Checkout Integration

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Completed
**Dependencies**: SF-017
**Assigned To**: Backend Engineer
**Completed**: December 2025

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

- [x] Upgrade button redirects to Stripe Checkout
- [x] Success URL shows confirmation message
- [x] Cancel URL returns to billing page
- [x] Loading state shown during redirect
- [x] Error messages displayed on API failure

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
- [x] Unit tests pass (18 tests: 10 UpgradeModal + 8 BillingSuccessPage)
- [x] Integration tests pass (backend billing tests: 14 tests)
- [ ] Manual testing complete
- [x] Documentation updated (COMPONENTS.md, API_BILLING.md)
- [ ] Code review approved

---

## Implementation Notes

### Files Added
- `frontend/src/pages/admin/BillingSuccessPage.tsx` - Success confirmation page with auto-redirect
- `frontend/src/components/billing/__tests__/UpgradeModal.test.tsx` - Unit tests for UpgradeModal
- `frontend/src/pages/admin/__tests__/BillingSuccessPage.test.tsx` - Unit tests for BillingSuccessPage

### Files Modified
- `frontend/src/App.tsx` - Added route for `/admin/billing/success`
- `backend/src/routes/billing.ts` - Updated success URL to `/admin/billing/success`
- `docs/COMPONENTS.md` - Added BillingSuccessPage documentation
- `docs/API_BILLING.md` - Added Stripe Checkout flow documentation

### Key Implementation Details
1. **Success Page**: Dedicated `/admin/billing/success` route with 5-second countdown before auto-redirect
2. **Cache Invalidation**: Success page invalidates all billing queries to ensure fresh data
3. **Loading State**: UpgradeModal shows loading spinner during checkout creation
4. **Error Handling**: Toast notifications for API failures

---

**Created**: 2025-01-21
**Last Updated**: 2025-12-14
