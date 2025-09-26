# EPIC-001: Content Versioning & Draft Preview System

**Status:** Planning
**Priority:** High
**Target Release:** Q1 2025

## Executive Summary

Enable content creators to work confidently with version history, auto-save protection, and shareable preview links across multiple sites and domains. This system will prevent content loss, enable safe experimentation, and improve collaboration through draft previews and version comparisons while supporting the multi-site, multi-domain architecture.

## Business Value

### Problems Solved
- **Content Loss Prevention**: Authors currently lose work if browser crashes or connection drops
- **No Experimentation Safety**: Can't try major changes without risk to published content
- **Limited Collaboration**: No way to share drafts for review before publishing
- **No Change History**: Can't see what changed or revert problematic updates
- **Accidental Publishing**: Easy to accidentally publish incomplete content

### Expected Outcomes
- 50% reduction in content-related support tickets
- 30% faster content approval cycles
- Zero data loss from browser/connection issues
- Improved content quality through peer review

## User Stories

### Content Creator
- As a content creator, I want my work automatically saved so I never lose progress
- As a content creator, I want to see all previous versions of my content so I can reference or restore old work
- As a content creator, I want to compare versions side-by-side so I can see what changed
- As a content creator, I want to share preview links so stakeholders can review before publishing

### Editor/Reviewer
- As an editor, I want to review draft content without accessing the CMS
- As an editor, I want to leave comments on specific versions for the author to address
- As an editor, I want to see what changed between versions I'm reviewing

### Administrator
- As an admin, I want to control who can publish content vs just create drafts per site
- As an admin, I want to see audit history of all content changes across sites
- As an admin, I want to set auto-save intervals and retention policies per site
- As an admin, I want to manage version permissions at the site level

## System Components

### 1. Version Management Core
- Version storage with efficient diff tracking
- Publishing workflow (draft → review → published)
- Revert/rollback capabilities
- Version comparison engine

### 2. Auto-Save System
- Periodic background saves (configurable interval)
- Conflict detection for concurrent edits
- Recovery UI for unsaved changes
- Intelligent save batching

### 3. Preview System
- Secure, expiring preview tokens
- Public preview URLs without authentication
- Preview frame with device simulators
- Preview analytics (who viewed, when)

### 4. Collaboration Features
- Version-specific comments
- Change request workflows
- Approval tracking
- Email notifications

### 5. UI Components
- Version timeline viewer
- Side-by-side comparison view
- Auto-save indicator
- Preview share dialog
- Version restore confirmation

## Technical Architecture

### Database Schema
```
content_versions
├── Stores all version snapshots per site
├── Tracks draft/published states
├── Links to sites, locales, authors and timestamps
└── Site-scoped unique constraints

preview_tokens
├── Secure token generation with site context
├── Expiration tracking
├── Multi-domain preview support
└── Access logging with locale tracking

version_comments
├── Threaded discussions per site
├── Comment types (note/approval/rejection)
├── Author attribution with site permissions
└── Cross-site reviewer support
```

### API Design
- RESTful versioning endpoints with site context (/v1/sites/{site_id}/versions)
- WebSocket for real-time auto-save per site
- Public preview endpoints with domain routing
- Batch operations support across sites
- Locale-aware version retrieval

### Performance Requirements
- Auto-save latency < 500ms per site
- Version load time < 1 second with site filtering
- Preview generation < 2 seconds with domain routing
- Diff calculation < 500ms across locales
- Cache hit rate > 85% for site-scoped queries

### Security Considerations
- Cryptographically secure preview tokens with site isolation
- Site-scoped role-based publishing permissions
- Audit logging for all operations with site context
- Rate limiting per site and domain
- Cross-site access controls
- Domain-specific preview restrictions

## Success Metrics

### Technical Metrics
- Auto-save success rate > 99.9%
- Zero data loss incidents
- Preview link generation < 2 seconds
- Version storage growth < 10% monthly

### User Metrics
- 80% of users using auto-save
- 50% reduction in accidental publishes
- 30% increase in content collaboration
- User satisfaction score > 4.5/5

## Implementation Phases

### Phase 1: Foundation
- Database schema with site support
- Site-aware migrations
- Core versioning service with site context
- Basic API endpoints with site routing

### Phase 2: Auto-Save
- Site-scoped auto-save service
- Multi-user conflict detection per site
- Recovery UI with site selector

### Phase 3: Preview System
- Token generation with domain context
- Multi-domain preview rendering
- Locale-aware preview UI
- Share UI with site/domain options

### Phase 4: Collaboration
- Site-scoped comments system
- Cross-site approval workflows
- Notifications with site context

### Phase 5: Multi-Site Enhancement
- Locale versioning support
- Cross-site version migration
- Site-specific retention policies
- Performance optimization per site

### Phase 6: Polish
- Advanced multi-site UI features
- Analytics dashboard per site
- Cache optimization for multi-domain

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Database growth | High storage costs | Implement version pruning policies |
| Performance degradation | Poor user experience | Add caching layer, optimize queries |
| Complex UI | User confusion | Progressive disclosure, good defaults |
| Token security | Unauthorized access | Short expiry, rate limiting, monitoring |

## Dependencies
- Existing content management system
- User authentication system
- Database migration tools
- Redis for caching (Phase 5)

## Out of Scope
- Real-time collaborative editing (Google Docs style)
- External version control integration (Git)
- Automated content merging
- AI-powered change summaries

## Related Documentation
- [MILESTONES.md](../MILESTONES.md) - Development milestones
- [API_VERSIONING_SPEC.md](../API_VERSIONING_SPEC.md) - API specification
- Individual ticket files (CV-XXX)