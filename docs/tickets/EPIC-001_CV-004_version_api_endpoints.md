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

**Version Management**
```
GET    /api/versions/:contentType/:contentId
       List all versions (paginated)
       Query params: page, limit, status, author

POST   /api/versions/:contentType/:contentId
       Create new version
       Body: version data

GET    /api/versions/:versionId
       Get specific version details

PUT    /api/versions/:versionId
       Update draft version
       Body: partial update data

DELETE /api/versions/:versionId
       Delete version (soft or hard)
```

**Version Operations**
```
POST   /api/versions/:versionId/publish
       Publish draft to live

POST   /api/versions/:versionId/revert
       Create new draft from this version

POST   /api/versions/:versionId/archive
       Archive version

GET    /api/versions/:versionId/diff
       Compare with another version
       Query params: compareWith
```

**Auto-save**
```
POST   /api/autosave/:contentType/:contentId
       Create auto-save version

GET    /api/autosave/:contentType/:contentId/latest
       Get latest auto-save
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

## Related Tickets
- CV-005: Auto-save endpoints
- CV-006: Preview endpoints
- CV-007: WebSocket events