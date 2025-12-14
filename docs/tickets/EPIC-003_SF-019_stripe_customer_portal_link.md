# SF-019: Stripe Customer Portal Link

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 1 day
**Status**: Completed
**Dependencies**: SF-017
**Assigned To**: Backend Engineer

---

## Objective

Add "Manage Billing" button that opens Stripe Customer Portal

---

## Requirements

### Functional Requirements

- Button calls POST /api/billing/portal (changed from GET for session creation)
- Redirect to Customer Portal URL
- Portal allows plan changes, payment method updates
- Return URL set to billing page

---

## Technical Design

### Backend Implementation

**Route**: `POST /api/billing/portal` (`backend/src/routes/billing.ts:279-317`)

```typescript
router.post('/portal', authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const organizationId = req.user?.organizationId;
  const returnUrl = req.body.return_url || `${process.env.FRONTEND_URL}/admin/billing`;

  const result = await subscriptionService.getCustomerPortalUrl(
    organizationId,
    userId,
    returnUrl
  );

  res.json({
    success: true,
    data: { portal_url: result.data!.portalUrl },
  });
});
```

**Service**: `SubscriptionService.getCustomerPortalUrl()` (`backend/src/services/SubscriptionService.ts:215-260`)

### Frontend Implementation

**Service**: `billingService.getPortalUrl()` (`frontend/src/services/billing.ts:137-145`)

```typescript
getPortalUrl: async (returnUrl?: string): Promise<string> => {
  const response = await api.post<ApiResponse<{ portal_url: string }>>('/billing/portal', {
    return_url: returnUrl,
  });
  return response.data.data.portal_url;
}
```

**Page Handler**: `BillingPage` (`frontend/src/pages/admin/BillingPage.tsx:77-106`)

```typescript
const portalMutation = useMutation({
  mutationFn: billingService.getPortalUrl,
  onSuccess: (url) => {
    window.location.href = url;
  },
});

const handleManageBilling = () => {
  portalMutation.mutate(undefined);
};
```

**UI Component**: `CurrentPlanCard` (`frontend/src/components/billing/CurrentPlanCard.tsx:124-131`)

```tsx
{isPaid && (
  <button onClick={onManageBillingClick}>
    Manage Billing
  </button>
)}
```

---

## Acceptance Criteria

- [x] Button opens Stripe Customer Portal
- [x] Portal allows subscription changes
- [x] Return URL brings user back to billing page
- [x] Works for all plan tiers (starter, pro, enterprise)

---

## Testing

### Unit Tests

**Backend Tests** (`backend/src/__tests__/routes/billing.test.ts:305-338`)
- `should return portal URL` - Tests successful portal session creation
- `should return error when no subscription exists` - Tests error handling

**Frontend Tests** (`frontend/src/components/billing/__tests__/CurrentPlanCard.test.tsx`)
- 20 tests covering CurrentPlanCard component including:
  - `shows Manage Billing button for paid plans`
  - `calls onManageBillingClick when Manage Billing button is clicked`
  - `shows Manage Billing button for all paid tiers (starter)`
  - `shows Manage Billing button for all paid tiers (pro)`
  - `shows Manage Billing button for enterprise tier`
  - `does not show Manage Billing button for free tier`

Target coverage: >90% - Achieved

### Integration Tests

Verified with Stripe test mode during development.

### Manual Testing

Verified in development environment:
1. Click "Manage Billing" button on billing page
2. Redirected to Stripe Customer Portal
3. Can update payment methods and subscription
4. Return URL correctly brings user back to `/admin/billing`

---

## Documentation

- [x] `docs/API_BILLING.md` - Endpoint documented (lines 670-703)
- [x] Tests added for CurrentPlanCard component

---

## Deployment Notes

### Environment Variables

Required environment variables (already configured):
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `FRONTEND_URL` - Frontend base URL for return URL (default: `http://localhost:5173`)

### Database Changes

No database migrations required.

### Testing Checklist

- [x] Unit tests pass (14 backend billing tests, 20 frontend CurrentPlanCard tests)
- [x] Integration tests pass
- [x] Manual testing complete
- [x] Documentation updated
- [x] Code review approved

---

## Implementation Notes

The feature was implemented as part of SF-017 and SF-018. This ticket adds:
1. Comprehensive frontend unit tests for CurrentPlanCard component
2. Verification that all acceptance criteria are met
3. Complete documentation of the implementation

**Key Design Decision**: Changed from GET to POST for `/api/billing/portal` because:
- Creating a Stripe portal session is a state-changing operation
- POST is more semantically correct for session creation
- Allows passing custom return URL in request body

---

**Created**: 2025-01-21
**Last Updated**: 2025-12-14
**Completed**: 2025-12-14
