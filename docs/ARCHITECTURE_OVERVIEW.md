# System Architecture Overview

## High-Level Architecture

This is a **full-stack TypeScript CMS** built as a monorepo with a modern, scalable architecture designed for multi-site content management.

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                         │
│              (React SPA - Vite + TypeScript)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy                        │
│              (Port 3000 - Static + API Routing)              │
│  • Serves React build from /app/public                       │
│  • Proxies /api/* to Node.js backend                        │
│  • Serves /uploads/* with caching                            │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
               │ /api/*                    │ Static Files
               ▼                           ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│   Express.js Backend      │    │   Static Assets          │
│   (Port 3001)            │    │   (React Build)          │
│   • REST API             │    │   • HTML/CSS/JS          │
│   • JWT Auth             │    │   • Images               │
│   • Business Logic       │    │                          │
└──────────────┬───────────┘    └──────────────────────────┘
               │
               │ SQL Queries
               ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database (Port 5432)                  │
│  • Multi-site content storage                                │
│  • Version management                                        │
│  • User authentication                                       │
│  • Media metadata                                            │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Layers

### 1. Frontend Layer (React SPA)

**Technology Stack:**
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite (fast HMR, optimized builds)
- **Routing**: React Router v6
- **State Management**: 
  - React Query v5 (server state, caching, mutations)
  - Zustand (client state, auth)
- **Styling**: Tailwind CSS (utility-first)
- **Forms**: React Hook Form + Zod validation
- **Rich Text**: Quill.js editor
- **HTTP Client**: Axios with interceptors

**Architecture Pattern:**
```
frontend/src/
├── components/
│   ├── ui/              # Reusable UI primitives (Button, Input, etc.)
│   ├── layout/          # Layout components (PublicLayout, AdminLayout)
│   ├── admin/           # Admin-specific components (MenuBuilder, etc.)
│   └── diff/            # Version comparison UI (CV-007)
├── pages/
│   ├── admin/           # Admin panel pages (protected routes)
│   └── [public]/        # Public-facing pages (Blog, Post, etc.)
├── services/            # API service layer (React Query hooks)
├── lib/
│   ├── api.ts          # Axios instance configuration
│   └── auth.ts         # Zustand auth store
└── types/              # TypeScript type definitions
```

**Key Patterns:**
- **Service Layer**: All API calls go through `services/` directory
- **Protected Routes**: `ProtectedRoute` HOC for admin areas
- **Optimistic Updates**: React Query mutations with rollback
- **Error Boundaries**: Global error handling
- **Toast Notifications**: User feedback via react-hot-toast

### 2. Backend Layer (Express.js API)

**Technology Stack:**
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (100% type-safe)
- **Database**: PostgreSQL with `pg` library
- **Validation**: Joi schemas
- **Authentication**: JWT (access + refresh tokens)
- **Security**: Helmet, CORS, rate limiting
- **File Upload**: Multer + Sharp (image processing)

**Architecture Pattern:**
```
backend/src/
├── index.ts                    # Application bootstrap
├── routes/                      # REST endpoint handlers (thin controllers)
│   ├── auth.ts                 # Authentication endpoints
│   ├── posts.ts                # Blog post CRUD
│   ├── versions.ts             # Version management API
│   └── ...
├── services/                    # Business logic layer
│   ├── VersionService.ts       # Content versioning (30+ methods)
│   ├── PreviewService.ts       # Preview token system
│   ├── DiffService.ts          # Version comparison
│   └── siteService.ts          # Multi-site management
├── middleware/
│   ├── auth.ts                 # JWT verification
│   ├── siteResolver.ts         # Multi-site context resolution
│   ├── validation.ts           # Joi schema validation
│   └── domainValidation.ts     # Domain verification
├── utils/
│   ├── database.ts             # PostgreSQL connection pool
│   ├── jwt.ts                  # Token generation/verification
│   └── password.ts             # bcrypt password hashing
└── types/                       # TypeScript type definitions
```

**Key Patterns:**
- **Service Layer**: Business logic in services, routes stay thin
- **Middleware Pipeline**: Security → Validation → Auth → Handler
- **Service Response Pattern**: Consistent `{ success, data?, error? }` responses
- **Event-Driven**: Services emit events for decoupled operations
- **Site Isolation**: All multi-tenant operations validate `site_id`

### 3. Database Layer (PostgreSQL)

**Schema Organization:**

#### Core Content Tables
- `users` - Authentication and user management
- `posts` - Blog posts with SEO fields
- `pages` - Static pages with templates
- `categories` - Content categorization
- `tags` / `post_tags` - Tagging system
- `media_files` - Uploaded file metadata

#### Multi-Site Tables
- `sites` - Site configuration
- `domains` - Domain mapping to sites
- `menus` / `menu_items` - Navigation menus
- `templates` / `page_templates` - Template system

#### Version Management Tables (CV-003)
- `content_versions` - All content version snapshots
  - Supports: draft, published, auto_save, archived
  - Multi-site, multi-content-type versioning
  - Comprehensive metadata tracking
- `version_audit_log` - Operation audit trail

#### Preview Token Tables (CV-006)
- `preview_tokens` - Secure token storage
- `preview_analytics` - Partitioned usage tracking
- `preview_feedback` - User feedback collection

**Key Features:**
- **Indexes**: Optimized for common queries (slug, status, created_at)
- **Multi-Tenancy**: Site isolation via `site_id` foreign keys
- **Partitioning**: Time-based partitioning for analytics tables
- **Constraints**: Foreign keys, unique constraints, check constraints

## Multi-Site Architecture

### Site Resolution Flow

```
1. Request arrives at Nginx
   ↓
2. Domain validation middleware checks hostname
   ↓
3. Site resolver middleware:
   - Looks up domain in `domains` table
   - Resolves to `site_id`
   - Attaches `req.site` and `req.domain` to request
   ↓
4. All subsequent operations use `req.site.id` for data isolation
```

### Site Isolation Pattern

**Type-Level Enforcement:**
```typescript
// All multi-tenant queries require site_id
type SiteScopedQuery<T> = T & {
  site_id: number;
  __site_isolation_enforced: true;
};
```

**Runtime Enforcement:**
- All service methods validate `site_id` ownership
- Database queries always filter by `site_id`
- Audit logs track site context
- Preview tokens are site-scoped

## Version Management Architecture (CV-003)

### Version Lifecycle

```
Draft → Auto-Save → Review → Published
  ↓         ↓          ↓         ↓
Archive ← Restore ← Revert ← Archive
```

### Version Service Architecture

**Core Service**: `VersionService` (30+ methods)

**Key Capabilities:**
- **Version Creation**: Draft, published, auto-save versions
- **Version Retrieval**: Get by ID, version number, or type
- **Version Comparison**: Diff computation (CV-007)
- **Version Publishing**: Promote draft to published
- **Version Reversion**: Restore to previous version
- **Auto-Save**: Periodic draft updates during editing

**Event-Driven Design:**
```typescript
versionService.on('version:created', (payload) => {
  // Cache invalidation
  // Notification sending
  // Analytics tracking
});
```

**Performance Optimizations:**
- In-memory caching (88% hit ratio)
- Batch operations
- Compact version representations
- Sub-100ms version creation target

## Security Architecture

### Authentication & Authorization

**JWT Token System:**
- **Access Token**: Short-lived (15 min), contains user ID and role
- **Refresh Token**: Long-lived (7 days), stored in HTTP-only cookie
- **Token Rotation**: Refresh tokens rotate on use

**Role-Based Access Control (RBAC):**
- Roles: `admin`, `author`, `editor`
- Middleware enforces role requirements
- Site-level permissions

### Security Layers

1. **Network Layer**:
   - Nginx reverse proxy
   - Rate limiting (600 req/min in production)
   - CORS restrictions

2. **Application Layer**:
   - Helmet security headers
   - Input validation (Joi schemas)
   - SQL injection prevention (parameterized queries)
   - XSS protection (DOMPurify sanitization)

3. **Data Layer**:
   - Site isolation enforcement
   - Audit logging
   - Password hashing (bcrypt)
   - Token encryption (JWT + AES for preview tokens)

### Preview Token Security (CV-006)

**Dual-Layer Encryption:**
- JWT for token structure
- AES encryption for sensitive payload
- Site-scoped tokens
- Access controls: IP whitelist, email domain, password

**Performance:**
- Sub-50ms validation (achieved ~35ms)
- In-memory caching (5-minute TTL)
- 85% cache hit ratio

## API Architecture

### RESTful Endpoints

```
/api/auth/*
  POST   /login          # Authenticate user
  POST   /logout         # Invalidate tokens
  POST   /refresh        # Refresh access token

/api/posts/*
  GET    /               # List posts (paginated)
  GET    /:id            # Get single post
  POST   /               # Create post
  PUT    /:id            # Update post
  DELETE /:id            # Delete post
  GET    /search         # Full-text search

/api/versions/*
  GET    /:id            # Get version
  GET    /:id1/diff/:id2 # Compare versions
  POST   /compare        # Compare multiple versions
  POST   /:id/publish    # Publish version
  POST   /:id/revert     # Revert to version

/api/admin/*             # Admin-only endpoints
/api/settings/*          # Site configuration
/api/media/*            # File uploads
```

### Request/Response Flow

```
1. Client Request
   ↓
2. Nginx (static files or proxy to API)
   ↓
3. Express Middleware Stack:
   - Helmet (security headers)
   - CORS (cross-origin)
   - Compression (gzip)
   - Morgan (logging)
   - Rate Limiter
   - Domain Validation
   - Site Resolver
   ↓
4. Route Handler:
   - Auth Middleware (if protected)
   - Validation Middleware (Joi schema)
   - Service Method Call
   ↓
5. Service Layer:
   - Business Logic
   - Database Queries
   - Event Emission
   ↓
6. Response:
   - ServiceResponse<T> format
   - JSON serialization
   - Error handling
```

## Deployment Architecture

### Docker Container Structure

**Multi-Stage Build:**
```
Stage 1: Frontend Builder
  - Node.js + Vite
  - Builds React app to /app/public

Stage 2: Backend Builder
  - Node.js + TypeScript
  - Compiles TypeScript to JavaScript
  - Outputs to /app/dist

Stage 3: Runtime
  - Alpine Linux (minimal)
  - Node.js runtime
  - Nginx
  - Supervisor (process manager)
```

**Container Services:**
```yaml
services:
  app:
    - Nginx (port 3000)
    - Node.js API (port 3001)
    - Supervisor manages both processes
    - Serves React build + API

  db:
    - PostgreSQL 15 Alpine
    - Persistent volumes
    - Auto-initialization with init-db.sql
```

**Process Management:**
```
Supervisor
├── nginx (port 3000)
│   ├── Serves static files
│   └── Proxies /api/* to backend
└── backend (port 3001)
    └── Express.js API server
```

## Data Flow Examples

### Example 1: Creating a Blog Post

```
1. User fills form in React (React Hook Form)
   ↓
2. Submit → React Query mutation
   ↓
3. Axios POST /api/posts
   ↓
4. Express route handler:
   - Auth middleware validates JWT
   - Validation middleware checks Joi schema
   - Calls PostService.create()
   ↓
5. PostService:
   - Validates site_id ownership
   - Creates post in database
   - Creates initial draft version (VersionService)
   - Emits 'post:created' event
   ↓
6. Response → React Query updates cache
   ↓
7. UI updates optimistically
```

### Example 2: Version Comparison

```
1. User selects two versions in UI
   ↓
2. React Query fetches /api/versions/:id1/diff/:id2
   ↓
3. DiffService.compareVersions():
   - Validates site isolation
   - Computes text diff (diff-match-patch)
   - Computes structural diff (HTML)
   - Computes metadata diff
   - Caches result (LRU, 100 items)
   ↓
4. Response includes:
   - Change list
   - Statistics
   - Diff chunks
   ↓
5. Frontend renders:
   - VersionComparison component
   - DiffViewer (side-by-side/unified/inline)
   - ChangeNavigator (keyboard shortcuts)
```

## Performance Optimizations

### Frontend
- **Code Splitting**: Vite automatic route-based splitting
- **Lazy Loading**: React.lazy() for admin routes
- **Image Optimization**: Sharp processing on upload
- **Caching**: React Query with staleTime configuration
- **Virtual Scrolling**: For large lists (planned)

### Backend
- **Connection Pooling**: PostgreSQL pool (max 20 connections)
- **Query Optimization**: Indexes on frequently queried columns
- **Caching**: In-memory Maps for versions and tokens
- **Batch Operations**: Bulk inserts/updates
- **Compression**: Gzip responses via compression middleware

### Database
- **Indexes**: Strategic indexes on foreign keys and search columns
- **Partitioning**: Time-based partitioning for analytics
- **Query Optimization**: EXPLAIN ANALYZE for slow queries
- **Connection Management**: Pool with proper timeout handling

## Scalability Considerations

### Current Architecture Supports:
- **Multi-Site**: Unlimited sites with domain mapping
- **Concurrent Users**: Rate limiting prevents abuse
- **Large Content**: Pagination on all list endpoints
- **File Storage**: Local filesystem (can migrate to S3)

### Future Scalability Options:
- **Horizontal Scaling**: Stateless API servers behind load balancer
- **Database Replication**: Read replicas for query distribution
- **Caching Layer**: Redis for distributed caching
- **CDN**: CloudFront/Cloudflare for static assets
- **File Storage**: S3-compatible object storage
- **WebSockets**: Real-time collaboration (infrastructure ready)

## Development Workflow

### Local Development
```
1. npm run dev (root)
   ├── Frontend: Vite dev server (port 5173)
   └── Backend: ts-node-dev (port 5000)

2. Database: docker-compose up db
   └── PostgreSQL on port 5432

3. Hot Reload:
   - Frontend: Vite HMR
   - Backend: ts-node-dev watch mode
```

### Testing Strategy
- **Backend**: Jest + Supertest (unit + integration)
- **Frontend**: Vitest + Testing Library (component tests)
- **E2E**: Playwright (critical user flows)
- **Coverage**: 80%+ target for new code

### Build Process
```
1. Frontend Build:
   - Vite compiles TypeScript
   - Bundles and optimizes assets
   - Outputs to backend/public/

2. Backend Build:
   - TypeScript compiler (tsc)
   - Outputs to dist/
   - Type declarations (.d.ts)

3. Docker Build:
   - Multi-stage build
   - Final image: Alpine + Node + Nginx
```

## Key Architectural Decisions

1. **TypeScript-Only**: 100% type safety, no JavaScript in source
2. **Service Layer Pattern**: Business logic separated from routes
3. **Event-Driven**: Services emit events for extensibility
4. **Multi-Tenant**: Site isolation at database and application level
5. **RESTful API**: Standard HTTP methods and status codes
6. **JWT Authentication**: Stateless, scalable auth
7. **PostgreSQL**: ACID compliance, complex queries, JSON support
8. **Docker**: Consistent deployment across environments

## Architecture Evolution

### Current State (CV-007)
- ✅ Multi-site support
- ✅ Content versioning
- ✅ Preview token system
- ✅ Version comparison
- ✅ Auto-save functionality

### Planned Enhancements
- 🔄 WebSocket real-time collaboration
- 🔄 GraphQL API option
- 🔄 Redis distributed caching
- 🔄 ML-based PII detection
- 🔄 Advanced analytics dashboard

---

This architecture provides a solid foundation for a scalable, maintainable CMS with strong type safety, security, and performance characteristics.
