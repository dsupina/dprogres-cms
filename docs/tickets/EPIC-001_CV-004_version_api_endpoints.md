# CV-004: Version API Endpoints

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** High
**Status:** TODO

## User Story
As a **frontend developer**, I need RESTful API endpoints for all version operations, so that I can build UI components that interact with the versioning system.

## Background
The frontend needs a comprehensive API to manage versions, including creating drafts, publishing content, viewing history, and generating previews. These endpoints must be secure, performant, and well-documented.

## Requirements

### Functional Requirements
- List all versions for a content item
- Create new versions (draft/auto-save)
- Update existing draft versions
- Publish drafts to live
- Revert to previous versions
- Delete unwanted versions
- Compare two versions
- Generate preview links

### Technical Requirements
- RESTful design principles
- Proper HTTP status codes
- Request validation with Joi
- Authentication/authorization
- Rate limiting
- CORS support
- Pagination for lists
- Consistent error responses

## Acceptance Criteria
- [ ] All endpoints follow RESTful conventions
- [ ] Authentication required for all endpoints
- [ ] Proper authorization checks (can't edit others' drafts)
- [ ] Input validation prevents invalid data
- [ ] Pagination works for version lists
- [ ] Rate limiting prevents abuse
- [ ] API returns consistent error format
- [ ] OpenAPI/Swagger documentation generated
- [ ] Integration tests cover all endpoints

## Implementation Details

### Endpoints

**Version Management (Site-scoped for Multi-tenant Architecture)**
```
GET    /api/sites/:siteId/content/:contentType/:contentId/versions
       List all versions (paginated with cursor support)
       Query params: page, limit, status, author, type, include_auto_saves

POST   /api/sites/:siteId/content/:contentType/:contentId/versions
       Create new version
       Body: version data
       Query params: type=draft|auto_save

GET    /api/sites/:siteId/versions/:versionId
       Get specific version details

PUT    /api/sites/:siteId/versions/:versionId
       Update draft version (with conflict detection)
       Body: partial update data

DELETE /api/sites/:siteId/versions/:versionId
       Delete version (soft or hard)
```

**Version Operations**
```
POST   /api/sites/:siteId/versions/:versionId/publish
       Publish draft to live

POST   /api/sites/:siteId/versions/:versionId/revert
       Create new draft from this version

POST   /api/sites/:siteId/versions/:versionId/archive
       Archive version

GET    /api/sites/:siteId/versions/:versionId/diff
       Compare with another version
       Query params: compareWith

GET    /api/sites/:siteId/versions/:versionId/status
       Get version processing status (for async operations)

GET    /api/sites/:siteId/versions/:versionId/dependencies
       Check content dependencies affected by changes
```

**Bulk Operations (Enhanced DX)**
```
POST   /api/sites/:siteId/versions/bulk
       Perform bulk operations on versions
       Body: { operation: "publish|archive|delete", version_ids: [], options: {} }
```

**Search & Discovery**
```
GET    /api/sites/:siteId/versions/search
       Search versions with advanced filters
       Query params: q, author, status, content_type, date_range

GET    /api/sites/:siteId/content/:contentType/:contentId/versions/latest
       Get latest version by type
       Query params: type=draft|published|auto_save
```

**Quick Actions (Developer Convenience)**
```
POST   /api/sites/:siteId/versions/:versionId/quick-actions
       Perform common operations
       Body: { action: "duplicate|schedule|convert_to_template", params: {} }
```

### Response Formats

**Success Response**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-26T10:00:00Z",
    "version": "1.0"
  }
}
```

**Error Response**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Version not found",
    "details": { ... }
  }
}
```

### Validation Schemas
- Content type validation
- Version data validation
- Query parameter validation
- Publishing permission checks

## Testing Considerations
- Unit tests for validation
- Integration tests for full flow
- Authorization testing
- Rate limit testing
- Error scenario coverage

## Documentation Requirements
- OpenAPI specification
- Example requests/responses
- Error code reference
- Rate limit documentation
- Authentication guide

## Dependencies
- CV-003: Version service
- Authentication middleware
- Validation library (Joi)
- Rate limiting middleware

## Security Requirements

### Critical Security Controls

**Authentication & Authorization**
- All endpoints MUST require JWT authentication (no anonymous access)
- Implement role-based permissions:
  - Authors can only edit their own drafts
  - Editors can edit any draft but cannot publish
  - Admins have full access including publish/delete
- Version ownership validation before updates/deletes
- Cross-site content access prevention

**Multi-site Data Isolation**
- Enforce site_id validation on every request
- Verify user has permission for the requested site
- Prevent data leakage between sites in all queries
- Include site_id in all database WHERE clauses

**Input Validation & Sanitization**
- Sanitize all HTML content with DOMPurify
- Validate content_type against allowed values (post, page, etc.)
- Enforce field length limits (title: 255 chars, slug: 200 chars)
- Reject requests with invalid version_type values
- Validate pagination parameters (max limit: 100)

