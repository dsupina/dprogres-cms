# SF-017: Billing Page UI & Layout

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: Phase 4 complete
**Assigned To**: Backend Engineer

---

## Objective

Build billing dashboard UI showing plan, usage, and upgrade CTA

---

## Requirements

### Functional Requirements

- Current plan card (tier, price, billing cycle)
- Usage overview (5 quota dimensions)
- Upgrade CTA button
- Invoice history table
- Manage billing link (Customer Portal)
- Responsive design (mobile-first)

---

## Technical Design

frontend/src/pages/admin/BillingPage.tsx

Components:
- <CurrentPlanCard />: Shows tier, price, next billing date
- <UsageOverview />: 5 progress bars (sites, posts, users, storage, API)
- <UpgradeModal />: Plan comparison table
- <InvoiceTable />: List of past invoices with download links
- <ManageBillingButton />: Opens Stripe Customer Portal

API Calls:
- GET /api/billing/subscription
- GET /api/billing/invoices
- GET /api/quotas/status

---

## Acceptance Criteria

- [ ] Billing page renders without errors
- [ ] Current plan displayed correctly
- [ ] Usage bars show accurate percentages
- [ ] Upgrade CTA opens modal
- [ ] Invoice table shows past invoices
- [ ] Responsive on mobile

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
