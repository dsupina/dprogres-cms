# CV-001: Version Storage Database Schema

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** Critical
**Status:** TODO

## User Story
As a **system administrator**, I need a robust database schema that can store multiple versions of content per site, track who made changes, and support preview tokens with multi-domain context, so that the system can reliably maintain content history across sites and enable safe preview sharing with proper site isolation.

## Background
Currently, our CMS only stores the latest version of content without site context. When users make changes across multiple sites, the previous versions are lost forever and there's no isolation between sites. This creates risk for content creators managing multi-site content and prevents site-specific collaboration through draft sharing.

## Requirements

### Functional Requirements
- Store complete snapshots of content at each save point per site
- Track version metadata (author, timestamp, version number, site_id, locale)
- Support different version types (draft, published, auto-save, archived) scoped by site
- Enable secure preview token storage with expiration and domain context
- Store collaborative comments tied to specific versions within sites
- Maintain referential integrity with sites, domains, and existing content tables
- Support locale-aware content versioning

### Technical Requirements
- Efficient indexing for fast site-scoped version retrieval
- Support for JSONB fields for flexible content and locale data storage
- Automatic timestamp updates via triggers
- Site-scoped unique constraints to prevent data inconsistencies
- Foreign key relationships to sites, users, and content tables
- Composite indexes for (site_id, content_id, version_number) queries

## Acceptance Criteria
- [ ] Database migration script successfully creates all required tables with site support
- [ ] Version numbers auto-increment correctly per content item within each site
- [ ] Only one draft and one published version can be marked as "current" per site
- [ ] Preview tokens have unique constraints with site/domain context
- [ ] Comments are properly linked to versions with site-scoped cascade deletion
- [ ] Site isolation is enforced through foreign keys and constraints
- [ ] Locale support is included in version storage
- [ ] Rollback script successfully reverts all changes
- [ ] Performance: Site-scoped version queries return in < 100ms with 1000+ versions

## Implementation Details

### Tables to Create

**content_versions**
- Primary storage for all content versions per site
- Links to sites table for multi-site isolation
- Links to original content (posts/pages) with site context
- Tracks version state, metadata, and locale information
- Includes site_id as part of composite keys

**preview_tokens**
- Stores secure preview access tokens with site/domain context
- Tracks expiration and access limits per domain
- Includes site_id and locale for proper preview routing
- Supports multi-domain preview rendering
- Links to specific versions

**version_comments**
- Enables collaborative review within sites
- Supports different comment types
- Maintains discussion threads per site
- Includes site_id for proper isolation

### Key Indexes
- Composite index on (site_id, content_type, content_id)
- Version lookups by site and content
- Current draft/published version queries per site
- Token validation lookups with domain context
- Comment retrieval by version and site
- Locale-based content queries

## Testing Considerations
- Load test with 10,000+ versions
- Verify constraint enforcement
- Test cascade deletions
- Verify trigger functionality
- Test concurrent version creation

## Documentation Requirements
- Migration guide for existing content
- Index performance benchmarks
- Data retention policy recommendations
- Backup strategy for version data

## Dependencies
- PostgreSQL 12+ for JSONB support
- Existing users table
- Existing posts/pages tables with site_id
- Sites and domains tables
- Locales configuration

## Related Tickets
- CV-002: Version data models and TypeScript types
- CV-003: Version service implementation