**Rate Limiting**
- POST /api/versions: 30 requests per minute per user
- POST /api/autosave: 60 requests per minute (higher for auto-save)
- GET endpoints: 100 requests per minute
- Publish/revert operations: 10 requests per minute

**Preview Token Security**
- Generate cryptographically secure preview tokens (32+ bytes)
- Include expiration timestamp in token (default: 24 hours)
- Validate token signature to prevent tampering
- Bind tokens to specific version + user + site
- Log all preview token usage for audit

**Audit Logging**
- Log all state-changing operations (create, update, publish, delete)
- Include: user_id, site_id, IP address, user agent, timestamp
- Log failed authorization attempts
- Store audit logs in separate table with retention policy
- Never log sensitive content data in audit logs

**GDPR/CCPA Compliance**
- Implement soft delete for published versions (retain for 30 days)
- Provide version history export endpoint for data portability
- Support permanent deletion after soft delete period
- Anonymize user data in versions upon account deletion
- Include data classification in version metadata

**Additional Security Measures**
- Implement CSRF protection on all mutating endpoints
- Set security headers (X-Content-Type-Options, X-Frame-Options)
- Use parameterized queries exclusively (no string concatenation)
- Implement request size limits (max 10MB for content field)
- Version conflict detection for concurrent edits
- Encrypt sensitive metadata at rest

### Implementation Priority
1. **BLOCKER**: Authentication/authorization on all endpoints
2. **BLOCKER**: Multi-site isolation enforcement
3. **HIGH**: Input sanitization and validation
4. **HIGH**: Audit logging for compliance
5. **MEDIUM**: Rate limiting implementation
6. **MEDIUM**: Preview token security
7. **LOW**: GDPR export endpoints

## Product Experience Specification

### Key User Personas

**Primary: Frontend Developers**
- Building content editing interfaces with React Query
- Need predictable API patterns for state management
- Require clear error handling for user feedback
- Want optimistic updates for responsive UX

**Secondary: Content Authors (via Frontend)**
- Editing content with auto-save and draft management
- Collaborating with real-time conflict resolution
- Publishing content with confidence and rollback options
- Viewing version history and comparisons

### Core User Flows

#### 1. Content Creation & Editing Flow

**Happy Path: Draft Creation → Auto-save → Publish**
```typescript
// 1. Create new draft version
const createDraft = useMutation({
  mutationFn: (data) => versionsApi.create(siteId, contentType, contentId, data),
  onSuccess: (version) => {
    // Immediate feedback with optimistic UI
    queryClient.setQueryData(['versions', siteId, contentId], (old) =>
      [version, ...old]
    );
    // Enable auto-save timer
    startAutoSave(version.id);
  }
});

// 2. Auto-save during editing (background)
const autoSave = useMutation({
  mutationFn: (changes) => versionsApi.update(siteId, versionId, changes),
  onSuccess: () => {
    // Silent success indicator
    showToast('Changes saved', { type: 'success', duration: 2000 });
  },
  onError: (error) => {
    // Non-blocking error handling
    if (error.code === 'CONFLICT') {
      showConflictDialog(error.details);
    }
  }
});

// 3. Publish when ready
const publish = useMutation({
  mutationFn: () => versionsApi.publish(siteId, versionId),
  onSuccess: () => {
    // Clear draft state, update published version
    queryClient.invalidateQueries(['content', siteId, contentId, 'published']);
    router.push(`/admin/content/${contentId}?published=true`);
  }
});
```

**Edge Cases Handled:**
- Network interruption during auto-save → Queue changes, retry with exponential backoff
- Concurrent editing conflicts → Show merge dialog with visual diff
- Permission changes mid-edit → Graceful degradation to read-only mode
- Large content size → Progress indicators for save/publish operations

#### 2. Version History & Comparison Flow

**Exploration Pattern:**
```typescript
// Paginated version list with smart loading
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['versions', siteId, contentId],
  queryFn: ({ pageParam }) => versionsApi.list(siteId, contentId, {
    cursor: pageParam,
    limit: 20,
    include_auto_saves: false // Default filter for clean history
  }),
  getNextPageParam: (lastPage) => lastPage.meta.next_cursor,
});

// On-demand diff comparison
const { data: diff, isLoading } = useQuery({
  queryKey: ['diff', siteId, versionA.id, versionB.id],
  queryFn: () => versionsApi.getDiff(siteId, versionA.id, { compareWith: versionB.id }),
  enabled: !!selectedVersions.length === 2,
  staleTime: 5 * 60 * 1000 // 5 minutes - diffs are immutable
});
```

**UX Considerations:**
- Visual timeline with branching for published/draft versions
- Inline diff viewer with syntax highlighting
- Keyboard shortcuts for version navigation (j/k, enter to view)
- Bulk operations with progress feedback

#### 3. Real-time Collaboration Flow

