# SF-024: E2E Tests - Signup to Checkout Flow

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 6 (Testing & Production Deployment)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Not Started
**Dependencies**: SF-023
**Assigned To**: Backend Engineer

---

## Objective

Write end-to-end tests using Playwright covering full user flow

---

## Requirements

### Functional Requirements

- Signup → auto-create Free org
- Login → view billing page
- Upgrade → Stripe Checkout
- Webhook → database updated
- Dashboard → shows Pro tier

---

## Technical Design

frontend/tests/e2e/billing-flow.spec.ts

test('full billing flow', async ({ page }) => {
  // 1. Signup
  await page.goto('/register');
  await page.fill('input[name=email]', 'test@example.com');
  // ... complete signup

  // 2. View billing page
  await page.goto('/admin/billing');
  await expect(page.locator('text=Free Plan')).toBeVisible();

  // 3. Click upgrade
  await page.click('button:text("Upgrade")');

  // 4. Stripe Checkout (use test card)
  await page.waitForURL(/checkout.stripe.com/);
  // ... fill Stripe form

  // 5. Verify success
  await page.waitForURL(/billing\/success/);
  await expect(page.locator('text=Pro Plan')).toBeVisible();
});

---

## Acceptance Criteria

- [ ] E2E test covers signup to upgrade
- [ ] Stripe test mode used
- [ ] Test runs in CI/CD
- [ ] Includes success and error paths
- [ ] Test execution <2 minutes

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
