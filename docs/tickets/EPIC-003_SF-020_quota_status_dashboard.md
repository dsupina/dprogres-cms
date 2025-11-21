# SF-020: Quota Status Dashboard

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: SF-009, SF-017
**Assigned To**: Backend Engineer

---

## Objective

Build quota status dashboard with progress bars and warnings

---

## Requirements

### Functional Requirements

- Fetch quota status from GET /api/quotas/status
- Display 5 progress bars (sites, posts, users, storage, API calls)
- Show percentage used and remaining count
- Warning state at 80%+ (yellow)
- Danger state at 95%+ (red)
- Upgrade CTA when quota exceeded

---

## Technical Design

<QuotaStatusCard
  dimension="sites"
  current={2}
  limit={3}
  percentage={66.7}
  unit="sites"
/>

Color States:
- <80%: Blue (normal)
- 80-94%: Yellow (warning)
- 95-100%: Red (danger)
- 100%: Red + "Upgrade" button

---

## Acceptance Criteria

- [ ] All 5 quota dimensions displayed
- [ ] Progress bars show correct percentages
- [ ] Warning colors applied correctly
- [ ] Upgrade CTA shown when exceeded
- [ ] Real-time updates on quota changes

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