**WebSocket Integration:**
```typescript
// Subscribe to version events for real-time updates
useEffect(() => {
  const unsubscribe = websocketClient.subscribe(
    `versions:${siteId}:${contentId}`,
    (event) => {
      switch (event.type) {
        case 'version:updated':
          // Another user saved changes
          queryClient.setQueryData(['version', siteId, event.versionId], event.data);
          showToast(`${event.user.name} made changes`, { action: 'View' });
          break;
        case 'version:conflict':
          // Concurrent edit detected
          setConflictState(event.conflictData);
          break;
        case 'version:published':
          // Content went live
          queryClient.invalidateQueries(['content', siteId, contentId]);
          showToast('Content published successfully', { type: 'success' });
          break;
      }
    }
  );
  return unsubscribe;
}, [siteId, contentId]);
```

### API Usage Patterns for React Query

#### 1. Optimistic Updates Pattern

```typescript
const updateVersion = useMutation({
  mutationFn: versionsApi.update,
  onMutate: async (variables) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['version', siteId, versionId]);

    // Snapshot previous value
    const previousVersion = queryClient.getQueryData(['version', siteId, versionId]);

    // Optimistically update
    queryClient.setQueryData(['version', siteId, versionId], (old) => ({
      ...old,
      ...variables.changes,
      updated_at: new Date().toISOString()
    }));

    return { previousVersion };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['version', siteId, versionId], context.previousVersion);
    showErrorToast('Failed to save changes', { action: 'Retry' });
  },
  onSettled: () => {
    // Always refetch after error or success
    queryClient.invalidateQueries(['version', siteId, versionId]);
  }
});
```

#### 2. Smart Caching Strategy

```typescript
// Aggressive caching for immutable data
const getVersion = useQuery({
  queryKey: ['version', siteId, versionId],
  queryFn: () => versionsApi.get(siteId, versionId),
  staleTime: version.status === 'published' ? Infinity : 30 * 1000,
  cacheTime: 10 * 60 * 1000, // 10 minutes
});

// Background refetch for draft versions
const { data: latestDraft } = useQuery({
  queryKey: ['latest-draft', siteId, contentId],
  queryFn: () => versionsApi.getLatest(siteId, contentId, { type: 'draft' }),
  refetchInterval: 30 * 1000, // 30 seconds for drafts
  refetchIntervalInBackground: true,
});
```

### Error Handling & Recovery Flows

#### 1. Network Error Recovery

```typescript
const retryConfig = {
  retry: (failureCount, error) => {
    // Don't retry validation errors
    if (error.status >= 400 && error.status < 500) return false;
    // Exponential backoff for network errors
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

// Auto-save with offline support
const autoSaveWithRetry = useMutation({
  ...retryConfig,
  mutationFn: versionsApi.update,
  onError: (error, variables, context) => {
    if (!navigator.onLine) {
      // Queue for when online
      offlineQueue.add('update', variables);
      showToast('Changes queued - will save when online', { type: 'info' });
    }
  }
});
```

#### 2. Conflict Resolution UX

```typescript
const ConflictResolutionDialog = ({ conflict, onResolve }) => {
  const [selectedChanges, setSelectedChanges] = useState([]);

  return (
    <Dialog>
      <DialogHeader>
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        Editing Conflict Detected
      </DialogHeader>
      <DialogContent>
        <p>Another user modified this content while you were editing.</p>

        {/* Visual diff with selectable changes */}
        <DiffViewer
          original={conflict.serverVersion}
          modified={conflict.localVersion}
          onSelectChange={(change) => toggleChange(change)}
        />

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => onResolve('discard')}>
            Discard My Changes
          </Button>
          <Button variant="outline" onClick={() => onResolve('merge')}>
            Keep Both (Manual Merge)
          </Button>
          <Button onClick={() => onResolve('overwrite')}>
            Overwrite Server Version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

### Performance Expectations & Loading States

#### 1. Progressive Loading Strategy

```typescript
// Immediate response for critical UI state
const { data: versionSummary, isLoading: isSummaryLoading } = useQuery({
  queryKey: ['version-summary', siteId, versionId],
  queryFn: () => versionsApi.getSummary(siteId, versionId), // Lightweight endpoint
  staleTime: 5 * 60 * 1000,
});

