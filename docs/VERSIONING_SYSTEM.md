# Content Versioning System Documentation

## Overview

The Content Versioning System (implemented in CV-002) provides comprehensive type definitions and database schema for managing content versions, draft previews, and collaborative editing in a multi-site CMS environment.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Application                      │
├─────────────────────────────────────────────────────────────┤
│                    Versioning API Layer                       │
├─────────────────────────────────────────────────────────────┤
│                  TypeScript Type System                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │   Core   │   API    │ Security │ Performance│ WebSocket│  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     Database Layer                            │
│  ┌──────────────┬─────────────┬──────────────┬──────────┐  │
│  │content_versions│preview_tokens│version_comments│access_logs│  │
│  └──────────────┴─────────────┴──────────────┴──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Module Structure

```
backend/src/types/versioning/
├── core.ts          # Core interfaces (ContentVersion, PreviewToken, etc.)
├── enums.ts         # Type-safe enums and constants
├── api.ts           # API request/response types
├── security.ts      # Security and authentication types
├── performance.ts   # Performance optimization types
├── websocket.ts     # Real-time collaboration types
├── guards.ts        # Runtime type validation
└── index.ts         # Main exports
```

## Core Types

### ContentVersion

The central type representing a version of content (post or page):

```typescript
interface ContentVersion {
  id: number;
  site_id: number;        // Required for multi-site isolation
  locale: string;          // Localization support
  content_type: ContentType;
  content_id: number;
  version_number: number;
  version_type: VersionType;
  is_current_draft: boolean;
  is_current_published: boolean;
  title: string;
  slug: string | null;
  content: string | null;
  excerpt: string | null;
  data: ContentVersionData | null;  // Strongly-typed JSONB
  meta_data: ContentMetaData | null;
  created_by: number;
  created_at: Date;
  published_at: Date | null;
  change_summary: string | null;
  diff_from_previous: VersionDiff | null;
}
```

### PreviewToken

Secure preview token for sharing draft content:

```typescript
interface PreviewToken {
  id: number;
  site_id: number;
  version_id: number;
  token: string;          // Should be hashed in database
  token_type: TokenType;
  expires_at: Date;
  max_uses?: number;
  use_count: number;
  password_protected: boolean;
  ip_whitelist?: string[];
  require_auth: boolean;
  is_active: boolean;
}
```

### VersionComment

Collaborative commenting on versions:

```typescript
interface VersionComment {
  id: number;
  site_id: number;
  version_id: number;
  parent_id?: number;     // Threading support
  comment_text: string;
  comment_type: CommentType;
  line_number?: number;   // Inline comments
  field_path?: string;    // JSON path for structured content
  status: CommentStatus;
  created_by: number;
  created_at: Date;
}
```

## Database Schema

### Tables

1. **content_versions** - Stores all content versions
   - Unique constraint: (site_id, content_type, content_id, version_number)
   - Indexes for performance on site_id, content_type, created_at
   - JSONB indexes for flexible content queries

2. **preview_tokens** - Manages secure preview access
   - Token hashing for security
   - IP whitelisting support
   - Usage tracking and expiration

3. **version_comments** - Collaborative commenting
   - Threaded comments support
   - Inline commenting with line numbers
   - Status tracking (active, resolved, archived)

4. **preview_access_logs** - Audit trail for preview access
   - IP tracking
   - Success/failure logging
   - User agent recording

### Migration

The database migration (`003_content_versioning_with_site_support.sql`) includes:
- Complete table creation with constraints
- Performance-optimized indexes
- Helper functions for version management
- Data migration from existing posts/pages
- Trigger functions for consistency

## Type Safety Features

### Runtime Validation

Type guards provide runtime validation:

```typescript
// Validate content version at runtime
if (isContentVersion(data)) {
  // TypeScript knows data is ContentVersion here
  processVersion(data);
}

// Ensure site isolation
const query = ensureSiteIsolation(request, allowedSites);
```

### Input Sanitization

Built-in sanitization functions:

```typescript
// Sanitize HTML content
const safe = sanitizeHtml(userInput);

// Sanitize file paths
const safePath = sanitizeFilePath(uploadPath);

// Sanitize SQL identifiers
const safeColumn = sanitizeSqlIdentifier(columnName);
```

## Security Features

### Multi-Site Isolation

All types enforce site_id for data isolation:

```typescript
type SiteScopedQuery<T> = T & {
  site_id: number;  // Required field
  __site_isolation_enforced: true;
};
```

### Token Security

- Tokens must be hashed before storage
- Support for password-protected previews
- IP whitelisting capabilities
- Rate limiting configuration

### Audit Logging

