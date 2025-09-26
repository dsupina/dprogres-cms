# CV-002: Version Data Models and TypeScript Types

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** Critical
**Status:** TODO

## User Story
As a **developer**, I need comprehensive TypeScript types and interfaces for the versioning system, so that I can build type-safe APIs and frontend components without runtime errors.

## Background
With the new versioning database schema, we need corresponding TypeScript types to ensure type safety across the application. This will prevent bugs and improve developer experience through IDE autocomplete and compile-time error checking.

## Requirements

### Functional Requirements
- Complete type definitions matching database schema
- Enums for all status and type fields
- Request/response types for API operations
- Utility types for common operations
- JSDoc documentation for all types

### Technical Requirements
- Strict TypeScript compliance
- No use of 'any' type
- Proper type exports for consumption
- Compatible with existing content types
- Support for partial types (updates)

## Acceptance Criteria
- [ ] All database tables have corresponding TypeScript interfaces
- [ ] Enums defined for all status/type fields
- [ ] API request/response types cover all endpoints
- [ ] No TypeScript compilation errors
- [ ] Types are properly documented with JSDoc
- [ ] Existing code updated to use new types where applicable
- [ ] Type definitions pass strict mode compilation

## Implementation Details

### Core Interfaces

**ContentVersion**
- Complete version record type
- Includes all fields from database
- Optional relations (author, comments)

**PreviewToken**
- Token record with metadata
- Computed fields (is_expired, preview_url)

**VersionComment**
- Comment with author relation
- Support for comment types enum

### Enums
- VersionType (draft, published, auto_save, archived)
- ContentType (post, page)
- CommentType (note, approval, rejection, change_request)
- VersionStatus (active, deleted, archived)

### Operation Types
- CreateVersionData
- UpdateVersionData
- PublishVersionResult
- VersionComparisonResult
- PreviewTokenOptions

### API Types
- Request/response for each endpoint
- Pagination wrappers
- Error response types
- WebSocket event types

## Testing Considerations
- Types should compile without errors
- Integration with existing types
- Runtime type validation alignment
- API contract testing

## Documentation Requirements
- Type usage examples
- Migration guide for existing code
- Common patterns documentation
- Type hierarchy diagram

## Dependencies
- CV-001: Database schema must be finalized
- Existing TypeScript configuration
- Current content type definitions

## Related Tickets
- CV-003: Version service implementation
- CV-004: API endpoint development

---

## Product Experience Specifications

This section defines the user experience implications of the versioning type system, ensuring that the TypeScript types support excellent developer experience and enable intuitive user interfaces.

### Developer Experience (DX) Requirements

#### Type Safety in UI Components
- **Content Version Components**: All version-related React components must receive strongly-typed props that prevent runtime errors when rendering version history, comparison views, and preview interfaces
- **Form Validation Alignment**: TypeScript types must mirror Joi validation schemas exactly to ensure frontend forms validate correctly before API submission
- **IntelliSense Support**: All interfaces must have comprehensive JSDoc comments to provide helpful autocomplete and documentation in IDEs
- **Type Narrowing**: Implement discriminated unions for `ContentVersion` based on `version_type` to enable compile-time validation of version-specific operations

#### Error Handling Patterns
- **Validation Error Types**: Define specific error types for each validation failure mode (invalid content_type, missing required fields, version conflicts)
- **User-Friendly Error Messages**: All error types must include both technical error codes and user-facing messages that can be displayed in the UI
- **Accessibility-Ready Error States**: Error types must support ARIA live region announcements for screen readers

### User Flows Dependent on These Types

#### Content Author Workflows
1. **Version History Browsing**
   - User accesses version history list (uses `VersionHistoryOptions` and `PaginatedResponse<ContentVersion>`)
   - Filter by version type, author, or date range
   - Display version metadata clearly with visual indicators for current draft/published status

2. **Version Comparison**
   - User selects two versions to compare (uses `VersionComparison` and `VersionDiff[]`)
   - System highlights field-level changes with clear visual diff presentation
   - Accessibility: Changes announced to screen readers using structured diff data

3. **Preview Token Generation**
   - User creates shareable preview link (uses `GeneratePreviewTokenInput`)
   - System provides clear feedback on token expiration and usage limits
   - Error handling for token generation failures

4. **Collaborative Commenting**
   - User adds inline comments on specific version content (uses `CreateCommentInput`)
   - System displays comment threads with proper hierarchy
   - Real-time updates when comments are added/resolved

#### Administrative Workflows
1. **Version Management Dashboard**
   - Admin views all versions across sites/locales (uses `VersionHistoryOptions` with site filtering)
   - Bulk operations on version statuses with proper error handling

2. **Preview Token Administration**
   - Admin manages preview tokens across projects
   - Token security monitoring and revocation capabilities

### Information Architecture for Type Documentation

#### Developer Documentation Structure
1. **Quick Reference Guide**
   - Core interfaces with usage examples
   - Common patterns and best practices
   - Migration guide from existing types

2. **Component Integration Examples**
   - React component patterns using versioning types
   - Form handling with validation alignment
   - Error boundary implementations

3. **API Contract Documentation**
   - Request/response type examples
   - WebSocket event type specifications
   - Error response standardization

### UI Feedback Patterns for Type Validation

#### Real-Time Validation Feedback
- **Field-Level Validation**: Use TypeScript types to drive form field validation with immediate visual feedback
- **Bulk Operation Status**: When performing operations on multiple versions, provide progress indicators and error summaries
- **Conflict Resolution**: When version conflicts occur, present clear options based on type-safe conflict resolution patterns

#### Accessibility Considerations for Validation
- **Error Message Formatting**: All validation errors must follow WCAG 2.2 AA standards for color, contrast, and text alternatives
- **Focus Management**: Type validation failures should trigger proper focus management to the first error field
- **Screen Reader Support**: Validation error announcements must use ARIA live regions with appropriate politeness levels

### Enhanced Acceptance Criteria (UX Perspective)

#### Type System Usability
- [ ] **Developer Productivity**: New developers can create version-related components without referring to external documentation
- [ ] **IDE Integration**: All types provide meaningful autocomplete suggestions and inline documentation
- [ ] **Error Prevention**: TypeScript compilation catches 95% of type-related errors before runtime
- [ ] **Performance**: Type definitions do not impact bundle size or runtime performance

#### User Interface Support
- [ ] **Form Generation**: Types support automatic form generation with proper validation
- [ ] **Error Display**: All validation errors can be displayed as user-friendly messages
- [ ] **Loading States**: Types include necessary metadata for implementing proper loading/optimistic UI patterns
- [ ] **Accessibility Compliance**: All error states and form interactions meet WCAG 2.2 AA standards

#### Multi-Site Architecture Support
- [ ] **Site Context Awareness**: All types properly handle multi-site scenarios without confusion
- [ ] **Locale Support**: Types enable proper internationalization of version-related content
- [ ] **Permission Integration**: Types align with RBAC requirements for site-scoped access control

### Specific UI Components Requiring Type Support

#### Version History Component
```typescript
interface VersionHistoryProps {
  versions: PaginatedResponse<ContentVersion>;
  onVersionSelect: (version: ContentVersion) => void;
  onVersionCompare: (versionA: ContentVersion, versionB: ContentVersion) => void;
  onPreviewGenerate: (version: ContentVersion) => void;
  loading: boolean;
  error?: string;
}
```

#### Version Comparison Component
```typescript
interface VersionComparisonProps {
  comparison: VersionComparison;
  onFieldClick: (diff: VersionDiff) => void;
  renderDiff: (field: string, diff: VersionDiff) => React.ReactNode;
}
```

#### Comment Thread Component
```typescript
interface CommentThreadProps {
  comments: VersionComment[];
  onCommentAdd: (input: CreateCommentInput) => Promise<void>;
  onCommentUpdate: (id: number, input: UpdateCommentInput) => Promise<void>;
  onCommentResolve: (id: number) => Promise<void>;
  canModerate: boolean;
}
```

### Error Message Standardization

#### Validation Error Format
```typescript
interface ValidationError {
  field: string;
  message: string;
  userMessage: string; // Localized, user-friendly message
  code: string; // For programmatic handling
  severity: 'error' | 'warning' | 'info';
}
```

#### Common Error Scenarios
- **Version Conflict**: When attempting to save over a newer version
- **Permission Denied**: When user lacks access to specific version operations
- **Token Expired**: When preview token has expired or exceeded usage limits
- **Invalid Content**: When content fails validation rules

### Performance Considerations

#### Type System Impact
- **Bundle Size**: Ensure type definitions don't bloat the frontend bundle
- **Runtime Validation**: Align TypeScript types with runtime validation to avoid dual validation overhead
- **Memory Usage**: Optimize type definitions for large version datasets

#### Caching Strategy
- **Type-Safe Caching**: Ensure React Query cache keys are type-safe and prevent cache pollution
- **Optimistic Updates**: Types must support optimistic UI updates with proper rollback mechanisms

This Product Experience specification ensures that the versioning type system not only provides technical type safety but also enables delightful, accessible, and efficient user experiences throughout the content management workflow.

---

## Technical Architecture Specification

### Overview

This specification defines a comprehensive TypeScript type system for the content versioning and draft preview system, building on the existing versioning types while adding robust API contracts, utility types, and frontend integration patterns. The architecture supports multi-site content management with strong type safety and excellent developer experience.

### Current State Analysis

**Existing Assets:**
- Basic versioning types defined in `backend/src/types/versioning.ts` (394 lines)
- Core interfaces: `ContentVersion`, `PreviewToken`, `VersionComment`
- Basic enums for content types and statuses
- Service response wrappers and pagination

**Gaps Identified:**
- Missing API endpoint request/response types
- No frontend-specific types for React components
- Insufficient WebSocket event type definitions
- Limited error handling type specifications
- No performance optimization utilities
- Missing migration helpers for existing content

### Enhanced Type System Architecture

#### 1. Core Interface Enhancements

**Enhanced ContentVersion Interface:**
```typescript
export interface ContentVersion {
  // ... existing fields ...

  // Multi-site context (enhanced)
  site_id: number;
  locale: string; // Required for multi-site
  domain_context?: {
    primary_domain: string;
    preview_domains: string[];
  };

  // Enhanced metadata
  performance_hints?: {
    content_size: number;
    estimated_render_time: number;
    cache_tags: string[];
  };

  // Workflow integration
  workflow_state?: {
    current_stage: WorkflowStage;
    approvals_required: number;
    approvals_received: number;
    next_actions: WorkflowAction[];
  };
}
```

**Discriminated Union for Version Types:**
```typescript
type DraftVersion = ContentVersion & {
  version_type: VersionType.DRAFT;
  is_current_draft: true;
  published_at: null;
};

type PublishedVersion = ContentVersion & {
  version_type: VersionType.PUBLISHED;
  is_current_published: boolean;
  published_at: Date;
};

type ContentVersionUnion = DraftVersion | PublishedVersion | AutoSaveVersion | ArchivedVersion;
```

#### 2. API Contract Definitions

**Version Management Endpoints:**
```typescript
// GET /api/versions
export interface GetVersionsRequest {
  site_id: number;
  content_type?: ContentType;
  content_id?: number;
  locale?: string;
  version_type?: VersionType[];
  page?: number;
  limit?: number;
  include_auto_saves?: boolean;
}

export interface GetVersionsResponse {
  versions: PaginatedResponse<ContentVersion>;
  metadata: {
    total_drafts: number;
    total_published: number;
    last_auto_save: Date | null;
  };
}

// POST /api/versions
export interface CreateVersionRequest {
  site_id: number;
  content_type: ContentType;
  content_id: number;
  version_data: CreateVersionInput;
  options?: {
    auto_publish?: boolean;
    create_preview_token?: boolean;
    notify_collaborators?: boolean;
  };
}

export interface CreateVersionResponse {
  version: ContentVersion;
  preview_token?: PreviewToken;
  notifications_sent?: string[];
}

// PUT /api/versions/:id/publish
export interface PublishVersionRequest {
  force?: boolean;
  scheduled_for?: Date;
  notification_settings?: {
    notify_subscribers: boolean;
    email_summary: boolean;
  };
}

export interface PublishVersionResponse {
  published_version: ContentVersion;
  previous_version?: ContentVersion;
  cache_purge_urls: string[];
  sitemap_updated: boolean;
}
```

