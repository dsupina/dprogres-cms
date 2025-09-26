# CV-010: Version Permissions and Security

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** Critical
**Status:** TODO

## User Story
As a **system administrator**, I need granular permission controls for version operations, so that I can ensure only authorized users can publish content, delete versions, or access sensitive drafts.

## Background
Version control introduces new security considerations. Not everyone who can create content should be able to publish it, and some drafts may contain sensitive information that shouldn't be widely accessible. We need a robust permission system to manage these scenarios.

## Requirements

### Functional Requirements
- Role-based version permissions
- Content-specific permission overrides
- Draft privacy settings
- Publishing approval workflows
- Audit trail for all version operations
- Permission delegation
- Time-based permission grants
- IP-based access restrictions

### Technical Requirements
- Middleware for permission checks
- Database permission caching
- JWT token enhancements
- Rate limiting per role
- Security headers for previews
- Audit log storage
- Permission inheritance

## Acceptance Criteria
- [ ] Only authorized users can publish content
- [ ] Draft creators control who sees their drafts
- [ ] Publishing requires appropriate role or approval
- [ ] All operations logged with user/timestamp
- [ ] Permission changes take effect immediately
- [ ] Delegated permissions expire correctly
- [ ] IP restrictions enforced for sensitive content
- [ ] Rate limits prevent permission scanning
- [ ] Security audit finds no vulnerabilities

## Implementation Details

### Permission Model

**Permission Types**
```typescript
enum VersionPermission {
  // Basic permissions
  VIEW_DRAFT = 'version.draft.view',
  CREATE_DRAFT = 'version.draft.create',
  EDIT_DRAFT = 'version.draft.edit',
  DELETE_DRAFT = 'version.draft.delete',

  // Publishing permissions
  PUBLISH_CONTENT = 'version.publish',
  UNPUBLISH_CONTENT = 'version.unpublish',
  APPROVE_PUBLISH = 'version.approve',

  // Management permissions
  VIEW_ALL_VERSIONS = 'version.view.all',
  DELETE_ANY_VERSION = 'version.delete.any',
  RESTORE_VERSION = 'version.restore',

  // Preview permissions
  GENERATE_PREVIEW = 'version.preview.create',
  SHARE_PREVIEW = 'version.preview.share',
  REVOKE_PREVIEW = 'version.preview.revoke'
}
```

**Role Definitions**
```typescript
interface Role {
  name: string;
  permissions: VersionPermission[];
  restrictions?: {
    ipWhitelist?: string[];
    timeRestrictions?: TimeWindow[];
    contentTypes?: ContentType[];
  };
}

// Example roles
const roles = {
  viewer: ['VIEW_DRAFT'],
  contributor: ['VIEW_DRAFT', 'CREATE_DRAFT', 'EDIT_DRAFT'],
  editor: [...contributor, 'DELETE_DRAFT', 'GENERATE_PREVIEW'],
  publisher: [...editor, 'PUBLISH_CONTENT', 'UNPUBLISH_CONTENT'],
  admin: Object.values(VersionPermission)
};
```

### Permission Checking

**Middleware Implementation**
```typescript
interface PermissionContext {
  user: User;
  resource: Version;
  action: VersionPermission;
  metadata?: {
    ip?: string;
    timestamp?: Date;
    reason?: string;
  };
}

async function checkPermission(context: PermissionContext): Promise<boolean> {
  // Check role-based permissions
  // Check content-specific overrides
  // Check temporal restrictions
  // Check IP restrictions
  // Log permission check
  return hasPermission;
}
```

### Approval Workflows

**Publishing Approval**
```typescript
interface PublishingApproval {
  versionId: number;
  requestedBy: number;
  requestedAt: Date;
  approvers: ApprovalStep[];
  status: 'pending' | 'approved' | 'rejected';
  publishAt?: Date;
}

interface ApprovalStep {
  userId: number;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  respondedAt?: Date;
}
```

### Audit Logging

**Audit Entry**
```typescript
interface VersionAudit {
  id: string;
  timestamp: Date;
  userId: number;
  action: string;
  resourceType: 'version' | 'preview' | 'comment';
  resourceId: number;
  details: {
    permission?: string;
    granted?: boolean;
    oldValue?: any;
    newValue?: any;
    ip?: string;
    userAgent?: string;
  };
  severity: 'info' | 'warning' | 'critical';
}
```

### Security Features

**Draft Privacy**
```typescript
interface DraftPrivacy {
  visibility: 'private' | 'team' | 'organization' | 'public';
  allowedUsers?: number[];
  allowedRoles?: string[];
  expiresAt?: Date;
  passwordProtected?: boolean;
}
```

**Rate Limiting**
```typescript
interface RateLimitConfig {
  role: string;
  limits: {
    createDraft: { requests: 10, window: '1h' };
    publish: { requests: 5, window: '1h' };
    generatePreview: { requests: 20, window: '1h' };
    bulkOperations: { requests: 2, window: '1h' };
  };
}
```

### Permission Delegation
```typescript
interface DelegatedPermission {
  fromUserId: number;
  toUserId: number;
  permissions: VersionPermission[];
  scope?: {
    contentIds?: number[];
    contentTypes?: ContentType[];
  };
  validFrom: Date;
  validUntil: Date;
  reason: string;
}
```

## Testing Considerations
- Permission matrix testing
- Role-based access testing
- Audit log completeness
- Rate limit enforcement
- Security penetration testing
- Performance with permission checks

## Documentation Requirements
- Permission matrix documentation
- Role configuration guide
- Audit log query guide
- Security best practices

## Dependencies
- Authentication system
- Role management system
- Audit logging service
- Rate limiting service

## Related Tickets
- CV-011: Audit dashboard UI
- CV-012: Permission management UI
- CV-013: Security monitoring alerts