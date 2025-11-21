# SF-005: OrganizationService Implementation

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 2 (RBAC & Organizations)
**Priority**: P0
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: SF-001
**Assigned To**: Backend Engineer

---

## Objective

Build OrganizationService to manage organizations, ownership, and basic operations

---

## Requirements

### Functional Requirements

- Create organization with auto-generated slug
- Get organization by ID with member count
- Update organization details (name, logo)
- Delete organization (owner only, cascades to content)
- Transfer ownership to another member
- List user's organizations
- Validate organization access for user

---

## Technical Design

Create backend/src/services/OrganizationService.ts:

Methods:
- createOrganization(name, ownerId): Creates org + adds owner as member
- getOrganization(orgId, userId): Get org with access check
- updateOrganization(orgId, updates, userId): Update name/logo
- deleteOrganization(orgId, userId): Soft delete with cascade
- transferOwnership(orgId, newOwnerId, currentOwnerId): Update owner
- listUserOrganizations(userId): Get orgs where user is member
- validateAccess(orgId, userId): Check if user has access

Events:
- organization:created
- organization:updated
- organization:deleted
- organization:ownership_transferred

Auto-slug generation:
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomString(6);

---

## Acceptance Criteria

- [ ] Organization created with unique slug
- [ ] Owner automatically added as member with "owner" role
- [ ] Non-members cannot access organization
- [ ] Organization deletion cascades to content (via FK)
- [ ] Ownership transfer validates new owner is existing member
- [ ] Events emitted for all lifecycle changes
- [ ] Unit tests cover all methods >90%

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
