# SF-007: RBAC Middleware & Permissions Matrix

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 2 (RBAC & Organizations)
**Priority**: P0
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: SF-006
**Assigned To**: Backend Engineer

---

## Objective

Implement role-based access control middleware and permissions enforcement

---

## Requirements

### Functional Requirements

- Define permissions matrix (5 roles × 10 permissions)
- Create RBAC middleware to check permissions
- Protect routes with permission requirements
- Return 403 Forbidden if permission denied
- Support organization context in JWT token
- Cache user permissions in memory (5 min TTL)

---

## Technical Design

Permissions Matrix:
| Permission      | Owner | Admin | Editor | Publisher | Viewer |
|-----------------|-------|-------|--------|-----------|--------|
| manage_billing  | ✅    | ❌    | ❌     | ❌        | ❌     |
| invite_users    | ✅    | ✅    | ❌     | ❌        | ❌     |
| create_sites    | ✅    | ✅    | ❌     | ❌        | ❌     |
| create_posts    | ✅    | ✅    | ✅     | ❌        | ❌     |
| publish_posts   | ✅    | ✅    | ✅     | ✅        | ❌     |
| view_posts      | ✅    | ✅    | ✅     | ✅        | ✅     |

Middleware:
backend/src/middleware/rbac.ts

export function requirePermission(permission: string) {
  return async (req, res, next) => {
    const { user, organizationId } = req;

    const hasPermission = await checkPermission(
      organizationId,
      user.id,
      permission
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  };
}

Usage:
router.post('/sites', auth, requirePermission('create_sites'), createSite);

---

## Acceptance Criteria

- [ ] RBAC middleware enforces permissions correctly
- [ ] All roles validated against matrix
- [ ] 403 returned when permission denied
- [ ] Permissions cached in memory (5 min TTL)
- [ ] Organization context validated from JWT
- [ ] Integration tests verify permission enforcement
- [ ] Performance: Permission check <20ms

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
