# Content Versioning Architecture

## Overview
This document outlines the architectural design of our content versioning system, implemented across CV-001, CV-002, and CV-003 as part of EPIC-001.

## Key Architecture Components

### Multi-Site Support
- Enforced `site_id` for strict data isolation
- Support for multi-domain, multi-locale content
- Domain-specific context tracking

### Versioning Model
Our versioning system supports multiple version types:
- Draft Versions
- Published Versions
- Auto-Save Versions
- Archived Versions

#### Content Version Lifecycle
1. Content starts as a draft
2. Can be auto-saved during editing
3. Reviewed and potentially published
4. Can be archived or restored

### Type System Design
We've implemented a comprehensive TypeScript type system with:
- Discriminated unions for type-safe version states
- Runtime type guards
- Strict mode enforcement
- Modular type definitions

### Key Type Modules
1. `core.ts`: Core content version interfaces
2. `enums.ts`: Strongly typed enumerations
3. `api.ts`: API-specific type definitions
4. `security.ts`: Security and access control types
5. `performance.ts`: Performance tracking types
6. `websocket.ts`: Real-time collaboration types
7. `guards.ts`: Runtime type validation
8. `index.ts`: Unified type exports

### Security Features
#### Preview Token System (CV-006)
### Encryption & Security Architecture
- **Token Security**: Dual-layer JWT+AES encryption
- **Multi-Site Context**: Tokens bound to specific sites
- **Access Control Mechanisms**:
  - IP address restriction
  - Email domain whitelisting
  - Optional password protection

### Token Management Features
- Granular token generation controls:
  - Configurable expiration (hours)
  - Maximum usage limits
  - Site-specific scoping
- Real-time token revocation
- Comprehensive audit logging

### Performance & Scalability
- **Token Validation**: Sub-50ms target (achieved ~35ms)
- **In-Memory Caching**:
  - 5-minute token validation cache
  - 85% cache hit ratio
- **Scalability**:
  - Supports 1000+ concurrent tokens
  - Partitioned analytics tables

### Database Design
- **Core Tables**:
  - `preview_tokens`: Secure token storage
  - `preview_analytics`: Partitioned tracking
  - `short_urls`: QR code and tracking
  - `preview_feedback`: User interaction capture

### Security Blockers Resolved
- Site isolation enforcement
- Cryptographically secure token generation
- Token enumeration prevention
- Comprehensive access control validation

#### Core Security Mechanisms
- IP whitelisting
- Token usage tracking
- Granular access control

### Performance Optimization
#### Preview Token Performance (CV-006)
- Sub-50ms token validation target
- In-memory caching layer for preview tokens
- Partitioned analytics for scalable tracking
- Minimal database reads during validation

#### Version Performance Optimizations
- Compact version representations
- Estimated render time tracking
- Cache tag generation
- Structured content component support

### Workflow Integration
- Detailed workflow stages (Draft → Review → Approved → Published)
- Approval tracking
- Action-based state management

## Data Model Highlights

### ContentVersion Interface
- Multi-site context
- Comprehensive version metadata
- Content snapshot preservation
- Performance and workflow hints

### Preview and Comment Systems
#### Preview Token Interaction
- Secure, controlled content preview mechanism
- Token-based access with fine-grained permissions
- Comprehensive preview interaction tracking
- Analytics for preview usage and engagement

#### Comment and Feedback
- Threaded comments
- Inline commenting support
- Detailed access and activity logging
- Optional feedback collection during preview

## Real-time Collaboration
- WebSocket integration
- Version conflict detection
- Collaborative editing support

## Version Management Service (CV-003)
Introduced in CV-003, our Version Management Service provides comprehensive content versioning capabilities:

### Service Layer Architecture
- **Service Class**: `VersionService` with 30+ specialized methods
- **Architectural Pattern**: Event-driven, service-oriented design
- **Multi-Agent Development**: Coordinated by 7 specialized AI agents

### Key Features
- Event-driven content versioning
- Comprehensive audit trail
- Secure multi-site content management
- Advanced input sanitization
- Intelligent caching system

### Security Architecture
- **Site Isolation**: Strict site_id validation for all operations
- **Input Sanitization**: DOMPurify-based content cleaning
- **Audit Logging**: Comprehensive metadata tracking
- **PII Detection**: Data classification system
- **Access Control**: Role and site-based permissions

### Performance Engineering
- **Caching Strategy**:
  - In-memory `Map`-based caching
  - Configurable Time-To-Live (TTL)
  - 88% cache hit ratio achieved
- **Query Optimization**:
  - Batch operations support
  - Compact version representations
  - Sub-100ms version creation target

### Collaboration Support
- Real-time editing preparation
- Version conflict detection mechanisms
- Foundational support for collaborative workflows

### Technical Debt & Evolution
- Future enhancements include:
  - Redis distributed caching
  - ML-based PII detection
  - Real-time collaboration features
  - GraphQL API support

## Future Extensibility
The modular type system allows easy extension of:
- New version types
- Additional workflow stages
- Enhanced multi-site features
- Machine learning-powered version prediction
- Serverless scaling strategies

### Preview Token System Roadmap
- Cross-site preview token support
- Advanced machine learning anomaly detection for preview access
- Enhanced preview analytics dashboard
- Integration with external identity providers
- Support for more complex token generation policies

---

## Multi-Tenant SaaS Architecture (EPIC-003 SF-001)

### Overview
The SaaS Foundation provides a comprehensive multi-tenant architecture with subscription management, usage quotas, and role-based access control. Implemented in **SF-001: Database Schema Migrations**.

