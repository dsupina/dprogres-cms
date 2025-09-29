# Content Versioning API Specification

## Overview

The Content Versioning API provides comprehensive version control for posts and pages, including draft management, auto-save functionality, preview tokens, and collaborative commenting.

## Base URL

```
https://api.example.com/api
```

## Authentication

All endpoints except public preview routes require JWT authentication.

```http
Authorization: Bearer <jwt_token>
```

## Error Response Format

```json
{
  "error": "Error message",
  "details": {
    "field": "Additional error context"
  }
}
```

## Endpoints

### 1. Version Management

#### Create Version

```http
POST /content/:type/:id/versions
```

Creates a new version of content.

**Parameters:**
- `type` (path): `post` or `page`
- `id` (path): Content ID

**Request Body:**
```json
{
  "data": {
    "title": "Updated Title",
    "slug": "updated-slug",
    "content": "Updated content...",
    "excerpt": "Summary",
    "meta_title": "SEO Title",
    "meta_description": "SEO Description",
    "og_image": "https://example.com/image.jpg",
    "category_id": 1,
    "status": "draft",
    "featured_image": "https://example.com/featured.jpg",
    "template": "default",
    "parent_id": null,
    "order_index": 0,
    "is_homepage": false
  },
  "change_summary": "Updated introduction and conclusion",
  "is_draft": true,
  "is_auto_save": false
}
```

**Response:** `201 Created`
```json
{
  "id": 123,
  "content_type": "post",
  "content_id": 45,
  "version_number": 3,
  "title": "Updated Title",
  "slug": "updated-slug",
  "is_draft": true,
  "is_published": false,
  "created_by": 1,
  "created_at": "2025-01-26T10:00:00Z",
  "changed_fields": ["title", "content"]
}
```

---

#### Get Version History

```http
GET /content/:type/:id/versions
```

Retrieves version history for a content item.

**Parameters:**
- `type` (path): `post` or `page`
- `id` (path): Content ID