**Preview Token Endpoints:**
```typescript
// POST /api/preview-tokens
export interface CreatePreviewTokenRequest {
  version_id: number;
  token_type?: TokenType;
  expires_in_hours?: number;
  max_uses?: number;
  password?: string;
  allowed_ips?: string[];
  custom_settings?: Record<string, any>;
}

export interface CreatePreviewTokenResponse {
  token: PreviewToken;
  preview_url: string;
  qr_code?: string; // Base64 QR code for mobile sharing
}

// GET /api/preview/:token
export interface PreviewTokenValidationResponse {
  valid: boolean;
  version: ContentVersion;
  site_context: {
    site_id: number;
    primary_domain: string;
    locale: string;
    theme_tokens: Record<string, any>;
  };
  render_context: {
    preview_mode: boolean;
    editing_enabled: boolean;
    user_permissions: string[];
  };
}
```

#### 3. WebSocket Event Types

```typescript
export interface WebSocketEvents {
  // Real-time collaboration
  'version:created': {
    version: ContentVersion;
    creator: User;
    site_id: number;
  };

  'version:updated': {
    version_id: number;
    changes: Partial<ContentVersion>;
    updated_by: User;
  };

  'version:published': {
    version: ContentVersion;
    published_by: User;
    affected_urls: string[];
  };

  // Comment system
  'comment:added': {
    comment: VersionComment;
    version_id: number;
    mention_users?: User[];
  };

  'comment:resolved': {
    comment_id: number;
    resolved_by: User;
    version_id: number;
  };

  // Preview system
  'preview:accessed': {
    token: string;
    version_id: number;
    accessed_by: string; // IP or user
    timestamp: Date;
  };
}

export type WebSocketMessage<T extends keyof WebSocketEvents> = {
  event: T;
  data: WebSocketEvents[T];
  timestamp: Date;
  room: string; // Site-scoped room
};
```

#### 4. Frontend-Specific Types

**React Component Props:**
```typescript
// Version History Component
export interface VersionHistoryProps {
  versions: PaginatedResponse<ContentVersion>;
  currentVersion?: ContentVersion;
  onVersionSelect: (version: ContentVersion) => void;
  onVersionCompare: (versionA: ContentVersion, versionB: ContentVersion) => void;
  onCreatePreview: (version: ContentVersion) => Promise<PreviewToken>;
  onPublishVersion: (version: ContentVersion) => Promise<void>;
  loading?: boolean;
  error?: ValidationError;
  permissions: {
    canEdit: boolean;
    canPublish: boolean;
    canComment: boolean;
  };
}

// Version Comparison Component
export interface VersionComparisonProps {
  comparison: VersionComparison;
  renderMode: 'side-by-side' | 'inline' | 'unified';
  highlightChanges: boolean;
  onFieldClick?: (diff: VersionDiff) => void;
  onAcceptChange?: (diff: VersionDiff) => void;
  onRejectChange?: (diff: VersionDiff) => void;
}

// Comment Thread Component
export interface CommentThreadProps {
  comments: VersionComment[];
  version: ContentVersion;
  currentUser: User;
  onCommentAdd: (input: CreateCommentInput) => Promise<VersionComment>;
  onCommentUpdate: (id: number, input: UpdateCommentInput) => Promise<void>;
  onCommentResolve: (id: number) => Promise<void>;
  onCommentDelete: (id: number) => Promise<void>;
  permissions: {
    canComment: boolean;
    canModerate: boolean;
    canResolve: boolean;
  };
}
```

**Form Integration Types:**
```typescript
// Form validation aligned with Joi schemas
export interface VersionFormData {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  meta_title?: string;
  meta_description?: string;
  data?: Record<string, any>;
  change_summary?: string;
}

export interface VersionFormValidation {
  title: ValidationResult;
  slug: ValidationResult;
  content: ValidationResult;
  meta_title: ValidationResult;
  meta_description: ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  severity: 'error' | 'warning' | 'info';
}
```

#### 5. Enhanced Error Handling

```typescript
export enum VersionErrorCode {
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SITE_MISMATCH = 'SITE_MISMATCH',
  LOCALE_NOT_SUPPORTED = 'LOCALE_NOT_SUPPORTED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  PUBLISHING_FAILED = 'PUBLISHING_FAILED',
  PREVIEW_GENERATION_FAILED = 'PREVIEW_GENERATION_FAILED'
}

export interface VersionError {
  code: VersionErrorCode;
  message: string;
  userMessage: string; // Localized, user-friendly
  field?: string; // For validation errors
  severity: 'error' | 'warning' | 'info';
  metadata?: {
    conflicting_version?: ContentVersion;
    available_actions?: string[];
    retry_after?: number;
  };
}

export interface ErrorResponse {
  error: VersionError;
  request_id: string;
  timestamp: Date;
  support_code?: string;
}
```

#### 6. Performance Optimization Types

```typescript
// Caching utilities
export interface CacheConfiguration {
  version_history_ttl: number; // seconds
  preview_content_ttl: number;
  user_permissions_ttl: number;
  site_context_ttl: number;
}

// Query optimization
export interface VersionQueryOptions {
  include_relations: ('author' | 'comments' | 'preview_tokens')[];
  fields: (keyof ContentVersion)[];
  use_cache: boolean;
  cache_ttl?: number;
}

// Bulk operations
export interface BulkVersionOperation {
  operation: 'publish' | 'archive' | 'delete' | 'update_status';
  version_ids: number[];
  options?: {
    batch_size: number;
    delay_between_batches: number;
    rollback_on_error: boolean;
  };
}

export interface BulkOperationResult {
  successful: number[];
  failed: { id: number; error: VersionError }[];
  total_processed: number;
  duration_ms: number;
}
```

#### 7. Migration and Compatibility Types

```typescript
// Migration utilities
export interface ContentMigration {
  from_version: string; // Schema version
  to_version: string;
  content_type: ContentType;
  migration_steps: MigrationStep[];
}

export interface MigrationStep {
  step_name: string;
  description: string;
  field_mappings: FieldMapping[];
  custom_transform?: (data: any) => any;
}

export interface FieldMapping {
  old_field: string;
  new_field: string;
  transform?: 'none' | 'json_parse' | 'date_convert' | 'array_split';
  default_value?: any;
}

// Backward compatibility
export interface LegacyContentAdapter<T = any> {
  canHandle: (data: any) => boolean;
  transform: (data: any) => T;
  validate: (transformed: T) => ValidationResult[];
}
```

### File Structure and Module Organization

```
backend/src/types/
├── versioning/
│   ├── index.ts              # Main exports
│   ├── core.ts               # Core interfaces (ContentVersion, etc.)
│   ├── api.ts                # API request/response types
│   ├── websocket.ts          # WebSocket event types
│   ├── errors.ts             # Error handling types
│   ├── performance.ts        # Performance optimization types
│   ├── migration.ts          # Migration and compatibility types
│   └── guards.ts             # Type guard functions
├── frontend/
│   ├── index.ts              # Frontend-specific exports
│   ├── components.ts         # React component prop types
│   ├── forms.ts              # Form and validation types
│   └── hooks.ts              # React hook types
└── shared/
    ├── index.ts              # Shared between frontend/backend
    ├── enums.ts              # Common enums
    └── utilities.ts          # Utility types and helpers

frontend/src/types/
├── versioning/
│   ├── index.ts              # Re-exports from backend + client-specific
│   ├── components.ts         # Component-specific types
│   ├── hooks.ts              # React Query hooks types
│   └── services.ts           # API service types
└── api/
    ├── versioning.ts         # API client types
    └── websocket.ts          # WebSocket client types
```

### Integration Patterns

#### 1. React Query Integration

```typescript
// Query key factories
export const versionQueryKeys = {
  all: ['versions'] as const,
  lists: () => [...versionQueryKeys.all, 'list'] as const,
  list: (filters: VersionHistoryOptions) => [...versionQueryKeys.lists(), filters] as const,
  details: () => [...versionQueryKeys.all, 'detail'] as const,
  detail: (id: number) => [...versionQueryKeys.details(), id] as const,
  comparisons: () => [...versionQueryKeys.all, 'comparison'] as const,
  comparison: (versionA: number, versionB: number) =>
    [...versionQueryKeys.comparisons(), versionA, versionB] as const,
};

// Hook types
export interface UseVersionHistoryOptions extends VersionHistoryOptions {
  enabled?: boolean;
  refetchInterval?: number;
  staleTime?: number;
}

export interface UseVersionMutationOptions {
  onSuccess?: (data: ContentVersion) => void;
  onError?: (error: VersionError) => void;
  optimisticUpdates?: boolean;
}
```

#### 2. Form Integration with React Hook Form

```typescript
// Form schema aligned with Joi validation
export type VersionFormSchema = {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  data: Record<string, any>;
  change_summary: string;
};

// React Hook Form integration
export interface UseVersionFormOptions {
  defaultValues?: Partial<VersionFormSchema>;
  mode?: 'onChange' | 'onBlur' | 'onSubmit';
  reValidateMode?: 'onChange' | 'onBlur' | 'onSubmit';
  resolver?: any; // Joi resolver
}
```

### Testing Strategies

#### 1. Type Safety Testing

```typescript
// Type-level tests using TypeScript's type system
type TypeTests = {
  // Ensure discriminated unions work correctly
  draftVersion: DraftVersion extends ContentVersion ? true : false;
  publishedVersion: PublishedVersion extends ContentVersion ? true : false;

  // Ensure API contracts are complete
  createRequest: CreateVersionRequest extends object ? true : false;
  createResponse: CreateVersionResponse extends object ? true : false;

  // Ensure error types are comprehensive
  errorUnion: VersionError extends object ? true : false;
};
```

#### 2. Runtime Validation Testing

```typescript
// Jest tests for type guards
describe('Type Guards', () => {
  it('should correctly identify ContentVersion', () => {
    const validVersion = { /* valid version data */ };
    const invalidVersion = { /* invalid data */ };

    expect(isContentVersion(validVersion)).toBe(true);
    expect(isContentVersion(invalidVersion)).toBe(false);
  });
});

// Integration tests with actual API responses
describe('API Integration', () => {
  it('should match API response with TypeScript types', async () => {
    const response = await fetch('/api/versions');
    const data: GetVersionsResponse = await response.json();

    // TypeScript will ensure this compiles correctly
    expect(data.versions.items).toBeInstanceOf(Array);
    expect(typeof data.metadata.total_drafts).toBe('number');
  });
});
```

#### 3. Component Testing with Types

```typescript
// React Testing Library with proper typing
describe('VersionHistoryComponent', () => {
  it('should render with correct props', () => {
    const mockProps: VersionHistoryProps = {
      versions: { /* mock data */ },
      onVersionSelect: jest.fn(),
      // ... other props
    };

    render(<VersionHistory {...mockProps} />);
    // Test implementation
  });
});
```

### Performance Optimization Strategies

#### 1. Bundle Size Optimization

```typescript
// Lazy-loaded type imports
export type { ContentVersion } from './core';
export type { VersionHistoryProps } from './components';

// Conditional type imports
export interface VersioningTypes {
  core: () => Promise<typeof import('./core')>;
  api: () => Promise<typeof import('./api')>;
  components: () => Promise<typeof import('./components')>;
}
```

#### 2. Memory Optimization

```typescript
// Efficient type definitions to reduce memory footprint
export interface CompactVersion {
  id: number;
  title: string;
  version_type: VersionType;
  created_at: Date;
  is_current: boolean;
}

// Selective field loading
export type VersionFields = keyof ContentVersion;
export type PartialVersion<T extends VersionFields[]> = Pick<ContentVersion, T[number]>;
```

#### 3. Type-Safe Caching