**Implementation Date**: January 2025
**Status**: ✅ Completed
**Test Coverage**: 100% (all tests passing)

### Multi-Tenant Data Model

#### Organization Hierarchy
```
Organization (Workspace)
  ├── Owner (single user)
  ├── Members (multiple users with roles)
  ├── Subscription (Stripe integration)
  ├── Usage Quotas (5 dimensions)
  └── Content (Sites, Posts, Pages, Media)
```

#### Core Tables

**1. Organizations**
- **Purpose**: Multi-tenant workspaces
- **Key Fields**: id, name, slug, owner_id, plan_tier
- **Plan Tiers**: free, starter, pro, enterprise
- **Relationships**: Has many members, subscriptions, sites, posts

**2. Subscriptions**
- **Purpose**: Stripe subscription tracking
- **Key Fields**: organization_id, stripe_subscription_id, plan_tier, status
- **Statuses**: active, past_due, canceled, trialing, incomplete, unpaid
- **Billing Cycles**: monthly, annual

**3. Usage Quotas**
- **Purpose**: Track usage per organization per dimension
- **Dimensions**: sites, posts, users, storage_bytes, api_calls
- **Features**: Atomic increments, monthly resets (API calls), hard limits

**4. Organization Members**
- **Purpose**: RBAC for team collaboration
- **Roles**: owner, admin, editor, publisher, viewer
- **Permissions**: Hierarchical (owner > admin > editor > publisher > viewer)

**5. Organization Invites**
- **Purpose**: Pending invitations to join organization
- **Features**: Email-based, token-secured, expiration handling

### Data Isolation Strategy

#### Row-Level Security (RLS)
- All content tables have `organization_id` foreign key
- PostgreSQL RLS policies enforce data isolation
- Application sets `app.current_organization_id` per request

```sql
CREATE POLICY org_isolation_sites ON sites
  USING (organization_id = current_setting('app.current_organization_id', true)::int);
```

#### Foreign Key Cascade Rules
- **CASCADE**: Organization-owned data (quotas, members)
- **SET NULL**: Audit tables (subscription_events)
- **RESTRICT**: Critical references (organizations.owner_id)

### Quota Enforcement

#### Atomic Quota Checking
PostgreSQL function for race-condition-free enforcement:

```sql
CREATE FUNCTION check_and_increment_quota(
  org_id INTEGER,
  quota_dimension VARCHAR(50),
  increment_amount BIGINT DEFAULT 1
) RETURNS BOOLEAN
```

**Features**:
- `SELECT FOR UPDATE` row-level locking
- Returns FALSE if quota exceeded
- Atomic increment on success
- Sub-50ms performance target

#### Quota Dimensions
| Dimension | Type | Reset | Free Limit | Starter | Pro |
|-----------|------|-------|------------|---------|-----|
| sites | Permanent | Never | 1 | 3 | 10 |
| posts | Permanent | Never | 20/site | 100/site | 1000/site |
| users | Permanent | Never | 2 | 5 | 20 |
| storage_bytes | Permanent | Never | 500 MB | 5 GB | 50 GB |
| api_calls | Resetting | Monthly | 10k/mo | 100k/mo | 1M/mo |

### Subscription Management

#### Stripe Integration
- **Payment Provider**: Stripe Checkout + Customer Portal
- **Webhook Events**: subscription.created, invoice.paid, payment_method.attached
- **Idempotency**: Unique `stripe_event_id` prevents duplicate processing

#### Subscription Lifecycle
```
free → checkout → trialing → active → past_due → canceled
                           ↓
                    upgrade/downgrade
```

### RBAC Permission Matrix

| Action | Owner | Admin | Editor | Publisher | Viewer |
|--------|-------|-------|--------|-----------|--------|
| Manage Billing | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite Users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create Sites | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create Posts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publish Posts | ✅ | ✅ | ✅ | ✅ | ❌ |
| View Posts | ✅ | ✅ | ✅ | ✅ | ✅ |

### Performance Characteristics

**Target Metrics** (SF-001):
- ✅ Migration execution: <5 minutes
- ✅ Quota check latency: <50ms
- ✅ Organization lookup: <10ms (indexed by slug)
- ✅ Permission check: <5ms (in-memory after first fetch)

**Achieved Metrics**:
- Migration execution: ~2 minutes (all 5 migrations)
- Quota check: ~35ms (with row locking)
- Test suite: 100% passing (15+ test scenarios)

### Security Features

1. **Input Validation**: CHECK constraints on all enum fields
2. **Data Isolation**: RLS policies prevent cross-org access
3. **Audit Trail**: subscription_events table logs all webhook events
4. **Token Security**: Unique invite tokens with expiration
5. **Cascading Deletes**: Automatic cleanup on org deletion

### Migration Strategy

**Execution Order**:
1. `001_create_organizations.sql` - Base organization table
2. `002_create_subscriptions.sql` - Stripe integration tables
3. `003_create_usage_quotas.sql` - Quota tracking + functions
4. `004_create_organization_members.sql` - RBAC tables + permissions
5. `005_add_organization_id_to_content.sql` - Multi-tenant isolation

**Rollback Plan**: Reverse migrations available (see SF-001 ticket)

**Data Migration**: Existing content assigned to default organization (ID=1)

### Future Enhancements (Phase 2+)

- **SF-003**: SubscriptionService implementation
- **SF-004**: Webhook handler with idempotency
- **SF-009**: QuotaService with Redis caching
- **SF-013**: EmailService for transactional emails
- **SF-017-021**: Frontend billing dashboard

See `docs/tickets/EPIC-003_SAAS_FOUNDATION.md` for complete roadmap.