// Lazy load full content when needed
const { data: fullVersion, isLoading: isContentLoading } = useQuery({
  queryKey: ['version-full', siteId, versionId],
  queryFn: () => versionsApi.get(siteId, versionId),
  enabled: !!showFullContent, // Only when user expands
});
```

#### 2. Loading State Patterns

```typescript
const LoadingStates = {
  // Skeleton for version list
  VersionListSkeleton: () => (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  ),

  // Inline saving indicator
  SavingIndicator: ({ isAutoSaving }) => (
    <div className="flex items-center text-sm text-muted-foreground">
      {isAutoSaving ? (
        <>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Check className="mr-1 h-3 w-3 text-green-500" />
          Saved
        </>
      )}
    </div>
  ),
};
```

### API Discoverability & Self-Documentation

#### 1. TypeScript-First API Design

```typescript
// Exported API client with full type safety
export interface VersionsApiClient {
  list(siteId: string, contentId: string, options?: VersionListOptions): Promise<VersionListResponse>;
  create(siteId: string, contentType: string, contentId: string, data: CreateVersionRequest): Promise<ContentVersion>;
  get(siteId: string, versionId: string): Promise<ContentVersion>;
  update(siteId: string, versionId: string, changes: Partial<ContentVersion>): Promise<ContentVersion>;
  publish(siteId: string, versionId: string): Promise<PublishResult>;
  revert(siteId: string, versionId: string): Promise<ContentVersion>;
  getDiff(siteId: string, versionId: string, options: DiffOptions): Promise<VersionDiff>;
  // ... more methods
}