Comprehensive audit trail types:

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  user_id?: number;
  site_id: number;
  action: AuditAction;
  resource_type: string;
  resource_id?: string | number;
  changes?: AuditChanges;
  result: 'success' | 'failure' | 'partial';
  security_context?: SecurityContext;
  compliance_tags?: ComplianceTag[];
}
```

## Performance Optimizations

### Caching Strategy

Multi-layer cache configuration:

```typescript
interface CacheLayerConfig {
  memory_cache: {
    max_size_mb: number;
    ttl_seconds: number;
    eviction_policy: 'lru' | 'lfu' | 'ttl';
  };
  redis_cache: {
    ttl_seconds: number;
    compression: boolean;
  };
  cdn_cache: {
    ttl_seconds: number;
    edge_locations: string[];
  };
}
```

### Cursor Pagination

For efficient large dataset handling:

```typescript
interface CursorPaginatedResponse<T> {
  items: T[];
  page_info: {
    has_next_page: boolean;
    has_previous_page: boolean;
    start_cursor: string;
    end_cursor: string;
  };
  query_time_ms: number;
  cache_hit: boolean;
}
```

## Real-time Collaboration

### WebSocket Events

Support for real-time updates:

```typescript
interface WebSocketEvents {
  'version:created': VersionCreatedEvent;
  'version:updated': VersionUpdatedEvent;
  'version:published': VersionPublishedEvent;
  'comment:added': CommentAddedEvent;
  'user:typing': UserTypingEvent;
  'user:cursor': UserCursorEvent;
}
```

### Collaborative Features

- Real-time version updates
- Live commenting
- User presence indicators
- Cursor position sharing
- Typing indicators

## API Integration

### Version Management

```typescript
// Create new version
POST /api/versions
CreateVersionRequest => CreateVersionResponse

// Publish version
PUT /api/versions/:id/publish
PublishVersionRequest => PublishVersionResponse

// Compare versions
GET /api/versions/compare
CompareVersionsRequest => CompareVersionsResponse
```

### Preview Management

```typescript
// Create preview token
POST /api/preview-tokens
CreatePreviewTokenRequest => CreatePreviewTokenResponse

// Validate preview
GET /api/preview/:token
PreviewTokenValidationRequest => PreviewTokenValidationResponse
```

## Testing

### Unit Tests

Comprehensive test coverage for type guards:
- 39 tests covering all validation functions
- Input sanitization testing
- Type narrowing validation
- Batch validation helpers

### Test Patterns

```typescript
describe('Type Guards', () => {
  it('should validate ContentVersion', () => {
    const valid: ContentVersion = { /* ... */ };
    expect(isContentVersion(valid)).toBe(true);
  });

  it('should enforce site isolation', () => {
    const query = { site_id: 1, data: 'test' };
    const result = ensureSiteIsolation(query, [1, 2, 3]);
    expect(result.site_id).toBe(1);
  });
});
```

## Common Usage Patterns

### Creating a Version

```typescript
const createVersion = async (input: CreateVersionInput): Promise<ContentVersion> => {
  // Validate input
  if (!validateRequiredFields(input, ['title', 'content_type'])) {
    throw new Error('Missing required fields');
  }

  // Ensure site context
  const siteScoped = ensureSiteIsolation(input, allowedSites);

  // Create version
  const response = await api.post<CreateVersionResponse>('/api/versions', {
    site_id: siteScoped.site_id,
    content_type: input.content_type,
    content_id: input.content_id,
    version_data: input
  });

  return response.data.version;
};
```

### Generating Preview Token

```typescript
const generatePreview = async (versionId: number): Promise<string> => {
  const response = await api.post<CreatePreviewTokenResponse>('/api/preview-tokens', {
    version_id: versionId,
    expires_in_hours: 24,
    max_uses: 10,
    require_auth: false
  });

  return response.data.preview_url;
};
```

## Migration Guide

### From Legacy Content System

1. Run database migration to create versioning tables
2. Existing posts/pages are automatically migrated
3. Update API calls to use versioning endpoints
4. Replace content types with ContentVersion interface

### TypeScript Integration

```typescript
// Before
interface Post {
  id: number;
  title: string;
  content: string;
}

// After
import { ContentVersion } from '@/types/versioning';

const post: ContentVersion = {
  // ... version properties
};
```

## Best Practices

1. **Always include site_id** in queries for multi-tenant isolation
2. **Hash tokens** before storing in database
3. **Use type guards** for runtime validation
4. **Implement caching** for frequently accessed versions
5. **Enable audit logging** for compliance
6. **Sanitize user input** before processing
7. **Use cursor pagination** for large datasets
8. **Implement optimistic UI** with WebSocket updates

## Troubleshooting

### Common Issues

1. **TypeScript compilation errors**
   - Ensure strict mode is enabled in tsconfig.json
   - Import types from '@/types/versioning'

2. **Site isolation errors**
   - Always provide site_id in queries
   - Use ensureSiteIsolation helper

3. **Token validation failures**
   - Check token expiration
   - Verify IP whitelist settings
   - Ensure token is properly hashed

4. **Performance issues**
   - Implement caching strategies
   - Use cursor pagination for large lists
   - Enable database query optimization

## Future Enhancements

- [ ] GraphQL type generation
- [ ] Automatic API client generation
- [ ] Version branching and merging
- [ ] Advanced diff visualization
- [ ] Machine learning-powered content suggestions
- [ ] Blockchain-based version verification

## Related Documentation

- [EPIC-001 Content Versioning Epic](./tickets/EPIC-001_content_versioning_draft_preview_system.md)
- [CV-001 Database Schema](./tickets/EPIC-001_CV-001_version_storage_database_schema.md)
- [CV-002 Type Definitions](./tickets/EPIC-001_CV-002_version_data_models_types.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Design Patterns](./PATTERNS.md)