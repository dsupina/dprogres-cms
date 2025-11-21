# SF-008: Auto-Create Free Tier on Signup

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 2 (RBAC & Organizations)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Not Started
**Dependencies**: SF-005, SF-007
**Assigned To**: Backend Engineer

---

## Objective

Automatically create Free tier organization when user signs up

---

## Requirements

### Functional Requirements

- Create organization on user signup
- Set plan_tier to "free"
- Initialize usage_quotas with Free tier limits
- Add user as organization owner
- Set as user's current_organization_id
- Transaction safety (rollback on failure)

---

## Technical Design

Modify backend/src/routes/auth.ts:

POST /api/auth/register:
1. Create user in users table
2. Create organization: name = "{firstName}'s Organization"
3. Add user as organization member (role: owner)
4. Initialize usage_quotas:
   - sites: 1
   - posts: 20
   - users: 2
   - storage_bytes: 500MB
   - api_calls: 10k/month
5. Update user.current_organization_id
6. Commit transaction

Transaction:
BEGIN;
  INSERT INTO users (...) RETURNING id;
  INSERT INTO organizations (name, owner_id, plan_tier) VALUES (...) RETURNING id;
  INSERT INTO organization_members (organization_id, user_id, role) VALUES (...);
  INSERT INTO usage_quotas (organization_id, dimension, quota_limit, ...) VALUES
    (org_id, 'sites', 1, ...),
    (org_id, 'posts', 20, ...),
    ...;
  UPDATE users SET current_organization_id = org_id WHERE id = user_id;
COMMIT;

---

## Acceptance Criteria

- [ ] User signup creates organization automatically
- [ ] Organization name includes user's name
- [ ] plan_tier set to "free"
- [ ] All 5 usage_quotas initialized
- [ ] User added as organization owner
- [ ] current_organization_id set correctly
- [ ] Transaction rolls back on any failure
- [ ] Integration test verifies full flow

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
