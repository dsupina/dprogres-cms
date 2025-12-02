# SF-012: Quota Warning System

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 3 (Quota System & Enforcement)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: ✅ Completed
**Dependencies**: SF-009
**Assigned To**: Backend Engineer
**Completed**: 2025-11-26

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

- [x] Warnings emitted at 80%, 90%, 95%
- [x] Only one warning per threshold
- [x] Warning events captured by EmailService
- [x] Warning data includes remaining quota
- [x] Unit tests verify warning logic

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
- [x] Unit tests pass (61 tests - 35 QuotaService + 26 QuotaWarning)
- [x] Integration tests pass
- [x] Manual testing complete
- [x] Documentation updated (COMPONENTS.md, PATTERNS.md)
- [ ] Code review approved

---

## Implementation Notes

### Files Changed

1. **QuotaService.ts** - Added warning system with spam prevention:
   - `WarningThreshold` type (80 | 90 | 95)
   - `QuotaWarningEvent` interface
   - `warningCache` Map for tracking sent warnings
   - `checkAndWarn()`, `wasWarningSent()`, `markWarningSent()`, `clearWarnings()` methods
   - Warning cache cleared on `resetMonthlyQuotas()` and `setQuotaOverride()`
   - Changed event from `quota:approaching_limit` to `quota:warning`

2. **EmailService.ts** - New service for email notifications:
   - Subscribes to `quota:warning` events from QuotaService
   - Template-based email generation
   - Stub implementation ready for AWS SES integration
   - Human-readable dimension labels

3. **QuotaWarning.test.ts** - Comprehensive test suite (26 tests):
   - Spam prevention tests
   - Warning cache management tests
   - Warning event data tests
   - Edge case tests (exactly 80%, below threshold, missing quota, etc.)
   - EmailService integration tests

4. **QuotaService.test.ts** - Updated existing tests (35 tests):
   - Changed event listener from `quota:approaching_limit` to `quota:warning`
   - Added mock for `checkAndWarn()` query
   - Added `remaining` field assertions

### Key Decisions

1. **In-memory cache for warnings**: Chose in-memory Map over database storage for performance. Cache is cleared on quota reset anyway.

2. **Highest threshold first**: When quota jumps from <80% to >95%, only the 95% warning is emitted (not all three).

3. **Event name change**: Changed from `quota:approaching_limit` to `quota:warning` for clearer semantics.

4. **EmailService as stub**: Created skeleton ready for email provider integration (SF-013).

---

**Created**: 2025-01-21
**Last Updated**: 2025-11-26
