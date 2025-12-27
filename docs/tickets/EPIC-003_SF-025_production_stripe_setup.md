# SF-025: Production Stripe Setup

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 6 (Testing & Production Deployment)
**Priority**: P0
**Estimated Effort**: 1 day
**Status**: Documentation Complete
**Dependencies**: SF-024
**Assigned To**: Backend Engineer

---

## Objective

Configure Stripe production mode and deploy live keys

---

## Requirements

### Functional Requirements

- Create production products/prices
- Generate live API keys
- Configure production webhook endpoint
- Enable Stripe Tax (optional)
- Set up domain authentication for emails
- Test production webhook delivery

---

## Technical Design

Checklist:
1. Switch to live mode in Stripe Dashboard
2. Create products (Starter, Pro, Enterprise)
3. Create prices (monthly, annual)
4. Generate live keys (pk_live_..., sk_live_...)
5. Add webhook: https://api.dprogres.com/api/webhooks/stripe
6. Update production env vars in hosting platform
7. Test webhook: stripe trigger checkout.session.completed --live

---

## Acceptance Criteria

**Documentation Complete:**
- [x] Comprehensive `STRIPE_SETUP.md` with test and production instructions
- [x] `DEPLOYMENT_CHECKLIST.md` with step-by-step deployment guide
- [x] `API_BILLING.md` updated with production notes
- [x] `CLAUDE.md` updated with Stripe environment variables

**Manual Steps Required (see docs/STRIPE_SETUP.md):**
- [ ] Production products created in Stripe Dashboard
- [ ] Live API keys generated in Stripe Dashboard
- [ ] Production webhook endpoint configured in Stripe Dashboard
- [ ] Test webhook delivered successfully
- [ ] Environment variables updated in hosting platform
- [ ] First production transaction processed

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

**Delivered:**
- `docs/STRIPE_SETUP.md` - Complete production setup guide with checklists
- `docs/DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment procedures
- `docs/API_BILLING.md` - Added production deployment section
- `CLAUDE.md` - Added Stripe environment variables documentation

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