```typescript
// Cache key generation with type safety
export function createVersionCacheKey<T extends Record<string, any>>(
  operation: string,
  params: T
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as T);

  return `${operation}:${JSON.stringify(sortedParams)}`;
}
```

### Migration Approach

#### 1. Existing Type Migration

**Phase 1: Compatibility Layer**
- Create adapter functions for existing `Post` and `Page` types
- Gradual migration of components to use new versioning types
- Maintain backward compatibility during transition

**Phase 2: API Integration**
- Update existing API endpoints to return versioned data
- Implement new versioning endpoints with full type safety
- Update React Query hooks to use new types

**Phase 3: Frontend Migration**
- Migrate components to use new versioning types
- Update forms and validation to align with new schema
- Replace legacy patterns with new type-safe implementations

#### 2. Database Schema Alignment

```typescript
// Migration utilities to ensure type-database alignment
export interface SchemaValidation {
  table_name: string;
  expected_columns: ColumnDefinition[];
  type_mapping: TypeMapping[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  default?: any;
}

export interface TypeMapping {
  database_type: string;
  typescript_type: string;
  validation_rules: string[];
}
```

### Implementation Risks and Mitigation Strategies

#### High-Risk Areas

1. **Type-Database Misalignment**
   - *Risk*: TypeScript types diverging from actual database schema
   - *Mitigation*: Automated schema validation, code generation from database schema
   - *Detection*: Runtime type checks in development, integration tests

2. **Bundle Size Impact**
   - *Risk*: Large type definitions increasing frontend bundle size
   - *Mitigation*: Tree-shaking optimization, lazy type imports, selective exports
   - *Detection*: Bundle analyzer in CI/CD pipeline

3. **Migration Complexity**
   - *Risk*: Breaking changes during migration from existing types
   - *Mitigation*: Phased rollout, compatibility layers, feature flags
   - *Detection*: Comprehensive testing suite, rollback procedures

#### Medium-Risk Areas

4. **API Contract Enforcement**
   - *Risk*: Runtime API responses not matching TypeScript types
   - *Mitigation*: Runtime validation, automated API testing, type-safe HTTP clients
   - *Detection*: Integration tests, monitoring dashboards

5. **Multi-Site Type Safety**
   - *Risk*: Site context not properly enforced in types
   - *Mitigation*: Discriminated unions for site-specific types, validation functions
   - *Detection*: Unit tests, end-to-end testing

6. **WebSocket Type Safety**
   - *Risk*: Real-time events not matching defined types
   - *Mitigation*: Event schema validation, type-safe WebSocket wrapper
   - *Detection*: WebSocket integration tests, event monitoring

#### Low-Risk Areas

7. **Developer Experience**
   - *Risk*: Complex types reducing development velocity
   - *Mitigation*: Comprehensive documentation, helper utilities, IDE integration
   - *Detection*: Developer feedback, development time metrics

8. **Performance Impact**
   - *Risk*: Type checking impacting runtime performance
   - *Mitigation*: Build-time optimization, selective validation, caching strategies
   - *Detection*: Performance monitoring, load testing

---

## Security & Privacy Specifications

### Overview

This section defines critical security and privacy requirements for the content versioning type system. All type definitions must enforce security best practices, protect PII, ensure proper data isolation in multi-site environments, and support comprehensive audit logging for compliance.

### Security Type Definitions

#### 1. Authentication & Authorization Types

```typescript
// Secure session management
export interface SecureSession {
  session_id: string;
  user_id: number;
  site_ids: number[]; // Allowed sites
  expires_at: Date;
  refresh_token_hash: string; // Never store plain refresh tokens
  ip_address: string;
  user_agent: string;
  mfa_verified: boolean;
  last_activity: Date;
}

// Permission checking with site context
export interface VersionPermission {
  action: 'read' | 'write' | 'publish' | 'delete' | 'approve';
  resource_type: 'version' | 'comment' | 'preview_token';
  resource_id: number;
  site_id: number;
  user_id: number;
  granted: boolean;
  reason?: string; // For audit logging
  checked_at: Date;
}

// Role-based access with site scoping
export interface SiteRole {
  user_id: number;
  site_id: number;
  role: 'viewer' | 'editor' | 'publisher' | 'admin';
  permissions: string[]; // Granular permissions
  granted_by: number;
  granted_at: Date;
  expires_at?: Date;
}

// API key management for service accounts
export interface SecureApiKey {
  key_hash: string; // Never store plain API keys
  key_prefix: string; // First 8 chars for identification
  name: string;
  site_ids: number[];
  permissions: string[];
  rate_limit: RateLimitConfig;
  expires_at?: Date;
  last_used_at?: Date;
  created_by: number;
}
```

#### 2. PII Handling & Data Classification

```typescript
// Data classification for fields
export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted', // PII, financial, health
  SECRET = 'secret' // Passwords, tokens, keys
}

// PII-aware content version
export interface PrivacyAwareContentVersion extends ContentVersion {
  pii_fields?: PIIField[];
  data_retention?: DataRetentionPolicy;
  consent_required?: ConsentRequirement[];
  anonymization_status?: AnonymizationStatus;
}

export interface PIIField {
  field_path: string; // JSON path to PII field
  classification: DataClassification;
  pii_type: 'email' | 'name' | 'phone' | 'ssn' | 'ip' | 'location' | 'custom';
  encryption_required: boolean;
  masking_pattern?: string; // e.g., "****@****.com"
  retention_days?: number;
}

export interface DataRetentionPolicy {
  version_id: number;
  retention_days: number;
  deletion_strategy: 'hard_delete' | 'soft_delete' | 'anonymize';
  legal_hold?: boolean;
  gdpr_deletion_requested?: Date;
  ccpa_deletion_requested?: Date;
}

// Comment privacy
export interface PrivateComment extends VersionComment {
  contains_pii: boolean;
  pii_fields?: string[]; // Field paths containing PII
  ip_address_hash?: string; // Hashed for privacy
  deleted_content?: string; // Retained for audit but marked deleted
}
```

#### 3. Preview Token Security

```typescript
// Enhanced secure preview token
export interface SecurePreviewToken extends PreviewToken {
  token_hash: string; // Never store plain tokens
  token_prefix: string; // First 8 chars for identification
  ip_whitelist?: string[]; // Allowed IP addresses
  password_hash?: string; // Optional password protection
  require_auth?: boolean; // Require authenticated session
  allowed_users?: number[]; // Specific user IDs
  rate_limit?: RateLimitConfig;
  audit_log?: PreviewAccessLog[];
  revoked?: boolean;
  revoked_by?: number;
  revoked_at?: Date;
}

export interface PreviewAccessLog {
  accessed_at: Date;
  ip_address: string;
  user_agent: string;
  user_id?: number;
  success: boolean;
  failure_reason?: string;
}

export interface TokenValidation {
  token: string;
  ip_address: string;
  user_agent: string;
  user_id?: number;
  password?: string; // For password-protected previews
}
```

#### 4. Multi-Site Data Isolation

```typescript
// Site isolation context
export interface SiteIsolationContext {
  site_id: number;
  user_id: number;
  allowed_sites: number[];
  cross_site_permissions?: CrossSitePermission[];
  data_boundary: 'strict' | 'permissive'; // Strict = no cross-site access
}

export interface CrossSitePermission {
  from_site_id: number;
  to_site_id: number;
  permission_type: 'read' | 'write' | 'sync';
  resource_types: string[];
  granted_by: number;
  expires_at?: Date;
}

// Ensure queries are site-scoped
export interface SiteSecureQuery<T> {
  site_id: number; // Required for all queries
  user_context: SiteIsolationContext;
  query: T;
}

// Site-scoped response wrapper
export interface SiteIsolatedResponse<T> {
  site_id: number;
  data: T;
  accessed_at: Date;
  access_logged: boolean;
}
```

#### 5. WebSocket Security

```typescript
// Secure WebSocket connection
export interface SecureWebSocketConnection {
  connection_id: string;
  user_id: number;
  site_id: number; // Locked to single site
  auth_token_hash: string;
  ip_address: string;
  connected_at: Date;
  last_heartbeat: Date;
  rate_limit_state: RateLimitState;
  subscribed_rooms: string[]; // Site-prefixed rooms
}

// WebSocket message security wrapper
export interface SecureWebSocketMessage<T> {
  message_id: string;
  site_id: number;
  user_id: number;
  data: T;
  signature: string; // HMAC signature for integrity
  timestamp: Date;
}

// Rate limiting for WebSocket
export interface WebSocketRateLimit {
  connection_id: string;
  messages_per_minute: number;
  current_count: number;
  reset_at: Date;
  blocked_until?: Date;
}
```

#### 6. Audit Logging Requirements

```typescript
// Comprehensive audit log entry
export interface AuditLogEntry {
  id: string; // UUID
  timestamp: Date;
  user_id?: number;
  service_account_id?: string;
  ip_address: string;
  user_agent?: string;
  site_id: number;
  action: AuditAction;
  resource_type: string;
  resource_id?: string | number;
  changes?: AuditChanges;
  result: 'success' | 'failure' | 'partial';
  error_message?: string;
  security_context?: SecurityContext;
  compliance_tags?: ComplianceTag[];
}

export interface AuditAction {
  category: 'auth' | 'content' | 'admin' | 'system';
  operation: string; // e.g., 'login', 'publish_version', 'delete_user'
  severity: 'low' | 'medium' | 'high' | 'critical';
  requires_review?: boolean;
}

export interface AuditChanges {
  before?: Record<string, any>; // Previous state (exclude secrets)
  after?: Record<string, any>; // New state (exclude secrets)
  fields_changed: string[];
  sensitive_fields_changed?: boolean; // Flag without exposing
}

export interface SecurityContext {
  mfa_used: boolean;
  session_age_minutes: number;
  permission_checks: PermissionCheck[];
  rate_limit_remaining?: number;
}

export interface PermissionCheck {
  permission: string;
  granted: boolean;
  reason?: string;
}

export enum ComplianceTag {
  GDPR_ACCESS = 'gdpr_access',
  GDPR_DELETION = 'gdpr_deletion',
  GDPR_EXPORT = 'gdpr_export',
  CCPA_ACCESS = 'ccpa_access',
  CCPA_DELETION = 'ccpa_deletion',
  HIPAA_ACCESS = 'hipaa_access',
  PCI_ACCESS = 'pci_access',
  SOC2_RELEVANT = 'soc2_relevant'
}
```

#### 7. Rate Limiting & DoS Protection

```typescript
// Rate limit configuration
export interface RateLimitConfig {
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  burst_size?: number;
  cooldown_minutes?: number;
}

// Rate limit state tracking
export interface RateLimitState {
  key: string; // User ID or IP
  window_start: Date;
  request_count: number;
  limit: number;
  remaining: number;
  reset_at: Date;
  blocked_until?: Date;
  violation_count?: number;
}

// Endpoint-specific rate limits
export interface EndpointRateLimit {
  endpoint: string;
  method: string;
  authenticated_limit: RateLimitConfig;
  anonymous_limit: RateLimitConfig;
  bypass_roles?: string[]; // Admin bypass
}

// DoS protection patterns
export interface DosProtection {
  max_request_size: number; // bytes
  max_json_depth: number;
  max_array_length: number;
  max_string_length: number;
  timeout_ms: number;
  circuit_breaker?: CircuitBreakerConfig;
}

export interface CircuitBreakerConfig {
  failure_threshold: number;
  recovery_timeout_ms: number;
  monitoring_window_ms: number;
  half_open_requests: number;
}
```

#### 8. Encryption & Secrets Management

```typescript
// Field-level encryption metadata
export interface EncryptedField {
  field_path: string;
  encryption_key_id: string;
  algorithm: 'AES-256-GCM' | 'AES-256-CBC';
  encrypted_at: Date;
  rotated_at?: Date;
}

// Secret reference (never store actual secrets)
export interface SecretReference {
  secret_id: string;
  secret_type: 'api_key' | 'password' | 'token' | 'certificate';
  vault_path: string; // External secret manager path
  version?: number;
  expires_at?: Date;
  rotation_schedule?: string; // Cron expression
}

// Content encryption status
export interface ContentEncryption {
  version_id: number;
  encrypted_fields: EncryptedField[];
  encryption_key_id: string;
  fully_encrypted: boolean;
  encryption_verified_at?: Date;
}
```

