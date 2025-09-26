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