// Rich response types with metadata
export interface VersionListResponse {
  data: ContentVersion[];
  meta: {
    total: number;
    has_next: boolean;
    next_cursor?: string;
    performance_hints: {
      cached: boolean;
      query_time_ms: number;
    };
  };
}
```

#### 2. Development Experience Helpers

```typescript
// API explorer hook for development
export const useApiExplorer = (endpoint: string) => {
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = async (params: any) => {
    setIsLoading(true);
    try {
      const result = await fetch(`/api/debug/explore/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(params),
        headers: { 'Content-Type': 'application/json' }
      });
      setResponse(await result.json());
    } finally {
      setIsLoading(false);
    }
  };

  return { response, isLoading, execute };
};

// Runtime API documentation
export const getApiDocumentation = () => ({
  versions: {
    list: {
      description: 'Retrieve paginated list of versions for content',
      parameters: {
        siteId: { required: true, type: 'string', description: 'Site identifier' },
        contentId: { required: true, type: 'string', description: 'Content identifier' },
        include_auto_saves: { required: false, type: 'boolean', default: false }
      },
      example_response: { /* ... */ },
      rate_limits: { requests_per_minute: 100 }
    }
    // ... other endpoints
  }
});
```

### Multi-Site Context & Developer Experience

#### 1. Site-Aware API Client

```typescript
// Automatically inject site context
export const createSiteAwareApiClient = (siteId: string) => ({
  versions: {
    list: (contentId: string, options?: VersionListOptions) =>
      versionsApi.list(siteId, contentId, options),
    create: (contentType: string, contentId: string, data: CreateVersionRequest) =>
      versionsApi.create(siteId, contentType, contentId, data),
    // ... other methods with siteId pre-filled
  }
});

// React context for current site
export const SiteContext = createContext<{ siteId: string; siteName: string }>();

export const useSiteAwareApi = () => {
  const { siteId } = useContext(SiteContext);
  return useMemo(() => createSiteAwareApiClient(siteId), [siteId]);
};
```

#### 2. Cross-Site Operations

```typescript
// Bulk operations across sites (admin only)
const useCrossSiteVersions = () => {
  return useQuery({
    queryKey: ['cross-site-versions'],
    queryFn: async () => {
      const sites = await sitesApi.list();
      const versionPromises = sites.map(site =>
        versionsApi.list(site.id, 'all', { status: 'draft', limit: 5 })
      );
      return Promise.all(versionPromises);
    },
    enabled: user.role === 'admin'
  });
};
```

## Technical Architecture Specification

### System Integration Overview

The Version API endpoints integrate with the existing CV-003 VersionService implementation, leveraging the multi-site content versioning system. The architecture follows the established patterns from the Express backend with enhanced security, performance optimization, and real-time collaboration features.

#### Core Architecture Components

1. **Express Route Structure** (`backend/src/routes/versions.ts`)
2. **Middleware Pipeline** (auth → site validation → rate limiting → input validation)
3. **Service Layer Integration** (CV-003 VersionService)
4. **Caching Layer** (Redis-based content and metadata caching)
5. **WebSocket Event System** (real-time collaboration notifications)
6. **Response Transformation** (consistent API response formatting)

### 1. Express Route Architecture

#### File Structure
```
backend/src/routes/
├── versions.ts              # Main version API routes
├── versionOperations.ts     # Version operations (publish, revert, etc.)
├── versionSearch.ts         # Search and discovery endpoints
└── versionBulk.ts          # Bulk operations endpoints

backend/src/middleware/
├── versionAuth.ts          # Version-specific authorization
├── versionValidation.ts    # Joi schemas for version endpoints
├── versionCache.ts         # Version-specific caching middleware
└── versionRateLimit.ts     # Version-specific rate limiting

backend/src/services/
├── VersionService.ts       # Existing CV-003 service (enhanced)
├── VersionCacheService.ts  # Redis caching for versions
└── VersionWebSocketService.ts # Real-time event broadcasting

backend/src/types/
└── versioning/             # Existing CV-003 types (enhanced for API)
    ├── api.ts              # API-specific request/response types
    └── websocket.ts        # WebSocket event types
```

#### Route Organization Strategy

**Primary Routes** (`/api/sites/:siteId/content/:contentType/:contentId/versions`)
- Follow REST conventions with site-scoped URLs
- Inherit site validation from existing `siteResolver.ts` middleware
- Use content-type validation for `post` and `page` types

**Secondary Routes** (`/api/sites/:siteId/versions/:versionId`)
- Direct version access for operations
- Version ownership validation before operations
- Support for cross-content-type operations

#### Middleware Pipeline Architecture

```typescript
// Standard pipeline for all version endpoints
app.use('/api/sites/:siteId/versions', [
  authenticateToken,           // JWT authentication
  resolveSiteContext,         // Site validation and context injection
  versionRateLimit,           // Version-specific rate limiting
  versionAuth,                // Version ownership/permission validation
  versionCacheMiddleware,     // Cache-first response strategy
  validate(versionSchemas),   // Joi input validation
  // Route handlers
]);
```

### 2. Database Query Optimization

#### Query Patterns and Indexes

**Existing Optimized Indexes** (from CV-002 migration):
```sql
-- Multi-site content lookups
idx_content_versions_site_content(site_id, content_type, content_id, version_number DESC)

-- Current version queries
idx_content_versions_site_current_draft(site_id, content_id, is_current_draft) WHERE is_current_draft = TRUE
idx_content_versions_site_current_published(site_id, content_id, is_current_published) WHERE is_current_published = TRUE

-- JSONB search optimization
idx_content_versions_data_gin USING GIN (data jsonb_path_ops)
idx_content_versions_meta_data_gin USING GIN (meta_data jsonb_path_ops)
```

**Additional Indexes Required**:
```sql
-- Pagination and listing optimization
CREATE INDEX idx_content_versions_site_paginated
ON content_versions(site_id, created_at DESC, id)
WHERE version_type != 'auto_save';

-- Search by author and status
CREATE INDEX idx_content_versions_site_author_status
ON content_versions(site_id, created_by, version_type, created_at DESC);

-- Performance monitoring
CREATE INDEX idx_content_versions_performance
ON content_versions(site_id, content_type, created_at DESC)
WHERE version_type IN ('draft', 'published');
```

#### Query Optimization Strategies

**1. Cursor-Based Pagination**
```typescript
// Optimized pagination using cursor (ID + timestamp)
const getVersions = async (siteId: number, contentId: number, cursor?: string, limit = 20) => {
  const whereClause = cursor
    ? 'AND (created_at, id) < (SELECT created_at, id FROM content_versions WHERE id = $4)'
    : '';

  return pool.query(`
    SELECT v.*, u.first_name, u.last_name
    FROM content_versions v
    JOIN users u ON v.created_by = u.id
    WHERE v.site_id = $1 AND v.content_id = $2 ${whereClause}
    ORDER BY v.created_at DESC, v.id DESC
    LIMIT $3
  `, cursor ? [siteId, contentId, limit, cursor] : [siteId, contentId, limit]);
};
```

**2. Bulk Operations Optimization**
```typescript
// Batch version operations with single transaction
const bulkPublishVersions = async (siteId: number, versionIds: number[]) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validate all versions belong to site
    const validation = await client.query(`
      SELECT COUNT(*) as count
      FROM content_versions
      WHERE id = ANY($1) AND site_id = $2
    `, [versionIds, siteId]);

    if (validation.rows[0].count !== versionIds.length) {
      throw new Error('Invalid version IDs for site');
    }

    // Batch publish using array operations
    await client.query(`
      UPDATE content_versions
      SET version_type = 'published', published_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1)
    `, [versionIds]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

### 3. Redis Caching Architecture

#### Cache Key Strategy
```typescript
// Hierarchical cache keys for efficient invalidation
const CACHE_KEYS = {
  VERSION: (siteId: number, versionId: number) => `site:${siteId}:version:${versionId}`,
  VERSION_LIST: (siteId: number, contentId: number) => `site:${siteId}:content:${contentId}:versions`,
  VERSION_DIFF: (versionA: number, versionB: number) => `diff:${Math.min(versionA, versionB)}:${Math.max(versionA, versionB)}`,
  VERSION_SEARCH: (siteId: number, query: string) => `site:${siteId}:search:${btoa(query)}`,
  SITE_METRICS: (siteId: number) => `site:${siteId}:version:metrics`
};

// TTL Configuration
const CACHE_TTL = {
  VERSION: 60 * 5,        // 5 minutes for individual versions
  VERSION_LIST: 60 * 2,   // 2 minutes for version lists
  VERSION_DIFF: 60 * 30,  // 30 minutes for diffs (immutable)
  SEARCH: 60 * 10,        // 10 minutes for search results
  METRICS: 60 * 15        // 15 minutes for metrics
};
```

#### Cache-First Middleware
```typescript
export const versionCacheMiddleware = (ttl: number = CACHE_TTL.VERSION) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = generateCacheKey(req);

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        return res.json({
          success: true,
          data,
          meta: {
            cached: true,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      // Cache miss or error - continue to handler
    }

    // Intercept response to cache result
    const originalSend = res.json;
    res.json = function(data) {
      if (data.success && data.data) {
        redisClient.setex(cacheKey, ttl, JSON.stringify(data.data));
      }
      return originalSend.call(this, data);
    };

    next();
  };
};
```

#### Smart Cache Invalidation
```typescript
export class VersionCacheService {
  async invalidateVersionCache(siteId: number, contentId: number, versionId?: number) {
    const patterns = [
      CACHE_KEYS.VERSION_LIST(siteId, contentId),
      CACHE_KEYS.SITE_METRICS(siteId),
      `site:${siteId}:search:*`
    ];

    if (versionId) {
      patterns.push(CACHE_KEYS.VERSION(siteId, versionId));
      patterns.push(`diff:*:${versionId}`, `diff:${versionId}:*`);
    }

    // Use Redis SCAN for pattern matching
    for (const pattern of patterns) {
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }
}
```

### 4. WebSocket Event Broadcasting

#### Event Architecture
```typescript
// WebSocket event types for real-time collaboration
interface VersionEvent {
  type: 'version:created' | 'version:updated' | 'version:published' | 'version:conflict';
  siteId: number;
  contentId: number;
  versionId: number;
  userId: number;
  timestamp: string;
  data: any;
}

// Room-based subscriptions for efficient broadcasting
class VersionWebSocketService extends EventEmitter {
  private rooms = new Map<string, Set<string>>(); // roomId -> socketIds

  subscribeToContent(socketId: string, siteId: number, contentId: number) {
    const roomId = `site:${siteId}:content:${contentId}`;
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(socketId);
  }

  broadcastVersionEvent(event: VersionEvent) {
    const roomId = `site:${event.siteId}:content:${event.contentId}`;
    const sockets = this.rooms.get(roomId);

    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit('version:event', event);
      });
    }
  }
}
```

#### Conflict Detection System
```typescript
// Real-time conflict detection for concurrent editing
export const detectVersionConflicts = async (
  siteId: number,
  versionId: number,
  changes: Partial<ContentVersion>
) => {
  const currentVersion = await versionService.getVersion(siteId, versionId);

  if (!currentVersion.success) {
    throw new Error('Version not found');
  }

  const lastModified = new Date(currentVersion.data.updated_at);
  const clientLastModified = new Date(changes.updated_at || 0);

  if (lastModified > clientLastModified) {
    return {
      hasConflict: true,
      serverVersion: currentVersion.data,
      conflictFields: detectFieldConflicts(currentVersion.data, changes)
    };
  }

  return { hasConflict: false };
};
```

### 5. Input Validation & Error Handling

#### Joi Validation Schemas
```typescript
// Version-specific validation schemas
export const versionValidationSchemas = {
  createVersion: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    content: Joi.string().allow('').max(10485760), // 10MB limit
    excerpt: Joi.string().max(1000).allow(''),
    data: Joi.object().unknown(true),
    meta_data: Joi.object().unknown(true),
    version_type: Joi.string().valid('draft', 'auto_save').default('draft'),
    change_summary: Joi.string().max(500).allow('')
  }),

  updateVersion: Joi.object({
    title: Joi.string().min(1).max(255),
    content: Joi.string().allow('').max(10485760),
    excerpt: Joi.string().max(1000).allow(''),
    data: Joi.object().unknown(true),
    meta_data: Joi.object().unknown(true),
    change_summary: Joi.string().max(500).allow(''),
    updated_at: Joi.date().iso() // For conflict detection
  }).min(1),

  bulkOperation: Joi.object({
    operation: Joi.string().valid('publish', 'archive', 'delete').required(),
    version_ids: Joi.array().items(Joi.number().positive()).min(1).max(50).required(),
    options: Joi.object().unknown(true).default({})
  })
};
```

#### Error Response Standardization
```typescript
// Consistent error response format
export const formatApiError = (error: any): ApiErrorResponse => {
  const errorMap: Record<string, { code: string; status: number }> = {
    'VERSION_NOT_FOUND': { code: 'VERSION_NOT_FOUND', status: 404 },
    'INSUFFICIENT_PERMISSIONS': { code: 'FORBIDDEN', status: 403 },
    'VALIDATION_ERROR': { code: 'VALIDATION_ERROR', status: 400 },
    'VERSION_CONFLICT': { code: 'CONFLICT', status: 409 },
    'RATE_LIMIT_EXCEEDED': { code: 'RATE_LIMIT_EXCEEDED', status: 429 }
  };

  const errorInfo = errorMap[error.code] || { code: 'INTERNAL_ERROR', status: 500 };

  return {
    success: false,
    error: {
      code: errorInfo.code,
      message: error.message || 'An error occurred',
      details: error.details || {},
      timestamp: new Date().toISOString()
    }
  };
};
```

### 6. Performance Monitoring

#### Request/Response Timing
```typescript
// Performance monitoring middleware
export const performanceMonitoring = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { method, path } = req;
    const { statusCode } = res;

    // Log performance metrics
    logger.info('API Request', {
      method,
      path,
      statusCode,
      duration,
      siteId: req.params.siteId,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    // Send metrics to monitoring system
    metrics.histogram('api_request_duration', duration, {
      method,
      endpoint: path,
      status_code: statusCode.toString()
    });
  });

  next();
};
```

### 7. Security Implementation

#### Multi-Site Data Isolation
```typescript
// Site-scoped authorization middleware
export const versionAuth = async (req: Request, res: Response, next: NextFunction) => {
  const { siteId, versionId } = req.params;
  const userId = req.user?.id;

  // Validate site access
  const siteAccess = await checkSiteAccess(parseInt(siteId), userId);
  if (!siteAccess.hasAccess) {
    return res.status(403).json(formatApiError({
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'No access to this site'
    }));
  }

  // For version-specific operations, validate ownership/permissions
  if (versionId) {
    const version = await versionService.getVersion(parseInt(siteId), parseInt(versionId));
    if (!version.success) {
      return res.status(404).json(formatApiError({
        code: 'VERSION_NOT_FOUND',
        message: 'Version not found'
      }));
    }

    // Check version permissions (authors can only edit their drafts)
    if (!canAccessVersion(req.user, version.data)) {
      return res.status(403).json(formatApiError({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Cannot access this version'
      }));
    }
  }

  next();
};
```

#### Rate Limiting Strategy
```typescript
// Version-specific rate limiting
export const versionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: (req: Request) => {
    const endpoint = req.path;
    if (endpoint.includes('/publish') || endpoint.includes('/revert')) {
      return 10; // Strict limit for state-changing operations
    }
    if (endpoint.includes('/autosave')) {
      return 60; // Higher limit for auto-save
    }
    return 100; // Default limit for read operations
  },
  keyGenerator: (req: Request) => `${req.user?.id}:${req.params.siteId}:${req.path}`,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      details: { retryAfter: 60 }
    }
  }
});
```

### 8. Implementation Recommendations

#### Phase 1: Core Endpoints (Week 1)
1. **Version CRUD Operations**
   - `GET /api/sites/:siteId/content/:contentType/:contentId/versions`
   - `POST /api/sites/:siteId/content/:contentType/:contentId/versions`
   - `GET /api/sites/:siteId/versions/:versionId`
   - `PUT /api/sites/:siteId/versions/:versionId`
   - `DELETE /api/sites/:siteId/versions/:versionId`

#### Phase 2: Version Operations (Week 2)
2. **Publishing and State Management**
   - `POST /api/sites/:siteId/versions/:versionId/publish`
   - `POST /api/sites/:siteId/versions/:versionId/revert`
   - `POST /api/sites/:siteId/versions/:versionId/archive`

#### Phase 3: Advanced Features (Week 3)
3. **Comparison and Search**
   - `GET /api/sites/:siteId/versions/:versionId/diff`
   - `GET /api/sites/:siteId/versions/search`
   - `POST /api/sites/:siteId/versions/bulk`

#### Phase 4: Real-time Features (Week 4)
4. **WebSocket Integration**
   - Real-time version updates
   - Conflict detection and resolution
   - Live collaboration indicators

### 9. Testing Strategy

#### Integration Tests
```typescript
// Comprehensive API testing
describe('Version API Endpoints', () => {
  test('should create version with proper site isolation', async () => {
    const response = await request(app)
      .post(`/api/sites/${siteId}/content/post/${postId}/versions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(validVersionData);

    expect(response.status).toBe(201);
    expect(response.body.data.site_id).toBe(siteId);
  });

  test('should prevent cross-site version access', async () => {
    const response = await request(app)
      .get(`/api/sites/${otherSiteId}/versions/${versionId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(404);
  });
});
```

### 10. Deployment Considerations

#### Database Migrations
- Run CV-003 versioning schema migration
- Add new indexes for API optimization
- Monitor query performance during rollout

#### Redis Configuration
- Configure Redis cluster for high availability
- Set up appropriate memory limits and eviction policies
- Monitor cache hit rates and performance

#### Monitoring & Alerting
- API response time alerts (> 500ms)
- Error rate monitoring (> 5% error rate)
- Rate limit violations tracking
- Cache miss rate monitoring

This technical architecture provides a comprehensive, scalable foundation for the version API endpoints while integrating seamlessly with the existing CV-003 VersionService and multi-site CMS architecture.

## Implementation Plan - MVP Focus

### Critical Assessment & Scope Reduction

After reviewing the ticket against existing codebase patterns and PRD requirements, significant simplification is needed for MVP delivery:

**Over-Engineered Features to Remove/Defer:**
- Complex WebSocket real-time collaboration (defer to post-MVP)
- Redis caching layer (use existing database patterns)
- Complex bulk operations (limit to simple batch publish)
- Advanced search endpoints (use existing query patterns)
- Multi-site scoped URLs (simplify to existing domain patterns)
- Complex audit logging (use existing basic logging)
- Preview token security beyond basic JWT
- Conflict detection system (defer to post-MVP)

**Critical Path for MVP:**
Focus on essential CRUD operations that integrate with existing CV-003 VersionService and follow established patterns in `backend/src/routes/posts.ts` and `backend/src/routes/pages.ts`.

### Phase 1: Essential Version API (Week 1-2)

**Core Endpoints (Must Have):**
```
GET    /api/content/:contentType/:contentId/versions
       List versions (basic pagination, reuse existing patterns)

POST   /api/content/:contentType/:contentId/versions
       Create new version (draft only for MVP)

GET    /api/versions/:versionId
       Get specific version

PUT    /api/versions/:versionId
       Update draft version (basic, no conflict detection)

POST   /api/versions/:versionId/publish
       Publish version to live

DELETE /api/versions/:versionId
       Delete version (soft delete)
```

**Implementation Strategy:**
- Follow existing route patterns from `posts.ts` and `pages.ts`
- Use existing middleware: `authenticateToken`, `requireAuthor`, `validate`
- Integrate directly with CV-003 VersionService (already exists)
- Use existing domain context from `siteResolver.ts`
- Follow existing error response format from current routes

### Phase 2: Publishing Operations (Week 2)

**Publishing Endpoints:**
```
POST   /api/versions/:versionId/revert
       Create new draft from published version

GET    /api/content/:contentType/:contentId/versions/latest
       Get latest version by type (draft|published)
```

### Phase 3: Basic Comparison (Week 3 - Optional)

**Comparison (Simplified):**
```
GET    /api/versions/:versionId/diff?compareWith=:otherId
       Simple text diff comparison (no complex field-level diffs)
```

### Database Integration

**Use Existing Schema:**
- Content versioning table already exists from CV-003 migration
- No additional indexes needed for MVP
- Use existing site_id context from current domain resolution

### Authentication & Security (Simplified)

**Use Existing Patterns:**
- JWT authentication via existing `authenticateToken` middleware
- Role-based access via existing `requireAuthor`/`requireEditor` patterns
- Site context via existing `siteResolver.ts` middleware
- Input validation via existing Joi schemas pattern

**Rate Limiting:**
- Use express-rate-limit (already in dependencies)
- Simple per-user limits: 100 req/min for reads, 30 req/min for writes

### Response Format (Match Existing)

**Follow Current API Pattern:**
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "limit": 10, "total": 25 }
}
```

**Error Format (Match Existing):**
```json
{
  "error": "Version not found",
  "details": { ... }
}
```

### File Structure (Minimal)

```
backend/src/routes/versions.ts          # Single file for all version endpoints
backend/src/middleware/versionAuth.ts   # Simple version ownership check
backend/src/validation/versions.ts     # Joi schemas for version endpoints
```

### Testing Strategy (Pragmatic)

**Essential Tests Only:**
- Integration tests for CRUD operations
- Authorization tests (can't edit others' drafts)
- Basic input validation tests
- Use existing test patterns from `__tests__/` directory

### Success Metrics (Simplified)

**MVP Acceptance Criteria:**
- [ ] Create, read, update, delete versions via API
- [ ] Publish draft to live
- [ ] List version history with pagination
- [ ] Basic authorization (own drafts only)
- [ ] Input validation prevents invalid data
- [ ] Consistent with existing API patterns

### Implementation Priority

**Week 1: Core CRUD**
1. Version listing endpoint
2. Version creation endpoint
3. Version retrieval endpoint
4. Version update endpoint

**Week 2: Publishing**
1. Publish endpoint
2. Revert endpoint
3. Delete endpoint
4. Latest version endpoint

**Week 3: Polish**
1. Basic diff endpoint (optional)
2. Documentation updates
3. Integration testing
4. Performance optimization

### Deferred Features (Post-MVP)

- Real-time collaboration with WebSocket
- Redis caching layer
- Complex bulk operations
- Advanced search and filtering
- Conflict detection and resolution
- Audit logging beyond basic
- Preview token security
- Multi-site URL structure changes

### Integration Notes

**Leverage Existing Infrastructure:**
- CV-003 VersionService handles all business logic
- Existing domain/site resolution for multi-tenant context
- Current authentication and authorization patterns
- Established database connection and query patterns
- Existing validation and error handling approaches

**No New Dependencies:**
- Use existing Express router patterns
- Use existing Joi validation approach
- Use existing PostgreSQL connection pool
- Use existing JWT authentication

This implementation plan focuses on delivering essential version API functionality that integrates seamlessly with existing codebase patterns while deferring complex features that aren't critical for MVP success.

## Related Tickets
- CV-005: Auto-save endpoints (defer to post-MVP)
- CV-006: Preview endpoints (defer to post-MVP)
- CV-007: WebSocket events (defer to post-MVP)