### Privacy-Preserving Data Structures

#### 1. Anonymized Version History

```typescript
// Anonymized version for public/analytics use
export interface AnonymizedVersion {
  version_number: number;
  version_type: VersionType;
  created_at: Date; // Rounded to day
  word_count?: number;
  has_media?: boolean;
  locale: string;
  // No user_id, author name, or PII
  anonymization_method: 'removed' | 'hashed' | 'generalized';
}
```

#### 2. Privacy-Safe Export

```typescript
// GDPR/CCPA compliant data export
export interface PrivacySafeExport {
  export_id: string;
  requested_by: number;
  requested_at: Date;
  data_categories: string[];
  excluded_fields: string[]; // PII excluded unless requested
  anonymization_applied: boolean;
  encryption_key_id?: string;
  expires_at: Date;
  download_count: number;
  max_downloads: number;
}
```

### Permission Checking Patterns

#### 1. Type-Safe Permission Guards

```typescript
// Permission check function type
type PermissionGuard<T> = (
  user: SecureSession,
  resource: T,
  action: string
) => Promise<PermissionResult>;

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  required_permissions?: string[];
  missing_permissions?: string[];
  suggestions?: string[]; // e.g., "Request access from admin"
}

// Resource-specific guards
export interface VersionPermissionGuards {
  canRead: PermissionGuard<ContentVersion>;
  canEdit: PermissionGuard<ContentVersion>;
  canPublish: PermissionGuard<ContentVersion>;
  canDelete: PermissionGuard<ContentVersion>;
  canComment: PermissionGuard<ContentVersion>;
  canCreatePreview: PermissionGuard<ContentVersion>;
}
```

#### 2. Hierarchical Permission Checks

```typescript
// Check permissions at multiple levels
export interface HierarchicalPermission {
  organization_level?: string[];
  project_level?: string[];
  site_level?: string[];
  resource_level?: string[];
  effective_permissions: string[]; // Computed final set
}
```

### Data Retention Policies in Types

```typescript
// Retention policy enforcement
export interface RetentionPolicy {
  policy_id: string;
  policy_name: string;
  resource_type: string;
  retention_days: number;
  deletion_strategy: DeletionStrategy;
  exceptions?: RetentionException[];
  legal_hold?: boolean;
  auto_delete_enabled: boolean;
}

export interface DeletionStrategy {
  type: 'hard_delete' | 'soft_delete' | 'anonymize' | 'archive';
  anonymization_fields?: string[];
  archive_location?: string;
  verification_required?: boolean;
}

export interface RetentionException {
  reason: 'legal_hold' | 'compliance' | 'business_critical';
  expires_at?: Date;
  approved_by: number;
}
```

### Security Validation Utilities

```typescript
// Input validation types
export interface ValidationRule {
  field: string;
  rules: {
    required?: boolean;
    max_length?: number;
    pattern?: RegExp;
    sanitize?: boolean;
    escape_html?: boolean;
    custom?: (value: any) => boolean;
  };
}

// XSS prevention
export interface SanitizationConfig {
  allowed_tags?: string[];
  allowed_attributes?: Record<string, string[]>;
  strip_dangerous?: boolean;
  encode_entities?: boolean;
}

// SQL injection prevention (for dynamic queries)
export interface SafeQueryBuilder<T> {
  table: string;
  site_id: number; // Always required
  where: Record<string, any>;
  parameterized: boolean; // Must be true
  validated: boolean;
  _phantom?: T; // Type-only field for type safety
}
```

### Security Headers Type Support

```typescript
// Security headers configuration
export interface SecurityHeaders {
  'Content-Security-Policy': CSPConfig;
  'X-Frame-Options': 'DENY' | 'SAMEORIGIN';
  'X-Content-Type-Options': 'nosniff';
  'Strict-Transport-Security': string;
  'X-XSS-Protection': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
}

export interface CSPConfig {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'connect-src': string[];
  'font-src': string[];
  'frame-src': string[];
  'report-uri'?: string;
}
```

### Compliance & Regulatory Types

```typescript
// GDPR compliance tracking
export interface GDPRCompliance {
  user_id: number;
  consent_given: boolean;
  consent_timestamp?: Date;
  consent_version: string;
  purposes: string[];
  withdrawal_timestamp?: Date;
  deletion_requested?: Date;
  deletion_completed?: Date;
  export_requested?: Date;
  export_completed?: Date;
}

// CCPA compliance tracking
export interface CCPACompliance {
  user_id: number;
  opted_out: boolean;
  opt_out_timestamp?: Date;
  deletion_requested?: Date;
  deletion_completed?: Date;
  categories_collected: string[];
  sale_opt_out?: boolean;
}
```

### Security Testing Requirements

```typescript
// Security test cases for type validation
export interface SecurityTestCase {
  test_id: string;
  category: 'xss' | 'sql_injection' | 'auth' | 'encryption' | 'rate_limit';
  input: any;
  expected_result: 'blocked' | 'sanitized' | 'allowed';
  actual_result?: string;
  passed?: boolean;
}

// Penetration test results
export interface PenTestResult {
  test_date: Date;
  findings: SecurityFinding[];
  remediation_status: Record<string, RemediationStatus>;
}

export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  affected_types?: string[]; // TypeScript types affected
  remediation: string;
  verified: boolean;
}

export interface RemediationStatus {
  finding_id: string;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted';
  resolved_at?: Date;
  resolved_by?: number;
}
```

### Security Implementation Notes

1. **Never Store Sensitive Data in Plain Text**: All tokens, passwords, and API keys must be hashed or encrypted
2. **Always Validate Site Context**: Every query must include site_id to prevent cross-site data leakage
3. **Implement Defense in Depth**: Multiple layers of security checks at type, API, and database levels
4. **Log Everything Security-Related**: Comprehensive audit logging for all security events
5. **Rate Limit Everything**: Apply rate limiting to all endpoints, with stricter limits for sensitive operations
6. **Encrypt PII at Rest**: All PII fields must be encrypted in the database
7. **Secure by Default**: All new types must have security considerations documented
8. **Regular Security Reviews**: Type definitions must be reviewed for security implications

### Implementation Timeline

**Phase 1 (Weeks 1-2): Foundation**
- Enhanced core type definitions
- API contract specification
- Error handling framework
- Testing infrastructure setup

**Phase 2 (Weeks 3-4): Integration**
- Frontend component type integration
- WebSocket event type implementation
- React Query integration
- Form validation alignment

**Phase 3 (Weeks 5-6): Optimization**
- Performance optimization
- Bundle size optimization
- Migration utilities
- Documentation completion

**Phase 4 (Week 7): Testing & Validation**
- Comprehensive testing suite
- Integration testing
- Performance validation
- Security review

### Success Metrics

**Type Safety Metrics:**
- 0 TypeScript compilation errors in strict mode
- 95%+ test coverage for type guard functions
- 100% API endpoint type coverage

**Performance Metrics:**
- Bundle size increase < 5% from type additions
- Type checking time < 10s for full project build
- Runtime validation overhead < 2ms per request

**Developer Experience Metrics:**
- IDE autocomplete accuracy > 95%
- Developer onboarding time reduction > 20%
- Type-related bug reports < 1 per sprint

This comprehensive technical specification provides a robust foundation for implementing type-safe content versioning while maintaining excellent performance and developer experience.

---

## Performance & Observability Specifications

### Overview

This section defines performance-optimized type patterns and observability requirements to ensure the versioning system meets the PRD targets of p95 API latency ≤ 300ms and 99.9% uptime. All type definitions must enable high-performance operations while providing comprehensive monitoring and tracing capabilities.

### Performance-Optimized Type Patterns

#### 1. TypeScript Compilation Performance

```typescript
// Lazy type imports to reduce compilation time
export interface VersioningTypeRegistry {
  core: () => Promise<typeof import('./core')>;
  api: () => Promise<typeof import('./api')>;
  websocket: () => Promise<typeof import('./websocket')>;
}

// Conditional type loading based on feature flags
export type ConditionalTypes<T extends boolean> = T extends true
  ? typeof import('./full-types')
  : typeof import('./minimal-types');

// Template literal types for cache keys (compile-time safety, zero runtime cost)
export type CacheKey<T extends string, P extends Record<string, unknown>> =
  `${T}:${string & keyof P}=${string}`;

// Optimized discriminated unions for better tree-shaking
export type VersionTypeOptimized =
  | { type: 'draft'; draft_data: DraftSpecificData }
  | { type: 'published'; published_data: PublishedSpecificData }
  | { type: 'archived'; archived_data: ArchivedSpecificData };
```

#### 2. Bundle Size Optimization

```typescript
// Selective field types to minimize bundle impact
export interface CompactContentVersion {
  id: number;
  title: string;
  version_type: VersionType;
  created_at: string; // ISO string instead of Date object
  is_current: boolean;
  site_id: number;
}

// Field selection utility for API responses
export type VersionFieldSelection<T extends keyof ContentVersion[]> =
  Pick<ContentVersion, T[number]>;

// Lazy-loaded extended fields
export interface ExtendedVersionData {
  content?: () => Promise<string>;
  comments?: () => Promise<VersionComment[]>;
  preview_tokens?: () => Promise<PreviewToken[]>;
  audit_log?: () => Promise<AuditLogEntry[]>;
}

// Tree-shakable enum alternatives
export const VersionStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived'
} as const;
export type VersionStatusType = typeof VersionStatus[keyof typeof VersionStatus];
```

#### 3. Runtime Validation Performance

```typescript
// Schema-aligned validation types to prevent dual validation
export interface FastValidationSchema {
  field: keyof ContentVersion;
  rules: ValidationRule[];
  cache_key: string;
  skip_if_cached: boolean;
}

// Incremental validation for large objects
export interface IncrementalValidation<T> {
  target: T;
  changed_fields: (keyof T)[];
  validation_cache: Map<keyof T, ValidationResult>;
  revalidate_dependencies: (keyof T)[][];
}

// Pre-compiled validation functions
export type CompiledValidator<T> = {
  validate: (data: T) => ValidationResult;
  validateField: <K extends keyof T>(field: K, value: T[K]) => ValidationResult;
  schema_hash: string; // For cache invalidation
  compiled_at: number; // Timestamp
};
```

### Memory Efficiency for Large Datasets

#### 1. Pagination-Optimized Types

```typescript
// Cursor-based pagination for better performance
export interface CursorPaginatedResponse<T> {
  items: T[];
  page_info: {
    has_next_page: boolean;
    has_previous_page: boolean;
    start_cursor: string;
    end_cursor: string;
  };
  total_count?: number; // Optional for performance
  query_time_ms: number;
  cache_hit: boolean;
}

// Streaming response for large version lists
export interface VersionStream {
  version_id: number;
  basic_data: CompactContentVersion;
  load_full: () => Promise<ContentVersion>;
  preload_priority: 'high' | 'normal' | 'low';
}

// Optimized bulk operations
export interface BulkVersionQuery {
  version_ids: number[];
  fields: (keyof ContentVersion)[];
  batch_size: number; // Max 100
  parallel_batches: number; // Max 3
  cache_strategy: 'aggressive' | 'normal' | 'bypass';
}
```

#### 2. Memory-Efficient Data Structures

```typescript
// Shared reference patterns to reduce memory usage
export interface VersionReference {
  id: number;
  title: string;
  version_type: VersionType;
  created_at: string;
  // References to shared data
  author_ref: UserReference;
  site_ref: SiteReference;
}

// Flyweight pattern for common data
export interface CommonVersionData {
  site_context: SiteContext;
  user_permissions: PermissionSet;
  theme_tokens: ThemeTokens;
}

// Memory-mapped large content
export interface LargeContentHandle {
  content_id: number;
  size_bytes: number;
  content_type: string;
  load_chunk: (offset: number, size: number) => Promise<string>;
  load_full: () => Promise<string>;
  is_cached: boolean;
}
```

