# Content Versioning API Documentation

## Overview

The Content Versioning API provides endpoints for managing content versions, preview tokens, and collaborative features in a multi-site CMS environment.

## Authentication

All versioning endpoints require authentication via JWT token:

```
Authorization: Bearer <token>
```

Site context is enforced through the `site_id` parameter in all requests.

## Version Management Endpoints

### Create Version

**POST** `/api/versions`

Creates a new version of content.

**Request Body:**
```typescript
{
  site_id: number;           // Required: Site context
  content_type: "post" | "page";
  content_id: number;
  version_data: {
    locale?: string;
    title: string;
    slug?: string;
    content?: string;
    excerpt?: string;
    data?: object;           // Custom JSONB data
    meta_data?: object;      // SEO metadata
    version_type?: "draft" | "published" | "auto_save";
    change_summary?: string;
  };
  options?: {
    auto_publish?: boolean;
    create_preview_token?: boolean;
    notify_collaborators?: boolean;
    schedule_publish?: string; // ISO 8601 date
  };
}
```

**Response:**
```typescript
{
  version: ContentVersion;
  preview_token?: PreviewToken;
  notifications_sent?: string[];
}
```

### Update Version

**PUT** `/api/versions/:id`

Updates an existing version.

**Request Body:**
```typescript
{
  updates: {
    title?: string;
    slug?: string;
    content?: string;
    excerpt?: string;
    data?: object;
    meta_data?: object;
    change_summary?: string;
  };
  create_new_version?: boolean; // If true, creates new version
}
```

### Publish Version

**PUT** `/api/versions/:id/publish`

Publishes a draft version.

**Request Body:**
```typescript
{
  force?: boolean;              // Override warnings
  scheduled_for?: string;       // ISO 8601 date
  notification_settings?: {
    notify_subscribers: boolean;
    email_summary: boolean;
    webhook_notifications: boolean;
  };
  cache_strategy?: "immediate" | "lazy" | "scheduled";
}
```

**Response:**
```typescript
{
  published_version: ContentVersion;
  previous_version?: ContentVersion;
  cache_purge_urls: string[];
  sitemap_updated: boolean;
  webhooks_triggered: string[];
}
```

### List Versions

**GET** `/api/versions`

Lists versions with filtering and pagination.

**Query Parameters:**
```typescript
{
  site_id: number;              // Required
  content_type?: "post" | "page";
  content_id?: number;
  locale?: string;
  version_type?: string[];      // Array of types
  author_id?: number;
  created_after?: string;       // ISO 8601
  created_before?: string;      // ISO 8601
  page?: number;
  limit?: number;
  include_auto_saves?: boolean;
  include_archived?: boolean;
  sort_by?: "created_at" | "version_number" | "published_at";
  sort_order?: "asc" | "desc";
}
```

**Response:**
```typescript
{
  versions: {
    items: ContentVersion[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  metadata: {
    total_drafts: number;
    total_published: number;
    last_auto_save: Date | null;
    storage_used_bytes: number;
  };
}
```

### Compare Versions

**GET** `/api/versions/compare`

Compares two versions and returns differences.

**Query Parameters:**
```typescript
{
  version_a_id: number;
  version_b_id: number;
  include_unchanged_fields?: boolean;
  diff_algorithm?: "myers" | "patience" | "histogram";
}
```

**Response:**
```typescript
{
  version_a: ContentVersion;
  version_b: ContentVersion;
  comparison: {
    total_changes: number;
    changes: VersionDiff[];
    similarity_score: number;    // 0-100
    estimated_review_time_minutes: number;
  };
}
```

### Revert Version

**POST** `/api/versions/:id/revert`

Creates a new version by reverting to a previous one.

**Request Body:**
```typescript
{
  create_as_draft?: boolean;
  change_summary?: string;
}
```

### Delete Version

**DELETE** `/api/versions/:id`

Deletes or archives a version.

**Query Parameters:**
```typescript
{
  soft_delete?: boolean;        // Archive instead of delete
  cascade_delete_comments?: boolean;
}
```

## Preview Token Endpoints

### Create Preview Token

**POST** `/api/preview-tokens`

Generates a secure preview link.

**Request Body:**
```typescript
{
  version_id: number;
  token_type?: "preview" | "share" | "embed";
  expires_in_hours?: number;
  max_uses?: number;
  password?: string;            // Will be hashed
  allowed_ips?: string[];
  require_auth?: boolean;
  allowed_users?: number[];
  custom_settings?: object;
}
```

**Response:**
```typescript
{
  token: PreviewToken;
  preview_url: string;
  qr_code?: string;            // Base64 QR code
  share_instructions?: string;
}
```

### Validate Preview

**GET** `/api/preview/:token`

Validates token and returns preview content.

**Query Parameters:**
```typescript
{
  password?: string;           // For protected previews
}
```

