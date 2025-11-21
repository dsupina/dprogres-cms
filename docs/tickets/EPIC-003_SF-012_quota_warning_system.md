# SF-012: Quota Warning System

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 3 (Quota System & Enforcement)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Not Started
**Dependencies**: SF-009
**Assigned To**: Backend Engineer

---

## Objective

Emit warnings when quotas reach threshold percentages

---

## Requirements

### Functional Requirements

- Check quota percentage on each increment
- Emit warnings at 80%, 90%, 95%
- Store last warning sent to prevent spam
- Include remaining quota in warning

---

## Technical Design

Add to QuotaService:

async checkAndWarn(orgId: number, dimension: string) {
  const status = await this.getQuotaStatus(orgId);
  const quota = status[dimension];
  const percentage = (quota.current / quota.limit) * 100;

  if (percentage >= 95 && !this.wasWarningSent(orgId, dimension, 95)) {
    this.emit('quota:warning', { orgId, dimension, percentage: 95, quota });
    this.markWarningSent(orgId, dimension, 95);
  }
  // Similar for 90%, 80%
}

---

## Acceptance Criteria

- [ ] Warnings emitted at 80%, 90%, 95%
- [ ] Only one warning per threshold
- [ ] Warning events captured by EmailService
- [ ] Warning data includes remaining quota
- [ ] Unit tests verify warning logic

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