### Caching Strategy Types

#### 1. Type-Safe Cache Operations

```typescript
// Multi-layer cache configuration
export interface CacheLayerConfig {
  memory_cache: {
    max_size_mb: number;
    ttl_seconds: number;
    eviction_policy: 'lru' | 'lfu' | 'ttl';
  };
  redis_cache: {
    ttl_seconds: number;
    key_prefix: string;
    compression: boolean;
  };
  cdn_cache: {
    ttl_seconds: number;
    edge_locations: string[];
    purge_endpoints: string[];
  };
}

// Cache key builders with type safety
export interface VersionCacheKeys {
  version_detail: (id: number, fields?: string[]) => string;
  version_list: (site_id: number, filters: VersionFilters) => string;
  user_permissions: (user_id: number, site_id: number) => string;
  preview_token: (token_hash: string) => string;
  diff_comparison: (version_a: number, version_b: number) => string;
}

// Cache invalidation patterns
export interface CacheInvalidationRules {
  on_version_create: CacheKey[];
  on_version_update: (version_id: number) => CacheKey[];
  on_version_publish: (version_id: number, site_id: number) => CacheKey[];
  on_user_permission_change: (user_id: number, site_ids: number[]) => CacheKey[];
}

// Cache performance metrics
export interface CacheMetrics {
  hit_rate: number;
  miss_rate: number;
  eviction_rate: number;
  memory_usage_mb: number;
  avg_lookup_time_ms: number;
  invalidation_frequency: number;
}
```

#### 2. Query Optimization Helpers

```typescript
// Query builder with performance hints
export interface OptimizedQuery<T> {
  base_query: string;
  parameters: Record<string, unknown>;
  indexes_used: string[];
  estimated_rows: number;
  execution_plan_hash: string;
  cache_eligible: boolean;
  performance_hints: QueryHint[];
}

export interface QueryHint {
  type: 'index_suggestion' | 'join_order' | 'cache_strategy';
  suggestion: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
}

// Batch query optimization
export interface BatchQueryPlan {
  queries: OptimizedQuery<unknown>[];
  execution_order: number[];
  parallel_groups: number[][];
  total_estimated_time_ms: number;
  memory_requirements_mb: number;
}
```

### WebSocket Performance Types

#### 1. High-Performance WebSocket Events

```typescript
// Binary-optimized message format for high-frequency events
export interface BinaryWebSocketMessage {
  message_type: number; // 1-byte enum instead of string
  site_id: number;
  user_id: number;
  payload_length: number;
  payload: Uint8Array;
  checksum: number;
}

// Event batching for performance
export interface BatchedWebSocketEvents {
  batch_id: string;
  events: WebSocketMessage<keyof WebSocketEvents>[];
  compression: 'gzip' | 'brotli' | 'none';
  total_size_bytes: number;
  batch_time_ms: number;
}

// Connection pooling and management
export interface WebSocketPool {
  max_connections_per_site: number;
  connection_timeout_ms: number;
  heartbeat_interval_ms: number;
  message_queue_limit: number;
  backpressure_threshold: number;
}
```

#### 2. Real-time Performance Monitoring

```typescript
// WebSocket performance metrics
export interface WebSocketPerformanceMetrics {
  connection_id: string;
  messages_per_second: number;
  avg_message_size_bytes: number;
  queue_depth: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  error_rate: number;
  reconnection_count: number;
}
```

### Observability Type Requirements

#### 1. Structured Logging Types

```typescript
// Performance-aware log entry
export interface PerformanceLogEntry {
  timestamp: string; // ISO 8601
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  correlation_id: string;
  trace_id?: string;
  span_id?: string;
  service: 'versioning-api' | 'websocket-service' | 'frontend';
  operation: string;
  duration_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;

  // Performance-specific fields
  performance_metrics?: {
    db_query_time_ms?: number;
    cache_lookup_time_ms?: number;
    validation_time_ms?: number;
    serialization_time_ms?: number;
    network_time_ms?: number;
  };

  // Context for debugging
  context?: {
    site_id: number;
    user_id?: number;
    version_id?: number;
    request_size_bytes?: number;
    response_size_bytes?: number;
  };

  // Error details
  error?: {
    code: string;
    message: string;
    stack_trace?: string;
    recoverable: boolean;
  };
}

// Log aggregation for performance analysis
export interface LogAggregation {
  time_window: {
    start: string;
    end: string;
    duration_minutes: number;
  };
  operation: string;
  metrics: {
    total_requests: number;
    avg_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
    p99_duration_ms: number;
    error_rate: number;
    throughput_rps: number;
  };
  top_errors: ErrorSummary[];
}

export interface ErrorSummary {
  error_code: string;
  count: number;
  first_occurrence: string;
  last_occurrence: string;
  sample_message: string;
}
```

#### 2. Metrics Collection Types

```typescript
// Core performance metrics
export interface VersioningMetrics {
  // API performance
  api_latency_p50_ms: number;
  api_latency_p95_ms: number;
  api_latency_p99_ms: number;
  api_error_rate: number;
  api_throughput_rps: number;

  // Database performance
  db_connection_pool_usage: number;
  db_query_time_avg_ms: number;
  db_slow_query_count: number;
  db_deadlock_count: number;

  // Cache performance
  cache_hit_rate: number;
  cache_eviction_rate: number;
  cache_memory_usage_mb: number;

  // WebSocket performance
  ws_connection_count: number;
  ws_message_rate: number;
  ws_reconnection_rate: number;

  // Memory and CPU
  memory_usage_mb: number;
  cpu_usage_percent: number;
  gc_pause_time_ms: number;

  // Business metrics
  versions_created_per_minute: number;
  versions_published_per_minute: number;
  preview_tokens_generated_per_minute: number;
  comments_added_per_minute: number;
}

// Metric collection configuration
export interface MetricsConfig {
  collection_interval_seconds: number;
  retention_days: number;
  aggregation_windows: ('1m' | '5m' | '1h' | '1d')[];
  alert_thresholds: AlertThresholds;
  export_endpoints: MetricExportEndpoint[];
}

export interface AlertThresholds {
  api_latency_p95_ms: number; // 300ms per PRD
  error_rate_percent: number; // 0.1% for 99.9% uptime
  memory_usage_percent: number; // 85%
  cpu_usage_percent: number; // 80%
  db_connection_usage_percent: number; // 85%
  cache_hit_rate_minimum: number; // 85%
}
```

#### 3. Distributed Tracing Types

```typescript
// Trace context for performance tracking
export interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  operation_name: string;
  service_name: string;
  start_time: number; // Unix timestamp with microseconds
  end_time?: number;
  duration_microseconds?: number;
  status: 'OK' | 'ERROR' | 'TIMEOUT';

  // Performance-specific attributes
  attributes: {
    'http.method'?: string;
    'http.status_code'?: number;
    'http.url'?: string;
    'db.statement'?: string;
    'db.rows_affected'?: number;
    'cache.hit'?: boolean;
    'version.id'?: number;
    'site.id'?: number;
    'user.id'?: number;

    // Custom performance attributes
    'perf.memory_allocated_bytes'?: number;
    'perf.cpu_time_ms'?: number;
    'perf.queue_wait_time_ms'?: number;
    'perf.validation_time_ms'?: number;
  };

  // Event tracking within spans
  events: TraceEvent[];
}

export interface TraceEvent {
  timestamp: number;
  name: string;
  attributes: Record<string, string | number | boolean>;
}

// Critical path tracing for version operations
export interface VersionOperationTrace {
  operation: 'create' | 'update' | 'publish' | 'compare' | 'preview';
  version_id: number;
  site_id: number;
  user_id: number;
  trace_context: TraceContext;

  // Performance checkpoints
  checkpoints: {
    request_received: number;
    validation_complete: number;
    db_write_complete: number;
    cache_updated: number;
    response_sent: number;
    websocket_notified?: number;
  };

  // Resource usage tracking
  resource_usage: {
    peak_memory_mb: number;
    cpu_time_ms: number;
    db_queries_executed: number;
    cache_operations: number;
  };
}
```

### Performance Monitoring Dashboard Types

#### 1. Real-time Performance Dashboard

```typescript
// Dashboard configuration for performance monitoring
export interface PerformanceDashboard {
  dashboard_id: string;
  title: string;
  refresh_interval_seconds: number;
  time_range: TimeRange;
  panels: DashboardPanel[];
  alert_rules: AlertRule[];
}

export interface DashboardPanel {
  panel_id: string;
  title: string;
  type: 'line_chart' | 'gauge' | 'table' | 'heatmap';
  metrics: MetricQuery[];
  thresholds?: {
    warning: number;
    critical: number;
  };
  display_options: {
    unit: string;
    decimals: number;
    legend_visible: boolean;
  };
}

export interface MetricQuery {
  metric_name: string;
  aggregation: 'avg' | 'sum' | 'max' | 'min' | 'p50' | 'p95' | 'p99';
  filters: Record<string, string>;
  group_by: string[];
  time_window: string;
}

export interface TimeRange {
  start: string | 'now-1h' | 'now-24h' | 'now-7d';
  end: string | 'now';
}
```

#### 2. SLO/SLA Tracking Types

```typescript
// Service Level Objective definitions
export interface ServiceLevelObjective {
  slo_id: string;
  name: string;
  description: string;
  service: string;

  // SLI (Service Level Indicator)
  sli: {
    metric: string;
    good_events_query: MetricQuery;
    total_events_query: MetricQuery;
  };

  // SLO targets
  objectives: {
    target: number; // e.g., 0.999 for 99.9%
    time_window: '1h' | '24h' | '7d' | '30d';
    rolling_window: boolean;
  }[];

  // Error budget
  error_budget: {
    remaining_percent: number;
    burn_rate: number;
    exhaustion_time?: string; // ISO 8601 if trending towards exhaustion
  };

  // Alerting
  alert_conditions: {
    burn_rate_threshold: number;
    time_window: string;
    alert_severity: 'warning' | 'critical';
  }[];
}

// Performance compliance tracking
export interface PerformanceCompliance {
  compliance_period: {
    start: string;
    end: string;
  };

  // PRD targets compliance
  api_latency_compliance: {
    target_p95_ms: 300;
    actual_p95_ms: number;
    compliance_rate: number;
    violations: PerformanceViolation[];
  };

  uptime_compliance: {
    target_percent: 99.9;
    actual_percent: number;
    downtime_incidents: DowntimeIncident[];
  };

  // Custom SLOs
  custom_slos: ServiceLevelObjective[];
}

export interface PerformanceViolation {
  timestamp: string;
  metric: string;
  threshold: number;
  actual_value: number;
  duration_seconds: number;
  root_cause?: string;
  resolution?: string;
}

export interface DowntimeIncident {
  incident_id: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[];
  root_cause?: string;
  resolution?: string;
}
```

### Load Testing and Performance Validation Types

```typescript
// Load test configuration
export interface LoadTestScenario {
  scenario_name: string;
  target_rps: number;
  duration_seconds: number;
  ramp_up_seconds: number;

  operations: LoadTestOperation[];
  user_patterns: UserPattern[];

  success_criteria: {
    max_p95_latency_ms: number;
    max_error_rate_percent: number;
    min_throughput_rps: number;
  };
}

export interface LoadTestOperation {
  operation: string;
  weight: number; // Relative frequency
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  payload_template?: Record<string, unknown>;
  expected_response_time_ms: number;
}

export interface UserPattern {
  pattern_name: string;
  percentage: number;
  operations_per_session: number;
  think_time_seconds: number;
  session_duration_seconds: number;
}

// Performance test results
export interface LoadTestResults {
  test_id: string;
  scenario: LoadTestScenario;
  start_time: string;
  end_time: string;

  overall_metrics: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_rps: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
  };

  operation_metrics: Record<string, OperationMetrics>;
  resource_usage: ResourceUsageMetrics;
  bottlenecks: PerformanceBottleneck[];
  recommendations: PerformanceRecommendation[];
}

export interface OperationMetrics {
  operation: string;
  request_count: number;
  error_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  throughput_rps: number;
}

export interface ResourceUsageMetrics {
  peak_cpu_usage_percent: number;
  peak_memory_usage_mb: number;
  db_connection_peak: number;
  cache_hit_rate: number;
  network_throughput_mbps: number;
}

export interface PerformanceBottleneck {
  component: 'database' | 'cache' | 'api' | 'websocket' | 'network';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impact_on_latency_ms: number;
  suggested_fix: string;
}

export interface PerformanceRecommendation {
  category: 'scaling' | 'optimization' | 'caching' | 'indexing';
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimated_improvement: string;
  implementation_effort: 'low' | 'medium' | 'high';
}
```

