# System Architecture

## Overview

Modern CMS built as a monorepo with React frontend, Express backend, and PostgreSQL database. Designed for multi-domain support with a focus on developer experience and scalability.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │────▶│                 │────▶│                 │
│  React Frontend │     │  Express API    │     │   PostgreSQL    │
│   (Port 5173)   │◀────│   (Port 5000)   │◀────│    Database     │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                        │
        └───────────────────────┴────────────────────────┘
                          Docker Network
```

## Directory Structure

```
dprogres_site/
├── backend/               # Express API server
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Auth, validation, etc.
│   │   ├── services/     # Business logic
│   │   ├── utils/        # Helpers and utilities
│   │   └── types/        # TypeScript definitions
│   └── dist/             # Compiled JavaScript
│
├── frontend/             # React application
│   ├── src/
│   │   ├── pages/        # Route components
│   │   ├── components/   # Reusable UI components
│   │   ├── services/     # API client services
│   │   ├── lib/          # Core utilities (auth)
│   │   └── hooks/        # Custom React hooks
│   └── dist/             # Production build
│
├── docs/                 # Project documentation
├── uploads/              # User uploaded files
└── docker-compose.yml    # Container orchestration
```

## Backend Architecture

### API Layer (`backend/src/routes/`)
- RESTful endpoints organized by resource
- Consistent URL patterns: `/api/{resource}`
- Middleware pipeline for cross-cutting concerns

### Middleware Pipeline
```
Request → CORS → Helmet → Compression → Morgan → RateLimit → Auth → Validation → Handler
```

**Key Middleware**:
- `auth.ts` - JWT token validation
- `validation.ts` - Request body validation with Joi
- `siteResolver.ts` - Multi-domain context injection

### Service Layer (`backend/src/services/`)
- Business logic separated from routes
- Database transactions handling
- Complex operations orchestration

### Data Access
- Direct SQL queries with `pg` library
- Parameterized queries for security
- Connection pooling for performance

### Authentication Flow
```
1. Login Request → POST /api/auth/login
2. Validate credentials → bcrypt compare
3. Generate tokens → JWT access + refresh
4. Return tokens → Client stores in memory/localStorage
5. API requests → Bearer token in Authorization header
6. Token refresh → POST /api/auth/refresh when expired
```

## Frontend Architecture

### Component Hierarchy
```
App.tsx
├── Routes (React Router)
│   ├── Public Pages
│   │   ├── HomePage
│   │   ├── PostView
│   │   └── PageView
│   └── Admin Pages (Protected)
│       ├── Dashboard
│       ├── Posts Management
│       ├── Pages Management
│       └── Settings
└── Providers
    ├── QueryClient (React Query)
    └── AuthContext (Zustand)
```

### State Management

**Server State** (React Query):
- API data caching
- Background refetching
- Optimistic updates
- Request deduplication

**Client State** (Zustand):
- Authentication state
- User preferences
- UI state

**Form State** (React Hook Form):
- Form validation
- Field errors
- Submission handling

### API Communication
```typescript
// Service layer pattern
frontend/src/services/{resource}.ts
  → axios.request()
  → auth interceptor adds token
  → response transformation
  → error handling
  → return typed data
```

## Database Architecture

### Schema Design Principles
- Normalized for consistency
- JSONB for flexibility (pages.data, settings, content_versions)
- Foreign keys for referential integrity
- Indexes for query performance
- Support for complex content workflows

### Content Versioning Schema Strategy

1. **Normalized Versioning**
   - Separate `content_versions` table from main content tables
   - Independent version tracking per content type
   - Complete snapshot preservation of content state

2. **Metadata Flexibility**
   - JSONB columns for:
     * Version-specific metadata
     * Change tracking
     * Diff storage
   - Allows extension without schema migrations

3. **Access Control**
   - Granular tracking of version creators
   - Preview tokens with configurable access
   - IP and password restrictions on preview links

#### Version State Management
```sql
-- Example: Retrieving the latest draft
SELECT * FROM content_versions
WHERE content_id = $1
  AND content_type = 'post'
  AND is_current_draft = true;