**Response:**
```typescript
{
  valid: boolean;
  version: ContentVersion;
  site_context: {
    site_id: number;
    primary_domain: string;
    locale: string;
    theme_tokens: object;
  };
  render_context: {
    preview_mode: boolean;
    editing_enabled: boolean;
    user_permissions: string[];
    toolbar_config?: object;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### Revoke Preview Token

**PUT** `/api/preview-tokens/:id/revoke`

Revokes a preview token.

**Request Body:**
```typescript
{
  reason?: string;
}
```

## Comment Endpoints

### Add Comment

**POST** `/api/versions/:id/comments`

Adds a comment to a version.

**Request Body:**
```typescript
{
  comment_text: string;
  comment_type?: "general" | "suggestion" | "issue" | "approval";
  parent_id?: number;          // For replies
  line_number?: number;        // For inline comments
  field_path?: string;         // JSON path
  mentions?: number[];         // User IDs to notify
}
```

### List Comments

**GET** `/api/versions/:id/comments`

Lists comments for a version.

**Query Parameters:**
```typescript
{
  status?: "active" | "resolved" | "archived";
  include_replies?: boolean;
  sort_by?: "created_at" | "updated_at";
  sort_order?: "asc" | "desc";
}
```

### Resolve Comment

**PUT** `/api/comments/:id/resolve`

Resolves a comment thread.

**Request Body:**
```typescript
{
  resolution_note?: string;
}
```

## Bulk Operations

### Bulk Version Operations

**POST** `/api/versions/bulk`

Performs bulk operations on multiple versions.

**Request Body:**
```typescript
{
  operation: "publish" | "archive" | "delete" | "update_status";
  version_ids: number[];
  options?: {
    batch_size?: number;
    delay_between_batches?: number;
    rollback_on_error?: boolean;
  };
  operation_params?: object;
}
```

**Response:**
```typescript
{
  successful: number[];
  failed: Array<{
    id: number;
    error: VersionError;
  }>;
  total_processed: number;
  duration_ms: number;
  rolled_back?: boolean;
}
```

## Auto-Save

### Auto-Save Content

**POST** `/api/versions/auto-save`

Creates an auto-save version.

**Request Body:**
```typescript
{
  site_id: number;
  content_type: "post" | "page";
  content_id: number;
  content: {
    title?: string;
    slug?: string;
    content?: string;
    excerpt?: string;
    data?: object;
    meta_data?: object;
  };
  parent_version_id?: number;
}
```

**Response:**
```typescript
{
  auto_save_id: number;
  saved_at: string;
  next_auto_save_in_seconds: number;
}
```

## WebSocket Events

### Connection

**WS** `/api/versioning`

Establishes WebSocket connection for real-time updates.

**Authentication:**
```typescript
{
  auth_token: string;
  site_id: number;
}
```

### Event Types

```typescript
// Version events
version:created
version:updated
version:published
version:deleted
version:auto_saved

// Comment events
comment:added
comment:updated
comment:resolved
comment:deleted

// Preview events
preview:created
preview:accessed
preview:expired

// Collaboration events
user:joined
user:left
user:typing
user:cursor
```

## Error Responses

All endpoints return consistent error responses:

```typescript
{
  success: false;
  error: {
    code: string;              // Error code enum
    message: string;           // Technical message
    userMessage: string;       // User-friendly message
    field?: string;           // For validation errors
    severity: "error" | "warning" | "info";
    metadata?: {
      conflicting_version?: ContentVersion;
      available_actions?: string[];
      retry_after?: number;
    };
  };
  request_id: string;
  timestamp: string;
  support_code?: string;
}
```

### Common Error Codes

- `VERSION_NOT_FOUND` - Requested version doesn't exist
- `VERSION_CONFLICT` - Conflicting version exists
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions
- `INVALID_CONTENT_TYPE` - Invalid content type specified
- `VALIDATION_FAILED` - Request validation failed
- `SITE_MISMATCH` - Site context mismatch
- `TOKEN_EXPIRED` - Preview token has expired
- `PUBLISHING_FAILED` - Version publishing failed

## Rate Limiting

All endpoints are rate limited:

- **Authenticated users**: 100 requests/minute
- **Preview token generation**: 10 tokens/hour
- **Auto-save**: 1 save/30 seconds
- **Bulk operations**: 5 operations/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Best Practices

1. **Always include site_id** for multi-tenant isolation
2. **Use cursor pagination** for large version lists
3. **Implement optimistic UI** with WebSocket events
4. **Cache version lists** with appropriate TTL
5. **Validate preview tokens** server-side
6. **Batch bulk operations** to avoid timeouts
7. **Handle rate limits** gracefully
8. **Subscribe to WebSocket** for real-time updates

## Migration from Legacy API

### Mapping Old Endpoints

```
OLD: GET /api/posts/:id
NEW: GET /api/versions?content_type=post&content_id=:id

OLD: PUT /api/posts/:id
NEW: POST /api/versions (create new version)

OLD: POST /api/posts/:id/publish
NEW: PUT /api/versions/:version_id/publish
```

### Data Structure Changes

```typescript
// Old Post structure
{
  id: number;
  title: string;
  content: string;
  status: string;
}

// New ContentVersion structure
{
  id: number;
  site_id: number;        // NEW: Required
  content_type: "post";
  content_id: number;     // Maps to old post.id
  version_number: number; // NEW: Version tracking
  version_type: string;
  title: string;
  content: string;
  // ... additional fields
}
```