### Implementation Priorities

#### High Priority (Week 1-2)
1. **Core Performance Types**: Basic caching, pagination, and query optimization types
2. **Logging Infrastructure**: Structured logging with performance metrics
3. **Critical Metrics**: API latency, error rates, and throughput tracking
4. **Database Query Optimization**: Type-safe query builders with performance hints

#### Medium Priority (Week 3-4)
1. **Advanced Caching**: Multi-layer cache types and invalidation patterns
2. **Tracing Integration**: Distributed tracing with performance context
3. **WebSocket Performance**: Optimized real-time communication types
4. **Memory Optimization**: Efficient data structures for large datasets

#### Low Priority (Week 5-6)
1. **Dashboard Types**: Performance monitoring dashboard configurations
2. **SLO/SLA Tracking**: Service level objective definitions and compliance
3. **Load Testing**: Comprehensive performance testing type definitions
4. **Advanced Analytics**: Performance trend analysis and capacity planning

### Success Criteria

**Performance Targets (PRD Compliance):**
- [ ] API latency p95 ≤ 300ms with type safety overhead < 5ms
- [ ] 99.9% uptime with performance monitoring coverage
- [ ] Memory usage optimization: < 2MB overhead for type system
- [ ] Bundle size impact: < 100KB increase from performance types

**Observability Coverage:**
- [ ] 100% of critical paths have distributed tracing
- [ ] All API endpoints emit structured performance logs
- [ ] Real-time metrics for all SLO-relevant operations
- [ ] Automated alerting on performance threshold violations

**Type System Performance:**
- [ ] TypeScript compilation time increase < 10%
- [ ] Runtime validation overhead < 2ms per request
- [ ] Cache hit rates > 85% for type-related operations
- [ ] Zero performance regressions from type additions

This specification ensures the versioning type system enables high-performance operations while providing comprehensive observability and monitoring capabilities to meet the demanding requirements of a multi-site CMS platform.

---

## Database Alignment Specifications

### Overview

This section defines critical database alignment requirements for the content versioning type system, ensuring perfect synchronization between TypeScript types and PostgreSQL schema while enabling optimal query patterns and maintaining data consistency across the multi-site architecture.

### Type-to-Schema Mapping Validation

#### 1. Core Schema Alignment Analysis

**Current Database State:**
- **Sites Table**: ✅ Exists with `id`, `domain_id`, `name`, `base_path`, `title`, `description`, `settings` (JSONB)
- **Domains Table**: ✅ Exists with `id`, `hostname`, `is_active`, `is_default`, `settings` (JSONB)
- **Content Versioning Schema**: ❌ **CRITICAL GAP** - Existing migration lacks site_id integration
- **Multi-Site Context**: ⚠️ **PARTIAL** - Types reference site_id but schema doesn't enforce it

**Critical Schema-Type Misalignments:**

1. **Missing Site Context in Content Versions**
   ```sql
   -- REQUIRED: Add site_id to content_versions table
   ALTER TABLE content_versions ADD COLUMN site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE;
   ALTER TABLE content_versions ADD COLUMN locale VARCHAR(10) DEFAULT 'en';

   -- Update unique constraints to include site_id
   ALTER TABLE content_versions DROP CONSTRAINT unique_content_version;
   ALTER TABLE content_versions ADD CONSTRAINT unique_content_version
   UNIQUE (site_id, content_type, content_id, version_number);
   ```

2. **Missing Site Context in Preview Tokens**
   ```sql
   -- REQUIRED: Add site_id and domain context
   ALTER TABLE preview_tokens ADD COLUMN site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE;
   ALTER TABLE preview_tokens ADD COLUMN domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL;
   ALTER TABLE preview_tokens ADD COLUMN locale VARCHAR(10);

   -- Update indexes for site-scoped queries
   CREATE INDEX idx_preview_tokens_site_active ON preview_tokens(site_id, is_active) WHERE is_active = TRUE;
   ```

3. **Missing Site Context in Version Comments**
   ```sql
   -- REQUIRED: Add site_id for data isolation
   ALTER TABLE version_comments ADD COLUMN site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE;
   ```

#### 2. Type-Safe Schema Validation

```typescript
// Schema validation utilities to ensure type-database alignment
export interface SchemaValidationResult {
  table_name: string;
  type_interface: string;
  validation_status: 'aligned' | 'misaligned' | 'missing_fields' | 'extra_fields';
  issues: SchemaIssue[];
  performance_impact: 'none' | 'low' | 'medium' | 'high';
}

export interface SchemaIssue {
  severity: 'blocker' | 'high' | 'medium' | 'low';
  field_name: string;
  issue_type: 'missing_column' | 'type_mismatch' | 'constraint_missing' | 'index_missing';
  database_definition?: string;
  typescript_definition?: string;
  recommended_fix: string;
}

// Runtime validation against actual database schema
export interface DatabaseSchemaIntrospection {
  tables: {
    content_versions: TableDefinition;
    preview_tokens: TableDefinition;
    version_comments: TableDefinition;
  };
  indexes: IndexDefinition[];
  constraints: ConstraintDefinition[];
  functions: FunctionDefinition[];
}

export interface TableDefinition {
  columns: ColumnDefinition[];
  primary_key: string[];
  foreign_keys: ForeignKeyDefinition[];
  unique_constraints: UniqueConstraintDefinition[];
  check_constraints: CheckConstraintDefinition[];
}

export interface ColumnDefinition {
  name: string;
  data_type: string;
  is_nullable: boolean;
  default_value: string | null;
  character_maximum_length: number | null;
  is_identity: boolean;
  identity_generation: string | null;
}
```

### JSONB Field Type Definitions and Validation

#### 1. Type-Safe JSONB Patterns

```typescript
// Strongly-typed JSONB field definitions
export interface ContentVersionData {
  // Site-specific content data
  theme_overrides?: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    layouts?: string[];
  };

  // SEO and metadata
  seo_data?: {
    meta_title?: string;
    meta_description?: string;
    og_image?: string;
    og_title?: string;
    og_description?: string;
    twitter_card?: 'summary' | 'summary_large_image';
    canonical_url?: string;
    noindex?: boolean;
    nofollow?: boolean;
  };

  // Custom fields per site/locale
  custom_fields?: Record<string, JsonValue>;

  // A/B testing data
  ab_test_data?: {
    variant_id?: string;
    test_id?: string;
    conversion_goals?: string[];
  };

  // Analytics tracking
  analytics?: {
    ga_tracking_id?: string;
    custom_events?: Array<{
      event_name: string;
      parameters: Record<string, string | number>;
    }>;
  };
}

// Type-safe JSONB validation
export interface JsonbValidator<T> {
  schema: JsonSchema;
  validate: (data: unknown) => ValidationResult<T>;
  sanitize: (data: unknown) => T | null;
  migrate: (oldData: unknown, fromVersion: string, toVersion: string) => T;
}

// Runtime JSONB type checking
export function validateContentVersionData(data: unknown): data is ContentVersionData {
  // Implementation with comprehensive validation
  return typeof data === 'object' &&
         data !== null &&
         // Add specific validation logic
         true;
}
```

#### 2. JSONB Performance Optimization

```typescript
// Indexed JSONB query patterns
export interface JsonbQueryPattern {
  field_path: string;
  index_expression: string;
  query_examples: string[];
  performance_characteristics: {
    index_size_estimate_mb: number;
    query_time_estimate_ms: number;
    maintenance_overhead: 'low' | 'medium' | 'high';
  };
}

// Optimized JSONB indexes for content versioning
export const RECOMMENDED_JSONB_INDEXES: JsonbQueryPattern[] = [
  {
    field_path: 'data.seo_data.meta_title',
    index_expression: "CREATE INDEX CONCURRENTLY idx_versions_meta_title ON content_versions USING GIN ((data->'seo_data'->>'meta_title')) WHERE data->'seo_data'->>'meta_title' IS NOT NULL;",
    query_examples: [
      "SELECT * FROM content_versions WHERE data->'seo_data'->>'meta_title' ILIKE '%keyword%'"
    ],
    performance_characteristics: {
      index_size_estimate_mb: 5,
      query_time_estimate_ms: 15,
      maintenance_overhead: 'low'
    }
  },
  {
    field_path: 'data.custom_fields',
    index_expression: "CREATE INDEX CONCURRENTLY idx_versions_custom_fields ON content_versions USING GIN ((data->'custom_fields'));",
    query_examples: [
      "SELECT * FROM content_versions WHERE data->'custom_fields' ? 'featured'",
      "SELECT * FROM content_versions WHERE data->'custom_fields'->>'category' = 'news'"
    ],
    performance_characteristics: {
      index_size_estimate_mb: 15,
      query_time_estimate_ms: 25,
      maintenance_overhead: 'medium'
    }
  }
];
```

### Index-Aware Type Patterns for Query Optimization

#### 1. Performance-Optimized Query Types

```typescript
// Query builders that leverage database indexes
export interface SiteVersionQuery {
  site_id: number; // REQUIRED - always uses idx_versions_site_content
  content_type?: ContentType; // Uses composite index
  content_id?: number; // Uses composite index
  version_type?: VersionType[]; // Uses partial index
  is_current?: boolean; // Uses partial index
  created_after?: Date; // Uses idx_versions_created_at
  limit?: number; // Enforces reasonable limits
  offset?: number; // Warning: avoid large offsets
}

// Index hint types for query optimization
export interface QueryIndexHints {
  preferred_indexes: string[];
  avoid_indexes: string[];
  force_index_scan?: boolean;
  estimated_rows?: number;
  query_complexity_score: number; // 1-10 scale
}

// Performance-aware query builder
export interface OptimizedVersionQuery {
  base_conditions: SiteVersionQuery;
  index_hints: QueryIndexHints;
  execution_plan?: {
    estimated_cost: number;
    estimated_rows: number;
    index_usage: string[];
  };
}
```

#### 2. Database Index Documentation

```typescript
// Complete index catalog for versioning system
export interface VersioningIndexCatalog {
  primary_indexes: {
    'idx_versions_site_content': {
      definition: '(site_id, content_type, content_id, version_number DESC)';
      usage_patterns: ['version_history_queries', 'latest_version_lookup'];
      estimated_selectivity: 0.001;
      size_growth_rate_mb_per_1k_versions: 0.5;
    };
    'idx_versions_current_draft': {
      definition: '(site_id, content_id) WHERE is_current_draft = TRUE';
      usage_patterns: ['draft_lookup', 'editor_queries'];
      estimated_selectivity: 0.0001;
      size_growth_rate_mb_per_1k_versions: 0.1;
    };
  };

  performance_indexes: {
    'idx_versions_published_recent': {
      definition: '(site_id, published_at DESC) WHERE is_current_published = TRUE';
      usage_patterns: ['public_content_listing', 'rss_feeds'];
      estimated_selectivity: 0.0001;
      size_growth_rate_mb_per_1k_versions: 0.2;
    };
  };

  jsonb_indexes: {
    'idx_versions_data_gin': {
      definition: 'USING GIN (data jsonb_path_ops)';
      usage_patterns: ['custom_field_queries', 'metadata_search'];
      estimated_selectivity: 0.01;
      size_growth_rate_mb_per_1k_versions: 2.0;
    };
  };
}
```

### Multi-Tenant Data Isolation in Types

#### 1. Site-Scoped Query Enforcement

