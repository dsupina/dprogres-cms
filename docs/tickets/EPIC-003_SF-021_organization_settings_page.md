# SF-021: Organization Settings Page

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 5 (Frontend Billing Dashboard)
**Priority**: P0
**Estimated Effort**: 4 days
**Status**: Not Started
**Dependencies**: SF-006, SF-017
**Assigned To**: Backend Engineer

---

## Objective

Build organization settings page for team management

---

## Requirements

### Functional Requirements

- Organization details form (name, logo)
- Member list table with roles
- Invite member form (email + role)
- Update member role dropdown
- Remove member button
- Transfer ownership modal (owner only)

---

## Technical Design

frontend/src/pages/admin/OrganizationSettings.tsx

Sections:
1. Organization Details
   - Name input
   - Logo upload
   - Save button

2. Members Table
   - Email, Role, Joined Date
   - Actions: Update Role, Remove

3. Invite Form
   - Email input
   - Role dropdown
   - Send Invite button

4. Transfer Ownership
   - Select new owner
   - Confirm button

---

## Acceptance Criteria

- [ ] Organization name editable
- [ ] Logo upload working
- [ ] Member list shows all members
- [ ] Invite form sends invite
- [ ] Role update works
- [ ] Remove member works (except last owner)
- [ ] Transfer ownership modal functional

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