**Query Parameters:**
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `include_auto_saves` (optional): Include auto-saves (default: false)
- `include_drafts` (optional): Include drafts (default: true)
- `published_only` (optional): Only published versions (default: false)
- `order_by` (optional): `created_at` or `version_number` (default: version_number)
- `order_direction` (optional): `ASC` or `DESC` (default: DESC)

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 123,
      "version_number": 3,
      "title": "Version 3 Title",
      "is_draft": false,
      "is_published": true,
      "created_by_name": "John Doe",
      "created_at": "2025-01-26T10:00:00Z",
      "published_at": "2025-01-26T10:05:00Z",
      "change_summary": "Major content update"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 50,
  "has_more": false
}
```

---

#### Get Specific Version

```http
GET /versions/:id
```

Retrieves a specific version by ID.

**Parameters:**
- `id` (path): Version ID

**Response:** `200 OK`
```json
{
  "id": 123,
  "content_type": "post",
  "content_id": 45,
  "version_number": 3,
  "title": "Full Title",
  "slug": "full-slug",
  "content": "Full content...",
  "created_by_name": "John Doe",
  "created_at": "2025-01-26T10:00:00Z"
}
```

---

#### Publish Version

```http
PUT /versions/:id/publish
```

Publishes a version, making it the current live version.

**Parameters:**
- `id` (path): Version ID

**Response:** `200 OK`
```json
{
  "id": 123,
  "is_published": true,
  "published_by": 1,
  "published_at": "2025-01-26T10:05:00Z"
}
```

---

#### Revert to Version

```http
POST /versions/:id/revert
```

Creates a new version based on a previous version and publishes it.

**Parameters:**
- `id` (path): Version ID to revert to

**Response:** `201 Created`
```json
{
  "id": 125,
  "version_number": 5,
  "change_summary": "Reverted to version 3",
  "is_published": true
}
```

---

#### Delete Version

```http
DELETE /versions/:id
```

Deletes a draft version (published versions cannot be deleted).

**Parameters:**
- `id` (path): Version ID

**Response:** `204 No Content`

---

#### Compare Versions

```http
GET /versions/:id1/compare/:id2
```

Compares two versions and returns the differences.

**Parameters:**
- `id1` (path): First version ID
- `id2` (path): Second version ID

**Response:** `200 OK`
```json
{
  "version_1": {
    "id": 123,
    "version_number": 3,
    "title": "Original Title"
  },
  "version_2": {
    "id": 124,
    "version_number": 4,
    "title": "Updated Title"
  },
  "changes": [
    {
      "field": "title",
      "old_value": "Original Title",
      "new_value": "Updated Title",
      "type": "modified"
    },
    {
      "field": "content",
      "old_value": "Original content",
      "new_value": "Updated content",
      "type": "modified",
      "diff_lines": [
        {
          "line_number": 1,
          "type": "removed",
          "content": "- Original content"
        },
        {
          "line_number": 2,
          "type": "added",
          "content": "+ Updated content"
        }
      ]
    }
  ],
  "stats": {
    "fields_changed": 2,
    "lines_added": 5,
    "lines_removed": 3,
    "total_changes": 8
  }
}
```

---

### 2. Auto-save Endpoints

#### Create Auto-save

```http
POST /content/:type/:id/autosave
```

Creates or updates an auto-save version.

**Parameters:**
- `type` (path): `post` or `page`
- `id` (path): Content ID

**Request Body:**
```json
{
  "data": {
    "title": "Work in progress",
    "content": "Partial content..."
  }
}
```

**Response:** `200 OK`
```json
{
  "id": 126,
  "version_number": 6,
  "is_auto_save": true,
  "created_at": "2025-01-26T10:30:00Z"
}
```

---

#### Get Latest Auto-save

```http
GET /content/:type/:id/autosave/latest
```

Retrieves the latest auto-save for a content item.

**Response:** `200 OK`
```json
{
  "id": 126,
  "version_number": 6,
  "is_auto_save": true,
  "created_at": "2025-01-26T10:30:00Z",
  "data": {
    "title": "Work in progress",
    "content": "Partial content..."
  }
}
```

---

#### Restore Auto-save

```http
POST /content/:type/:id/autosave/restore
```

Restores content from the latest auto-save.

**Response:** `200 OK`
```json
{
  "id": 127,
  "version_number": 7,
  "is_draft": true,
  "change_summary": "Restored from auto-save"
}
```

---

### 3. Preview Token Endpoints

#### Generate Preview Token

```http
POST /preview/generate
```

Generates a secure preview token for a version.

**Request Body:**
```json
{
  "version_id": 123,
  "password": "optional_password",
  "max_views": 100,
  "expires_in_hours": 48
}
```

**Response:** `201 Created`
```json
{
  "token": "a1b2c3d4e5f6...",
  "preview_url": "https://example.com/preview/a1b2c3d4e5f6",
  "expires_at": "2025-01-28T10:00:00Z",
  "password_protected": false,
  "max_views": 100
}
```

---

#### View Preview (Public)

```http
GET /preview/:token
```

Views content preview (no authentication required).

**Parameters:**
- `token` (path): Preview token

**Query Parameters:**
- `password` (optional): Password if protected

**Response:** `200 OK`
```json
{
  "title": "Preview Title",
  "content": "Preview content...",
  "metadata": {
    "version_number": 3,
    "created_at": "2025-01-26T10:00:00Z",
    "views_remaining": 95
  }
}
```

---

#### Revoke Preview Token

```http
DELETE /preview/:token
```

Revokes a preview token.

**Parameters:**
- `token` (path): Preview token

**Response:** `204 No Content`

---

#### Update Preview Settings

```http
PUT /preview/:token/settings
```

Updates preview token settings.

**Request Body:**
```json
{
  "password": "new_password",
  "max_views": 50,
  "expires_in_hours": 24
}
```

**Response:** `200 OK`
```json
{
  "token": "a1b2c3d4e5f6...",
  "expires_at": "2025-01-27T10:00:00Z",
  "password_protected": true,
  "max_views": 50
}
```

---

### 4. Comment Endpoints

#### Add Comment

```http
POST /versions/:id/comments
```

Adds a comment to a version.

**Parameters:**
- `id` (path): Version ID

**Request Body:**
```json
{
  "comment": "This section needs clarification",
  "parent_comment_id": null,
  "line_start": 10,
  "line_end": 15,
  "selection_text": "Selected text..."
}
```

**Response:** `201 Created`
```json
{
  "id": 456,
  "version_id": 123,
  "comment": "This section needs clarification",
  "created_by": 1,
  "created_at": "2025-01-26T11:00:00Z",
  "author": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

#### Get Comments

```http
GET /versions/:id/comments
```

Retrieves comments for a version.

**Parameters:**
- `id` (path): Version ID

**Query Parameters:**
- `include_resolved` (optional): Include resolved comments (default: false)
- `thread_view` (optional): Group by threads (default: true)

**Response:** `200 OK`
```json
{
  "comments": [
    {
      "id": 456,
      "comment": "This section needs clarification",
      "is_resolved": false,
      "created_by": 1,
      "created_at": "2025-01-26T11:00:00Z",
      "author": {
        "name": "John Doe"
      },
      "replies": [
        {
          "id": 457,
          "comment": "I've updated this section",
          "created_at": "2025-01-26T11:30:00Z"
        }
      ]
    }
  ],
  "total": 5,
  "unresolved_count": 2
}
```

---

#### Update Comment

```http
PUT /comments/:id
```

Updates a comment.

**Parameters:**
- `id` (path): Comment ID

**Request Body:**
```json
{
  "comment": "Updated comment text"
}
```

**Response:** `200 OK`

---

#### Resolve Comment

```http
PUT /comments/:id/resolve
```

Marks a comment as resolved.

**Parameters:**
- `id` (path): Comment ID

**Response:** `200 OK`
```json
{
  "id": 456,
  "is_resolved": true,
  "resolved_by": 2,
  "resolved_at": "2025-01-26T12:00:00Z"
}
```

---

#### Delete Comment

```http
DELETE /comments/:id
```

Deletes a comment.

**Parameters:**
- `id` (path): Comment ID

**Response:** `204 No Content`

---

### 5. WebSocket Events

#### Connection

```javascript
const ws = new WebSocket('wss://api.example.com/ws');

ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['version:post:45', 'comments:123']
}));
```

#### Version Events

```json
{
  "type": "version_created",
  "content_type": "post",
  "content_id": 45,
  "version_id": 128,
  "user_id": 1,
  "timestamp": "2025-01-26T13:00:00Z"
}
```

```json
{
  "type": "conflict_detected",
  "content_type": "post",
  "content_id": 45,
  "version_id": 129,
  "user_id": 2,
  "data": {
    "conflicting_user": "Jane Doe",
    "message": "Another user is editing this content"
  }
}
```

#### Comment Events

```json
{
  "type": "comment_added",
  "version_id": 123,
  "comment_id": 458,
  "user_id": 1,
  "data": {
    "comment": "New comment text",
    "author": "John Doe"
  }
}
```

---

## Rate Limits

- Version creation: 60 requests per minute
- Auto-save: 120 requests per minute
- Preview generation: 30 requests per minute
- Comment operations: 100 requests per minute

## Permissions

### Role-based Permissions

| Action | Admin | Editor | Author |
|--------|-------|--------|--------|
| Create version | ✓ | ✓ | Own content |
| Publish version | ✓ | ✓ | × |
| Delete version | ✓ | ✓ | Own drafts |
| Revert version | ✓ | ✓ | × |
| Generate preview | ✓ | ✓ | ✓ |
| Add comments | ✓ | ✓ | ✓ |
| Resolve comments | ✓ | ✓ | Own comments |

## Migration Guide

### Migrating Existing Content

1. Run the database migration script
2. Execute the content migration tool:

```bash
npm run migrate:versions
```

This will:
- Create initial versions for all existing posts and pages
- Mark them as published
- Preserve creation and modification dates

### API Client Examples

#### JavaScript/TypeScript

```typescript
import { VersioningClient } from '@cms/versioning-client';

const client = new VersioningClient({
  apiUrl: 'https://api.example.com',
  token: 'jwt_token'
});

// Create a version
const version = await client.createVersion('post', 45, {
  data: {
    title: 'Updated Title',
    content: 'Updated content'
  },
  change_summary: 'Fixed typos'
});

// Get version history
const history = await client.getVersionHistory('post', 45, {
  limit: 10,
  published_only: false
});

// Generate preview
const preview = await client.generatePreview(version.id, {
  expires_in_hours: 48
});
```

#### cURL

```bash
# Create version
curl -X POST https://api.example.com/api/content/post/45/versions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Updated Title",
      "content": "Updated content"
    },
    "is_draft": true
  }'

# Get version history
curl -X GET "https://api.example.com/api/content/post/45/versions?limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Publish version
curl -X PUT https://api.example.com/api/versions/123/publish \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

1. **Auto-save Frequency**: Configure auto-save to run every 30-60 seconds to balance data safety and server load

2. **Version Cleanup**: Implement a cleanup policy to remove old auto-saves and drafts after 30 days

3. **Preview Security**: Always use expiring tokens with view limits for sensitive content

4. **Conflict Resolution**: Implement real-time notifications when multiple users edit the same content

5. **Performance**: Use caching for version history and implement pagination for large histories

6. **Audit Trail**: Log all version operations for compliance and debugging

## Troubleshooting

### Common Issues

1. **Version creation fails with "conflict" error**
   - Another user may be editing
   - Check for active auto-saves
   - Verify you have the latest version

2. **Preview token expired**
   - Generate a new token
   - Consider longer expiry times for review workflows

3. **Comments not appearing**
   - Check WebSocket connection
   - Verify permissions
   - Ensure version is not archived

4. **Auto-save not working**
   - Check browser console for errors
   - Verify network connectivity
   - Check auto-save interval settings