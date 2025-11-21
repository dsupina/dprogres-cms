# SF-010: Quota Enforcement Middleware

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 3 (Quota System & Enforcement)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Not Started
**Dependencies**: SF-009
**Assigned To**: Backend Engineer

---

## Objective

Create middleware to enforce quotas before resource creation

---

## Requirements

### Functional Requirements

- Check quotas before POST/PUT operations
- Return 402 Payment Required when quota exceeded
- Include upgrade URL in error response
- Skip quota check for Enterprise tier
- Log quota exceeded events

---

## Technical Design

Middleware: backend/src/middleware/quota.ts

export function enforceQuota(dimension: string) {
  return async (req, res, next) => {
    const { organizationId } = req;

    const result = await quotaService.checkQuota(organizationId, dimension);

    if (!result.allowed) {
      return res.status(402).json({
        error: 'Quota exceeded',
        quota: result,
        upgradeUrl: '/billing',
      });
    }

    next();
  };
}

Usage:
router.post('/sites', auth, enforceQuota('sites'), createSite);

---

## Acceptance Criteria

- [ ] 402 status returned when quota exceeded
- [ ] Middleware integrated on all create routes
- [ ] Enterprise tier bypasses quota checks
- [ ] Error response includes upgrade URL
- [ ] Integration tests verify enforcement

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