```typescript
// Compile-time site isolation enforcement
export type SiteScopedQuery<T> = T & {
  site_id: number; // REQUIRED field for all queries
  __site_isolation_enforced: true; // Phantom type for compiler
};

// Site isolation validator
export interface SiteIsolationContext {
  current_user_id: number;
  allowed_site_ids: number[];
  permission_level: 'read' | 'write' | 'admin';
  audit_log_enabled: boolean;
}

// Query validator that enforces site isolation
export function validateSiteAccess<T>(
  query: T,
  context: SiteIsolationContext
): SiteScopedQuery<T> | ValidationError {
  // Implementation that validates site_id is in allowed_site_ids
  // Returns ValidationError if access not allowed
  return query as SiteScopedQuery<T>;
}

// Row-Level Security (RLS) type support
export interface RLSPolicyDefinition {
  policy_name: string;
  table_name: string;
  policy_type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  condition: string;
  description: string;
}

// RLS policies for content versioning
export const VERSIONING_RLS_POLICIES: RLSPolicyDefinition[] = [
  {
    policy_name: 'site_isolation_content_versions',
    table_name: 'content_versions',
    policy_type: 'SELECT',
    condition: 'site_id = ANY(current_user_sites())',
    description: 'Users can only access versions from sites they have access to'
  },
  {
    policy_name: 'site_isolation_preview_tokens',
    table_name: 'preview_tokens',
    policy_type: 'SELECT',
    condition: 'site_id = ANY(current_user_sites())',
    description: 'Users can only access preview tokens from their sites'
  }
];
```

#### 2. Cross-Site Data Prevention

```typescript
// Prevent accidental cross-site data access
export interface SiteIsolatedResponse<T> {
  site_id: number;
  data: T;
  isolation_verified: true;
  query_audit_id?: string;
}

// Type-level cross-site validation
export type PreventCrossSiteQuery<T> = T extends { site_id: number }
  ? T
  : never; // Compile error if site_id missing

// Database function types for site validation
export interface SiteValidationFunctions {
  current_user_sites: () => number[];
  validate_site_access: (site_id: number, user_id: number) => boolean;
  audit_site_access: (site_id: number, user_id: number, operation: string) => void;
}
```

### Migration Type Safety Utilities

#### 1. Schema Version Management

```typescript
// Migration-safe type definitions
export interface MigrationSafeType<T, Version extends string> {
  data: T;
  schema_version: Version;
  migration_path?: MigrationPath[];
  backward_compatible_until?: string; // ISO date
}

// Migration utilities for versioning types
export interface VersioningMigration {
  from_version: string;
  to_version: string;
  migration_type: 'schema_change' | 'data_transform' | 'index_addition';
  breaking_change: boolean;
  rollback_possible: boolean;

  // Type transformations
  type_changes: {
    added_fields: string[];
    removed_fields: string[];
    renamed_fields: Array<{ from: string; to: string }>;
    type_changes: Array<{ field: string; old_type: string; new_type: string }>;
  };

  // Database changes
  sql_statements: {
    forward: string[];
    rollback: string[];
    validation: string[];
  };
}

// Migration validation
export interface MigrationValidationResult {
  migration_id: string;
  validation_passed: boolean;
  issues: MigrationIssue[];
  rollback_tested: boolean;
  performance_impact: PerformanceImpact;
}

export interface MigrationIssue {
  severity: 'blocker' | 'warning' | 'info';
  category: 'data_loss' | 'performance' | 'compatibility' | 'security';
  description: string;
  affected_types: string[];
  remediation: string;
}
```

#### 2. Backward Compatibility Types

```typescript
// Legacy type adapters
export interface LegacyContentVersionAdapter {
  canHandle: (data: unknown) => boolean;
  transform: (legacyData: unknown) => ContentVersion;
  validate: (transformed: ContentVersion) => ValidationResult;
  audit: (transformation: unknown) => AuditLogEntry;
}

// Version compatibility matrix
export interface TypeVersionCompatibility {
  current_version: string;
  supported_versions: string[];
  deprecated_versions: Array<{
    version: string;
    deprecation_date: string;
    removal_date: string;
    migration_guide: string;
  }>;
}
```

### Transaction Isolation Level Types

#### 1. Versioning Transaction Patterns

```typescript
// Transaction isolation for version operations
export enum VersioningIsolationLevel {
  READ_COMMITTED = 'READ COMMITTED', // Default for most queries
  REPEATABLE_READ = 'REPEATABLE READ', // For consistent version snapshots
  SERIALIZABLE = 'SERIALIZABLE' // For critical version publishing
}

// Transaction context for versioning operations
export interface VersioningTransactionContext {
  isolation_level: VersioningIsolationLevel;
  site_id: number;
  user_id: number;
  operation_type: 'read' | 'create_version' | 'publish_version' | 'delete_version';
  timeout_ms: number;
  retry_count: number;
  deadlock_detection: boolean;
}

// Safe transaction patterns
export interface VersioningTransaction<T> {
  context: VersioningTransactionContext;
  operations: VersioningOperation[];
  rollback_hooks: Array<() => void>;
  commit_hooks: Array<(result: T) => void>;
  result_validator: (result: T) => boolean;
}

export interface VersioningOperation {
  operation_id: string;
  sql: string;
  parameters: Record<string, unknown>;
  expected_row_count?: number;
  critical_path: boolean; // If true, failure rolls back entire transaction
}
```

### Data Consistency Validation Types

#### 1. Version Consistency Rules

```typescript
// Business rule validation for versioning
export interface VersionConsistencyRule {
  rule_name: string;
  description: string;
  validation_query: string;
  error_message: string;
  severity: 'error' | 'warning';
  auto_fix_available: boolean;
  auto_fix_query?: string;
}

// Consistency validation results
export interface ConsistencyValidationResult {
  site_id: number;
  validation_timestamp: Date;
  rules_checked: number;
  rules_passed: number;
  violations: ConsistencyViolation[];
  overall_status: 'consistent' | 'warnings' | 'violations';
}

export interface ConsistencyViolation {
  rule_name: string;
  severity: 'error' | 'warning';
  affected_records: Array<{
    table: string;
    record_id: number;
    description: string;
  }>;
  suggested_fix: string;
  auto_fixable: boolean;
}

// Key consistency rules for versioning system
export const VERSION_CONSISTENCY_RULES: VersionConsistencyRule[] = [
  {
    rule_name: 'unique_current_draft_per_content',
    description: 'Each content item should have at most one current draft version per site',
    validation_query: `
      SELECT site_id, content_type, content_id, COUNT(*) as draft_count
      FROM content_versions
      WHERE is_current_draft = TRUE
      GROUP BY site_id, content_type, content_id
      HAVING COUNT(*) > 1
    `,
    error_message: 'Multiple current draft versions found for content item',
    severity: 'error',
    auto_fix_available: true,
    auto_fix_query: `
      UPDATE content_versions SET is_current_draft = FALSE
      WHERE id NOT IN (
        SELECT DISTINCT ON (site_id, content_type, content_id) id
        FROM content_versions
        WHERE is_current_draft = TRUE
        ORDER BY site_id, content_type, content_id, created_at DESC
      )
    `
  },
  {
    rule_name: 'preview_tokens_reference_existing_versions',
    description: 'All preview tokens should reference existing versions',
    validation_query: `
      SELECT pt.id, pt.version_id
      FROM preview_tokens pt
      LEFT JOIN content_versions cv ON pt.version_id = cv.id
      WHERE cv.id IS NULL
    `,
    error_message: 'Preview token references non-existent version',
    severity: 'error',
    auto_fix_available: true,
    auto_fix_query: `DELETE FROM preview_tokens WHERE version_id NOT IN (SELECT id FROM content_versions)`
  }
];
```

### Implementation Recommendations

#### 1. Critical Database Changes Required

```sql
-- PHASE 1: Add missing site_id columns (BREAKING CHANGES)
-- Must be done in maintenance window

-- Add site_id to content_versions
ALTER TABLE content_versions
ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id) ON DELETE CASCADE,
ADD COLUMN locale VARCHAR(10) DEFAULT 'en';

-- Update unique constraint
ALTER TABLE content_versions DROP CONSTRAINT IF EXISTS unique_content_version;
ALTER TABLE content_versions ADD CONSTRAINT unique_content_version
UNIQUE (site_id, content_type, content_id, version_number);

-- Add site_id to preview_tokens
ALTER TABLE preview_tokens
ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id) ON DELETE CASCADE,
ADD COLUMN domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
ADD COLUMN locale VARCHAR(10);

-- Add site_id to version_comments
ALTER TABLE version_comments
ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id) ON DELETE CASCADE;

-- PHASE 2: Add performance indexes
CREATE INDEX CONCURRENTLY idx_content_versions_site_content
ON content_versions(site_id, content_type, content_id, version_number DESC);

CREATE INDEX CONCURRENTLY idx_content_versions_site_current
ON content_versions(site_id, content_id, is_current_draft)
WHERE is_current_draft = TRUE;

CREATE INDEX CONCURRENTLY idx_preview_tokens_site_active
ON preview_tokens(site_id, is_active, expires_at)
WHERE is_active = TRUE;
```

#### 2. Type Safety Implementation Priority

**Critical (Week 1):**
1. Add site_id enforcement to all versioning types
2. Implement SiteScopedQuery<T> pattern
3. Add schema validation utilities
4. Create migration safety types

**High Priority (Week 2):**
1. JSONB type safety with validation
2. Index-aware query patterns
3. Transaction isolation types
4. Consistency validation framework

**Medium Priority (Week 3-4):**
1. Performance monitoring types
2. Migration utilities
3. Backward compatibility adapters
4. Advanced JSONB query optimization

### Success Criteria for Database Alignment

**Schema Alignment:**
- [ ] All TypeScript interfaces map 1:1 with database tables
- [ ] JSONB fields have strongly-typed definitions
- [ ] Foreign key relationships are enforced in types
- [ ] Site isolation is enforced at type level

**Performance Alignment:**
- [ ] All query patterns leverage existing indexes
- [ ] No queries require table scans > 1000 rows
- [ ] JSONB queries use GIN indexes appropriately
- [ ] Multi-site queries maintain < 100ms p95 latency

**Data Integrity:**
- [ ] Consistency rules prevent data corruption
- [ ] Cross-site data leakage impossible at type level
- [ ] Transaction patterns prevent race conditions
- [ ] Migration types prevent data loss

This database alignment specification ensures the versioning type system provides both type safety and optimal database performance while maintaining strict multi-site data isolation.

---

## Testing Strategy & Validation

### Overview

This section defines a comprehensive testing strategy for the TypeScript types implementation (CV-002), ensuring robust validation of both compile-time and runtime type safety. The strategy covers baseline tests, unit testing patterns, integration testing, end-to-end scenarios, performance benchmarks, security validation, and continuous integration requirements.

### Test Architecture Layers

The testing strategy follows a multi-layered approach aligned with the existing codebase structure:

1. **Unit Tests**: Type guards, validators, utility functions, and schema alignment
2. **Integration Tests**: API contract validation, database schema alignment, service integration
3. **End-to-End Tests**: Complete versioning workflows, multi-site scenarios, user journeys
4. **Performance Tests**: Type system overhead, bundle size impact, runtime validation performance
5. **Security Tests**: Data isolation, permission enforcement, XSS/injection prevention

### Test Infrastructure Requirements

#### Existing Test Setup Analysis

**Backend Testing (Jest + PostgreSQL):**
- ✅ Jest configuration with TypeScript support
- ✅ PostgreSQL connection pooling mocks
- ✅ Transaction testing patterns established
- ✅ Service-layer testing methodology
- ✅ Existing VersionService.test.ts with 499 lines of comprehensive tests

**Frontend Testing (Vitest + Testing Library):**
- ✅ Vitest configuration with JSDOM environment
- ✅ React Testing Library setup
- ✅ MSW for API mocking
- ✅ Playwright for E2E testing
- ❌ **GAP**: No existing frontend tests - need to establish patterns

**Required Infrastructure Additions:**
- Type-level testing utilities for TypeScript compilation validation
- Enhanced test data factories for versioning scenarios
- Database schema validation testing
- Performance benchmarking tools
- Security testing utilities