```

#### Preview Token Generation
```sql
-- Generate a secure, time-limited preview
INSERT INTO preview_tokens (
  token, version_id, expires_at, max_uses
) VALUES (
  generate_preview_token(),
  $1, NOW() + INTERVAL '24 hours', 10
);
```

### Multi-Domain Strategy
```sql
-- Content isolation by domain
SELECT * FROM posts
WHERE domain_id = $1
  AND status = 'published';

-- Domain resolution
SELECT * FROM domains
WHERE hostname = $1
  AND is_active = true;
```

### Key Relationships
```
users ─────┐            ├─── posts ────┐
           ├─── pages ──┤              ├─── content_versions
           ├─── media_files           ├─── preview_tokens
           └─── version_comments      └─── comments

categories ──── posts ──── tags
                 │
              post_tags

domains ──── sites ──── menu_items
   │           │
   └───────────┴──── posts/pages/categories
```

### Content Versioning Overview

Content Versioning is implemented as a flexible system tracking content changes with several key features:

1. **Comprehensive Version Tracking**
   - Full history of content modifications
   - Granular change tracking per content type
   - Support for drafts, published, and archived states

2. **Preview and Collaboration**
   - Secure preview tokens with fine-grained access control
   - Inline and general comments on content versions
   - Workflow management through comment types and statuses

3. **Flexible Metadata**
   - JSONB storage for change tracking and metadata
   - Supports multiple content types (posts, pages)
   - Semantic versioning of content

#### Content Version Lifecycle
```
[Draft]  →  [Review]  →  [Published]  ←→  [Archived]
   ↑               ↑          ↑            ↑
[Auto-Save]   [Comments]   [Live]     [Historical]
```

## Security Architecture

### Defense in Depth
1. **Network Level**: HTTPS, CORS configuration
2. **Application Level**: JWT auth, role checks
3. **Data Level**: Input validation, parameterized queries
4. **Infrastructure Level**: Docker isolation, secrets management

### Security Headers (Helmet)
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

### Rate Limiting Strategy
```javascript
// Different limits per endpoint type
auth:    5 req/min
upload:  10 req/min
api:     100 req/min
public:  1000 req/min
```

## Deployment Architecture

### Development Environment
```yaml
docker-compose.yml:
  - postgres:14 (database)
  - backend (hot reload)
  - frontend (HMR)
  - nginx (proxy)
```

### Production Environment
```yaml
docker-compose.prod.yml:
  - postgres:14 (persistent volume)
  - node:18-alpine (optimized image)
  - nginx (SSL termination)
```

### Environment Variables
```
Backend:
- DATABASE_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- NODE_ENV
- PORT

Frontend:
- VITE_API_URL
- VITE_APP_TITLE
```

## Data Flow Examples

### Creating a Post
```
1. User fills form → React Hook Form validation
2. Submit → POST /api/posts
3. Auth middleware → Verify JWT
4. Validation middleware → Joi schema
5. Route handler → Process request
6. Database → INSERT with returning
7. Response → 201 with created post
8. React Query → Update cache
9. UI → Navigate to post list
```

### Multi-Domain Content Request
```
1. Browser → GET https://domain1.com/
2. Nginx → Proxy to Express
3. Site Resolver → Extract hostname
4. Database → Find domain & site
5. Inject context → req.site, req.domain
6. Route handler → Filter by domain_id
7. Response → Domain-specific content
```

## Performance Considerations

### Database Optimizations
- Indexed columns for WHERE clauses
- Compound indexes for multi-column queries
- Query result limiting and pagination
- Connection pooling (default 10 connections)

### API Optimizations
- Response compression (gzip)
- Field selection to reduce payload
- Pagination on list endpoints
- Caching headers for static content

### Frontend Optimizations
- Code splitting with React.lazy
- React Query cache management
- Image optimization on upload
- Bundle size monitoring

## Scaling Considerations

### Horizontal Scaling
```
Load Balancer
     │
     ├── Node Instance 1
     ├── Node Instance 2
     └── Node Instance N
           │
      PostgreSQL
      (Primary)
```

### Caching Strategy (Future)
```
Client → CDN → API → Redis → Database
                ↑
            Cache Miss
