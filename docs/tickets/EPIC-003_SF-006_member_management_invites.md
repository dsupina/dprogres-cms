# SF-006: Member Management & Invites

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 2 (RBAC & Organizations)
**Priority**: P0
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: SF-005
**Assigned To**: Backend Engineer

---

## Objective

Build member invitation system with email-based invite flow and role management

---

## Requirements

### Functional Requirements

- Invite member by email with role assignment
- Generate unique invite token (JWT)
- Send invite email with accept link
- Accept invite creates organization_members record
- List organization members with roles
- Update member role (owner/admin only)
- Remove member from organization
- Validate invite token expiration (7 days)

---

## Technical Design

Invite Flow:
1. Owner calls inviteMember(orgId, email, role)
2. Generate JWT token: { orgId, email, role, exp: 7days }
3. Insert into organization_invites table
4. Send email with link: /accept-invite?token=xxx
5. User clicks link, calls acceptInvite(token)
6. Verify token, create organization_members record
7. Delete invite from organization_invites

Methods:
- inviteMember(orgId, email, role, inviterId)
- acceptInvite(token, userId)
- listMembers(orgId)
- updateMemberRole(orgId, userId, newRole, actorId)
- removeMember(orgId, userId, actorId)
- revokeInvite(inviteId, actorId)

Validation:
- Cannot invite existing member
- Cannot invite to owner role (use transferOwnership)
- Token expires after 7 days
- Inviter must have invite_users permission

---

## Acceptance Criteria

- [ ] Invite email sent with valid token
- [ ] Token expires after 7 days
- [ ] Accept invite creates organization_members record
- [ ] Cannot accept invite twice (idempotency)
- [ ] Cannot invite existing member
- [ ] Role update validates actor has permission
- [ ] Cannot remove last owner (validation error)
- [ ] Unit tests cover invite flow >90%

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