---

## Baseline Test Requirements

### 1. Pre-Implementation Validation

**Critical Baseline Tests (Must Pass Before Implementation):**

```typescript
// Schema Alignment Validation
describe('Schema Baseline Validation', () => {
  test('existing versioning types compile without errors', () => {
    // Validates current versioning.ts compiles in strict mode
    expect(compile('backend/src/types/versioning.ts')).toHaveNoErrors();
  });

  test('database schema matches existing type definitions', () => {
    // Validates current content_versions table structure
    const schema = introspectDatabase('content_versions');
    expect(schema).toMatchTypeDefinition(ContentVersion);
  });

  test('existing VersionService maintains compatibility', () => {
    // Ensures current VersionService tests continue to pass
    // This is our regression safety net
  });
});

// API Contract Baseline
describe('API Contract Baseline', () => {
  test('existing version endpoints return type-compatible data', async () => {
    const response = await request(app).get('/api/versions/1');
    expect(response.body).toSatisfyType<ContentVersion>();
  });

  test('existing error responses follow standard format', async () => {
    const response = await request(app).get('/api/versions/999');
    expect(response.body).toSatisfyType<ServiceResponse<never>>();
  });
});
```

**Performance Baseline Measurements:**
- Current TypeScript compilation time: **Baseline Target < 10s**
- Current bundle size (types): **Baseline Target < 50KB**
- Current runtime validation overhead: **Baseline Target < 1ms**

### 2. Regression Prevention Strategy

**Automated Compatibility Checks:**
```typescript
// Type Compatibility Matrix
const TYPE_COMPATIBILITY_MATRIX = {
  'ContentVersion': ['v1.0', 'v1.1', 'v2.0'],
  'PreviewToken': ['v1.0', 'v2.0'],
  'VersionComment': ['v1.0', 'v1.1', 'v2.0']
};

describe('Type Backward Compatibility', () => {
  TYPE_COMPATIBILITY_MATRIX.forEach(([typeName, versions]) => {
    test(`${typeName} maintains backward compatibility`, () => {
      versions.forEach(version => {
        expect(isBackwardCompatible(typeName, version)).toBe(true);
      });
    });
  });
});
```

---

## Unit Test Specifications

### 1. Type Guard Testing Patterns

**Comprehensive Type Guard Validation:**

```typescript
// backend/src/__tests__/types/type-guards.test.ts
describe('Versioning Type Guards', () => {
  describe('isContentVersion', () => {
    test('validates correct ContentVersion objects', () => {
      const validVersion: ContentVersion = {
        id: 1,
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        version_type: VersionType.DRAFT,
        is_current_draft: true,
        is_current_published: false,
        title: 'Test',
        slug: 'test',
        content: 'Content',
        excerpt: null,
        data: null,
        meta_data: null,
        created_by: 1,
        created_at: new Date(),
        published_at: null,
        change_summary: null,
        diff_from_previous: null
      };

      expect(isContentVersion(validVersion)).toBe(true);
    });

    test('rejects objects with missing required fields', () => {
      const invalidVersion = {
        id: 1,
        content_type: ContentType.POST,
        // Missing site_id, content_id, version_number
      };

      expect(isContentVersion(invalidVersion)).toBe(false);
    });

    test('rejects objects with incorrect field types', () => {
      const invalidVersion = {
        id: '1', // Should be number
        site_id: 1,
        content_type: 'invalid_type', // Should be ContentType enum
        content_id: 1,
        version_number: 1,
      };

      expect(isContentVersion(invalidVersion)).toBe(false);
    });

    test('validates optional fields when present', () => {
      const versionWithOptionals = {
        // ... required fields ...
        excerpt: 'Test excerpt',
        data: { custom_field: 'value' },
        meta_data: { seo: { title: 'SEO Title' } }
      };

      expect(isContentVersion(versionWithOptionals)).toBe(true);
    });
  });

  // Similar comprehensive tests for isPreviewToken, isVersionComment
});
```

### 2. Performance Testing Requirements

**Type System Performance Benchmarks:**

```typescript
// scripts/performance/type-compilation-benchmark.ts
describe('TypeScript Compilation Performance', () => {
  test('versioning types compile within performance budget', async () => {
    const startTime = performance.now();

    const result = await compileTypeScript([
      'backend/src/types/versioning.ts',
      'backend/src/types/versioning/**.ts',
      'frontend/src/types/versioning/**.ts'
    ]);

    const endTime = performance.now();
    const compilationTime = endTime - startTime;

    expect(compilationTime).toBeLessThan(5000); // 5 second budget
    expect(result.errors).toHaveLength(0);
  });
});
```

---

## Integration Test Patterns

### 1. API Contract Validation

**Type-Safe API Testing:**

```typescript
// backend/src/__tests__/integration/api-contracts.test.ts
describe('Versioning API Contract Validation', () => {
  test('accepts valid CreateVersionInput and returns ContentVersion', async () => {
    const input: CreateVersionInput = {
      site_id: testSite.id,
      content_type: ContentType.POST,
      content_id: 1,
      title: 'Test Post',
      content: 'Test content',
      change_summary: 'Initial version'
    };

    const response = await request(app)
      .post('/api/versions')
      .send(input)
      .expect(201);

    // Type-safe response validation
    expect(response.body).toSatisfyType<ServiceResponse<ContentVersion>>();
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data!.site_id).toBe(testSite.id);
  });
});
```

---

## End-to-End Test Scenarios

### 1. Complete Versioning Workflows

**Multi-Site Content Versioning Journey:**

```typescript
// frontend/src/__tests__/e2e/versioning-workflows.spec.ts
test.describe('Content Versioning Workflows', () => {
  test('complete draft-to-published workflow with type safety', async () => {
    // Navigate to content creation
    await page.click('[data-testid=create-post]');
    await page.waitForURL('/admin/posts/new');

    // Create initial draft
    await page.fill('[data-testid=post-title]', 'E2E Test Post');
    await page.fill('[data-testid=post-content]', 'Initial draft content');
    await page.click('[data-testid=save-draft]');

    // Verify draft creation
    await expect(page.locator('[data-testid=draft-status]')).toContainText('Draft Saved');
    await expect(page.locator('[data-testid=version-number]')).toContainText('Version 1');

    // Publish the version
    await page.click('[data-testid=publish-button]');
    await page.click('[data-testid=confirm-publish]');

    // Verify published status
    await expect(page.locator('[data-testid=published-status]')).toContainText('Published');
  });
});
```

---

## Security Testing Scenarios

### 1. Data Isolation Security Tests

**Site Isolation Validation:**

```typescript
// backend/src/__tests__/security/data-isolation.test.ts
describe('Multi-Site Data Isolation Security', () => {
  test('prevents cross-site data access through direct queries', async () => {
    // Create version in Site A
    const versionA = await createTestVersion(db, { site_id: siteA.id });

    // User B should not be able to access Site A data
    const service = new VersionService(db);
    const contextB = { user_id: userB.id, allowed_sites: [siteB.id] };

    const result = await service.getVersionWithContext(versionA.id, contextB);
    expect(result.success).toBe(false);
    expect(result.error).toContain('access denied');
  });

  test('prevents SQL injection in version queries', async () => {
    const maliciousInputs = [
      "1; DROP TABLE content_versions; --",
      "1' OR '1'='1",
      "'; UPDATE users SET role='admin' WHERE id=1; --"
    ];

    const service = new VersionService(db);

    for (const maliciousInput of maliciousInputs) {
      await expect(() => service.getVersion(maliciousInput as any))
        .rejects.toThrow(/invalid input|type error|validation/i);
    }
  });
});
```

---

## Test Data Generation Strategies

### 1. Version-Specific Test Factories

**Comprehensive Test Data Factories:**

```typescript
// backend/src/__tests__/helpers/version-factories.ts
export class VersionTestFactory {
  async createTestVersion(options: VersionFactoryOptions = {}): Promise<ContentVersion> {
    const defaults = {
      site_id: 1,
      content_type: ContentType.POST,
      version_type: VersionType.DRAFT,
      jsonb_complexity: 'standard' as const
    };

    const config = { ...defaults, ...options };

    // Generate realistic test data with proper JSONB structure
    const data = this.generateJSONBData(config.jsonb_complexity);

    // Insert into database with proper constraints
    const result = await this.db.query(`
      INSERT INTO content_versions (
        site_id, content_type, content_id, version_number, version_type,
        title, slug, content, data, meta_data, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [/* parameters */]);

    return result.rows[0] as ContentVersion;
  }

  private generateJSONBData(complexity: 'minimal' | 'standard' | 'complex') {
    // Generate realistic JSONB data structures for testing
    const baseData = { category_id: 1, tags: ['test'] };

    if (complexity === 'standard') {
      return {
        ...baseData,
        seo: { meta_title: 'SEO Title', meta_description: 'SEO Description' },
        custom_fields: { featured: true, priority: 1 }
      };
    }

    return baseData;
  }
}
```

---

## CI/CD Integration Requirements

### 1. Automated Test Pipeline

**Quality Gates and Success Criteria:**

```yaml
# .github/workflows/type-safety-validation.yml
name: Type Safety Validation

on:
  pull_request:
    paths:
      - 'backend/src/types/**'
      - 'frontend/src/types/**'

jobs:
  type-compilation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: TypeScript compilation test
        run: |
          cd backend && time npx tsc --noEmit
          cd ../frontend && time npx tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: cms_test
        ports: [5432:5432]

    steps:
      - uses: actions/checkout@v4

      - name: Run backend type tests
        run: |
          cd backend
          npm test -- --testPathPattern="types|validation" --coverage
        env:
          DATABASE_URL: postgresql://postgres:test_password@localhost:5432/cms_test

      - name: Run frontend type tests
        run: |
          cd frontend
          npm test -- --run --coverage

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Bundle size analysis
        run: |
          cd frontend
          npm run build
          npx bundlephobia-cli dist/assets/*.js

      - name: TypeScript compilation benchmark
        run: |
          cd backend
          npm run test:performance -- --testPathPattern="compilation"
```

---

## Success Metrics and Acceptance Criteria

### Quantitative Success Metrics

**Type Safety Metrics:**
- [ ] **Zero TypeScript compilation errors** in strict mode across all versioning types
- [ ] **95%+ type coverage** - less than 5% `any` types in versioning modules
- [ ] **100% schema alignment** - all database tables match TypeScript interfaces exactly
- [ ] **100% API contract coverage** - all endpoints have corresponding request/response types

**Performance Metrics:**
- [ ] **Bundle size increase < 5%** from type definitions and validation utilities
- [ ] **TypeScript compilation time increase < 10%** compared to baseline
- [ ] **Runtime validation overhead < 2ms** per request for type checking operations
- [ ] **Database query performance maintained** - no regression in p95 latency

**Test Coverage Metrics:**
- [ ] **90%+ unit test coverage** for type guards, validators, and utility functions
- [ ] **80%+ integration test coverage** for API endpoints and service methods
- [ ] **100% E2E coverage** for critical versioning workflows (draft→publish, comparison, preview)
- [ ] **Zero security vulnerabilities** in type-related code (SAST scan results)

### Qualitative Success Criteria

**Developer Experience:**
- [ ] **New developers can create version-related components** without external documentation
- [ ] **IDE provides meaningful autocomplete** and inline documentation for all versioning types
- [ ] **Compilation catches 95%+ type-related errors** before runtime
- [ ] **Error messages are clear and actionable** for validation failures

**System Reliability:**
- [ ] **Multi-site data isolation is enforced** at the type level - impossible to accidentally access cross-site data
- [ ] **All JSONB fields have validated structures** with runtime type checking
- [ ] **Migration compatibility is maintained** - existing code continues to work
- [ ] **Performance targets are met** - p95 API latency ≤ 300ms maintained

This comprehensive testing strategy ensures that the TypeScript types implementation (CV-002) delivers robust type safety, excellent performance, and maintainable code while supporting the complex requirements of a multi-site content management system.