```

### Future Architecture Enhancements
1. **Message Queue**: For async operations
2. **Search Service**: Elasticsearch for full-text search
3. **File Storage**: S3/Cloud storage for media
4. **Monitoring**: APM and error tracking
5. **CI/CD Pipeline**: Automated testing and deployment

## Development Workflow

### Local Development
```bash
npm run install:all  # Install dependencies
npm run dev         # Start all services
npm test           # Run tests
npm run build      # Build for production
```

### Git Workflow
```
main
  └── develop
        └── feature/branch-name
              └── commits → PR → merge
```

### Testing Strategy
- Unit tests for utilities and helpers
- Integration tests for API endpoints
- Component tests for UI logic
- E2E tests for critical user flows

## Monitoring & Observability (Planned)

### Metrics to Track
- API response times (p50, p95, p99)
- Error rates by endpoint
- Database query performance
- User activity patterns
- Resource utilization

### Logging Strategy
```javascript
// Structured logging
logger.info({
  event: 'post_created',
  userId: req.user.id,
  postId: result.id,
  duration: Date.now() - start
});
```

### Health Checks
```
GET /health → API status
GET /health/db → Database connection
GET /health/ready → Full system check
```

## Content Versioning System (CV-002)

### Overview
The content versioning system provides comprehensive version management for posts and pages with multi-site support, enabling draft/publish workflows, secure preview sharing, and collaborative editing.

### Type System Architecture

The versioning types are organized into specialized modules:

```
backend/src/types/versioning/
├── core.ts          # Core interfaces (ContentVersion, PreviewToken, VersionComment)
├── enums.ts         # Type-safe enums and constants
├── api.ts           # API request/response contracts
├── security.ts      # Authentication, authorization, and data protection
├── performance.ts   # Caching, optimization, and monitoring
├── websocket.ts     # Real-time collaboration events
├── guards.ts        # Runtime type validation and sanitization
└── index.ts         # Main exports
```

### Database Schema

#### Core Tables
- **content_versions**: Stores all content versions with JSONB data
  - Enforces unique version numbers per site/content
  - Supports draft and published states
  - Tracks change history and diffs

- **preview_tokens**: Manages secure preview links
  - Token hashing for security
  - IP whitelisting and password protection
  - Usage tracking and expiration

- **version_comments**: Collaborative commenting system
  - Threaded discussions
  - Inline comments with line numbers
  - Resolution tracking

- **preview_access_logs**: Audit trail for preview access

### Key Architectural Decisions

1. **Multi-Site Data Isolation**
   - All types enforce `site_id` for tenant isolation
   - Compile-time enforcement via TypeScript
   - Runtime validation through type guards

2. **Type-Safe API Contracts**
   - Complete request/response types for all endpoints
   - Discriminated unions for version states
   - Comprehensive error types with user-friendly messages

3. **Security-First Design**
   - Token hashing requirements
   - Rate limiting configurations
   - Audit logging for compliance
   - PII protection patterns

4. **Performance Optimization**
   - Cursor-based pagination for large datasets
   - Multi-layer caching strategies
   - Lazy loading patterns
   - Bundle size optimization

5. **Real-Time Collaboration**
   - WebSocket event types for live updates
   - User presence tracking
   - Optimistic UI support
   - Conflict resolution patterns

### Integration Points

```typescript
// Version Management API
POST /api/versions           → Create new version
PUT /api/versions/:id        → Update version
PUT /api/versions/:id/publish → Publish version
GET /api/versions            → List versions
GET /api/versions/compare    → Compare versions

// Preview System
POST /api/preview-tokens     → Generate preview link
GET /api/preview/:token      → Validate and render preview
PUT /api/preview-tokens/:id/revoke → Revoke preview access

// Collaboration
POST /api/versions/:id/comments → Add comment
PUT /api/comments/:id/resolve → Resolve comment thread
WS /versioning → Real-time updates
```

### Testing Strategy

- **Type Guards**: 39 unit tests covering validation, sanitization, and narrowing
- **Runtime Validation**: Guards prevent invalid data at application boundaries
- **Integration Tests**: API contract validation
- **Performance Tests**: Bundle size and compilation time monitoring