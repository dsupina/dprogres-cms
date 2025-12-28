# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DProgres CMS** is a SaaS-first headless CMS platform designed to scale from startups to enterprise. Built as a monorepo with React frontend (Vite/React 18) and Express/TypeScript backend, deployed via Docker with PostgreSQL database.

### Vision & Goals
- **Visual Editing**: Best-in-class on-page editing with immediate feedback
- **AI-Assisted Content**: Multi-LLM router for content generation and optimization
- **Multi-Tenant Architecture**: Organization → Project → Environment → Site → Domain → Locale hierarchy
- **Content Personalization**: CDP integration for audience-driven content delivery
- **Edge Delivery**: Phased rollout from edge assignment to full edge caching
- **Enterprise-Ready**: RBAC, audit logging, GDPR/CCPA compliance

### Performance Targets
- **API Response**: p95 ≤ 300ms
- **Uptime**: 99.9% availability
- **Publish-to-Live**: p99 ≤ 10 seconds
- **Token Validation**: Sub-50ms (currently achieving ~35ms)

### Development Phases
- **Phase 1** (0-6 months): Sites, domains, locales, versioning, preview tokens, edge assignment
- **Phase 2** (6-12 months): Edge cache, CDP sync, navigation, experiments dashboard
- **Phase 3** (12-18 months): ABAC/OPA policies, SCIM/SSO, marketplace, data residency

**Key Documentation:**
- `/docs/prd.md` - Product requirements, vision, and phased rollout plan
- `/docs/ARCHITECTURE.md` - System architecture and technical design
- `/docs/COMPONENTS.md` - Component inventory and service descriptions
- `/docs/DECISIONS.md` - Architectural decision records (ADRs)
- `/docs/PATTERNS.md` - Code patterns and conventions (ServiceResponse, Events, Caching)
- `/docs/MILESTONES.md` - Development timeline, achievements, and lessons learned
- `/docs/tickets/EPIC-001_*` - Content versioning & draft preview system tickets (CV-001 through CV-013)

### Current Development Focus
**EPIC-001: Content Versioning & Draft Preview System**

This epic is the foundation for visual editing and collaborative workflows. It consists of 13 tickets (CV-001 through CV-013):

**Completed** ✅
- **CV-001**: Version storage database schema
- **CV-002**: Version data models and TypeScript types
- **CV-003**: Version management service (VersionService with 30+ methods)
- **CV-006**: Preview token system (JWT+AES encryption, sub-50ms validation)
- **CV-007**: Version comparison and diff viewer (multiple algorithms, export formats)

**In Progress** 🚧
- **CV-004**: Version API endpoints
- **CV-005**: Auto-save system (routes exist, full integration pending)

**Planned** 📋
- **CV-008**: Version UI components
- **CV-009**: Collaborative comments
- **CV-010**: Version permissions & security
- **CV-011**: Performance optimization & caching
- **CV-012**: Multi-site version migration
- **CV-013**: Locale-aware versioning

**Ticket Naming Convention**: `EPIC-XXX_CV-YYY_feature_description.md`

## Essential Commands

### Development
```bash
# Install all dependencies (root, frontend, backend)
npm run install:all

# Start both frontend and backend in development mode
npm run dev

# Or start individually:
npm run dev:frontend  # Runs on http://localhost:5173
npm run dev:backend   # Runs on http://localhost:5000
```

**Note**: This project is developed on Windows. Path separators and some bash commands may need adjustment for cross-platform compatibility.

### Testing

#### Backend Tests (Jest)
```bash
cd backend

# Run all tests
npm test

# Run specific test file or pattern
npm test VersionService               # Runs VersionService.test.ts
npm test DiffService                  # Runs DiffService.test.ts
npm test autosave                     # Runs autosave-related tests
npm test "routes.*versions"           # Runs version route tests

# Watch mode for TDD
npm run test:watch

# Generate coverage report (target: 80%+)
npm run test:coverage
```

#### Frontend Tests (Vitest)
```bash
cd frontend

# Run all tests
npm test

# Run specific test pattern
npm test VersionComparison            # Test version comparison UI
npm test "diff.*"                     # Test diff viewer components

# Watch mode
npm test -- --watch

# Vitest UI interface
npm run test:ui

# Generate coverage report
npm run test:coverage

# E2E tests with Playwright
npm run test:e2e
```

#### Pre-Commit Checklist
Before committing or creating PRs, run:
```bash
# Backend validation
cd backend
npm test                              # All tests must pass
npm run lint                          # ESLint checks
npx tsc --noEmit                      # TypeScript type checking

# Frontend validation
cd frontend
npm test                              # All tests must pass
npm run lint                          # ESLint + React checks
npm run build                         # TypeScript + Vite build
```

### Linting & Type Checking
```bash
# Backend
cd backend && npm run lint                          # ESLint for TypeScript
cd backend && npx tsc --noEmit                      # Type checking without build

# Frontend
cd frontend && npm run lint                         # ESLint with React rules
cd frontend && npm run build                        # TypeScript check + Vite build
```

### Building & Deployment
```bash
# Build both frontend and backend
npm run build                                       # Builds both projects

# Docker deployment
docker-compose up --build                           # Development environment
docker-compose up -d                                # Background mode
docker-compose logs -f app                          # Follow app logs
docker-compose exec db psql -U postgres cms_db      # Access database

# Database setup (if needed)
docker-compose exec db psql -U postgres -d cms_db < init-db.sql
```

## Project Structure

```
dprogres-cms/
├── backend/
│   ├── src/
│   │   ├── routes/          # Express route handlers (thin controllers)
│   │   ├── services/        # Business logic layer
│   │   │   ├── VersionService.ts      # Content versioning system
│   │   │   ├── DiffService.ts         # Version comparison & diff
│   │   │   ├── PreviewService.ts      # Preview token system
│   │   │   ├── DistributionService.ts # Content distribution
│   │   │   └── AiAuthorService.ts     # AI-powered content generation
│   │   ├── middleware/      # Auth, validation, rate limiting
│   │   ├── types/           # TypeScript type definitions
│   │   ├── utils/           # Helper functions (database, password, etc.)
│   │   ├── db/              # Database query functions
│   │   └── __tests__/       # Jest test files
│   ├── dist/                # Compiled TypeScript output
│   ├── migrations/          # Database migration scripts
│   └── uploads/             # File upload directory
├── frontend/
│   ├── src/
│   │   ├── pages/           # Route components
│   │   ├── components/      # Reusable React components
│   │   ├── services/        # API client functions
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Core utilities (auth store, etc.)
│   │   └── types/           # TypeScript types
│   └── dist/                # Vite build output
├── docs/                    # Project documentation
│   ├── tickets/             # Development epics and tickets
│   └── *.md                 # Architecture and implementation guides
└── init-db.sql              # Database schema initialization
```

## Architecture & Key Patterns

### API Structure
- **REST API** at `/api/*` with Express + TypeScript
- **JWT Authentication** with access/refresh token pattern
- **Joi validation** on all mutable routes - schemas colocated with routes
- **Middleware pipeline**: `helmet` → `cors` → `compression` → `morgan` → `express-rate-limit` → auth → validation
- **Database**: PostgreSQL with `pg` library, parameterized queries to prevent SQL injection

### Frontend Architecture
- **React Query v5** (@tanstack/react-query) for server state management - all API calls go through `services/` directory
- **Zustand** for auth state management in `lib/auth.ts`
- **Protected Routes** using `ProtectedRoute` component for admin areas
- **Form Handling** with `react-hook-form` and validation
- **Rich Text Editor** using Quill.js for content editing
- **Toast Notifications** via `react-hot-toast` for user feedback
- **Drag & Drop** using @dnd-kit for menu builders and component ordering
- **Routing** with React Router v6

### Multi-Tenant Architecture
The platform uses a hierarchical multi-tenant structure:

```
Organization (e.g., "Acme Corp")
  └── Project (e.g., "Marketing Sites")
      └── Environment (dev/stage/prod)
          └── Site (e.g., "DProgres Croatia", "DProgres Global")
              ├── Domain(s) (e.g., dprogres.hr, dprogres.com)
              ├── Locale(s) (e.g., hr-HR, en-US)
              └── Pages
                  └── Slots → Components → Entries
```

**Key Concepts**:
- **Site**: Primary organizational unit - owns domains, locales, navigation, theme, SEO defaults
- **Domain**: Attached to exactly one Site; primary domain + aliases (301 redirects)
- **Locale**: Scoped to Site with fallback chains (e.g., hr → hr-HR)
- **Page**: Route-aware, localized, composed from Components via named Slots
- **Routing Algorithm**: Host → Site → Locale → Page (deterministic, SEO-safe)

### Database Schema Highlights
- **Core Tables**: users, posts, pages, categories, media_files, tags, post_tags, site_settings
- **Multi-Tenant Tables**: organizations, projects, environments, sites, domains, locales
- **Page Composition**: pages, page_locales, slots, components, entries, entry_locales
- **Version Management**: content_versions, version_comments (append-only versioning)
- **Distribution Tables**: publishing_targets, publishing_schedules, distribution_logs, distribution_feedback
- **Preview System**: preview_tokens, preview_analytics, short_urls, preview_feedback
- **Navigation**: navigation (per Site+Locale), redirects (site-scoped 301/302)
- **Indexes** on: posts(status, category_id, slug, created_at), pages(site_id, locale, route), domains(host)
- **Role-based access**: Org Admin, Project Admin, Editor, Publisher, Viewer (scoped per Site)
- **SEO fields**: meta_title, meta_description, og_image, canonical URLs, hreflang generation

### Key Service Layer Components

#### VersionService (backend/src/services/VersionService.ts)
- **Purpose**: Comprehensive content versioning system
- **Version Types**: draft, published, auto_save, archived
- **Features**: Site isolation, caching, auto-pruning, event system
- **Security**: Input sanitization (DOMPurify), audit logging
- **Methods**: 30+ methods for version CRUD, comparison, rollback, pruning

#### DiffService (backend/src/services/DiffService.ts)
- **Purpose**: Version comparison and diff computation
- **Algorithms**: diff-match-patch for text, custom HTML structural diff
- **Export Formats**: PDF, HTML, JSON
- **Performance**: In-memory caching, optimized for large documents

#### PreviewService (backend/src/services/PreviewService.ts)
- **Purpose**: Secure content preview system
- **Security**: JWT+AES encryption, site isolation, IP/email restrictions
- **Performance**: Sub-50ms validation, in-memory caching
- **Features**: Short URLs, analytics tracking, expiration management

#### DistributionService (backend/src/services/DistributionService.ts)
- **Purpose**: Content distribution to external platforms
- **Features**: Publishing schedules, target management, retry logic
- **Integration**: AI-powered content adaptation via AiAuthorService
- **Analytics**: Distribution logs, feedback tracking, metrics

#### AiAuthorService (backend/src/services/AiAuthorService.ts)
- **Purpose**: AI-powered content generation and adaptation
- **Architecture**: Multi-LLM router pattern (planned: Google Gemini Flash, Azure OpenAI, Cohere, Claude)
- **Features**: Platform-specific content optimization, auto-tagging, summarization
- **Use Cases**: Social media posts, meta descriptions, distribution content, content suggestions
- **Integration**: Used by DistributionService for platform-specific content adaptation
- **Note**: Currently basic implementation; full multi-LLM router planned for Phase 2

#### MonitoringService (backend/src/services/MonitoringService.ts)
- **Purpose**: Centralized monitoring and alerting for subscription system and critical metrics (SF-026)
- **Features**: Webhook metrics, payment tracking, alert system, health checks, billing metrics
- **Alerting**: Multi-channel (Email, Slack, Sentry) with configurable thresholds and cooldowns
- **Metrics**: MRR, ARR, churn rate, subscription counts, payment success rates
- **Health Checks**: Database, Stripe, email, webhook component status
- **Integration**: Used by webhooks.ts for metric recording; provides /api/metrics/* endpoints

### File Upload & Media
- **Multer** for file handling with size limits (MAX_FILE_SIZE env var)
- **Sharp** for image processing and optimization
- Files stored in `uploads/` directory (configurable via UPLOAD_DIR)
- Media metadata tracked in `media_files` table
- **Current Limit**: 50MB (configured in both API and Nginx)

### Security Patterns
- All routes requiring auth check JWT via `middleware/auth.ts`
- Password hashing with bcryptjs (utils/password.ts)
- Input sanitization via Joi schemas and DOMPurify for HTML content
- Rate limiting on sensitive endpoints (auth, uploads)
- CSP headers via Nginx + helmet middleware
- Site isolation: All multi-tenant operations validate site_id ownership
- Audit logging for compliance tracking

## Important Conventions

### Backend Conventions
- **Thin Controllers**: Route handlers stay thin - business logic goes in `services/`
- **Service Layer Pattern**: All complex operations through service classes (VersionService, PreviewService, etc.)
- **ServiceResponse Pattern**: All service methods return `ServiceResponse<T>` with `{ success: boolean, data?: T, error?: string }`
- **Event-Driven Architecture**: Services extend EventEmitter and emit lifecycle events (e.g., `version:created`, `version:published`)
- **Type Safety**: Always use TypeScript types for API request/response - define in `types/` directory
- **SQL Security**: Parameterized queries only - never concatenate user input
- **Site Isolation**: Every multi-tenant operation must validate `site_id` ownership for data isolation
- **Caching Pattern**: In-memory caching with TTL for frequently accessed data (tokens, versions)

**Example Service Pattern**:
```typescript
export class MyService extends EventEmitter {
  async doSomething(input: InputType): Promise<ServiceResponse<OutputType>> {
    try {
      // Validate site isolation
      if (!await this.validateSiteAccess(input.siteId, userId)) {
        return { success: false, error: 'Access denied' };
      }

      // Business logic
      const result = await this.performOperation(input);

      // Emit event for decoupled operations
      this.emit('operation:completed', { result, userId, timestamp: new Date() });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

### Frontend Conventions
- UI components in `components/ui/` are pure, reusable primitives
- Page components handle data fetching via React Query hooks
- Keep styles in Tailwind classes, avoid inline styles
- Use `clsx` or `tailwind-merge` for conditional classes
- Images use responsive loading with proper alt text
- Form validation: react-hook-form with Zod schemas
- API calls: Always use service functions from `services/` directory

### TypeScript Patterns
- **Service Response Pattern**: All service methods return `ServiceResponse<T>` with `{ success: boolean, data?: T, error?: string }`
- **Type Definitions**: Complex types in dedicated files under `types/` directory
- **Enums**: Use TypeScript enums for constants (e.g., `ContentType`, `VersionType`, `VersionAction`)
- **Strict Mode**: TypeScript strict mode enabled - no implicit any
- **Interface Naming**: Prefix with `I` only for DTOs, not for domain types

### Testing Requirements
- Backend: Jest for unit and integration tests
- Frontend: Vitest for component tests, Playwright for E2E
- Minimum coverage targets: 80% for new code
- Run tests before committing - all must pass
- Test files colocated with source in `__tests__/` directories
- Focus on service layer testing - that's where business logic lives

## Environment Variables

Required for development:
```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/cms_db

# JWT Authentication
JWT_SECRET=dev-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production

# Server Configuration
NODE_ENV=development
PORT=5000

# File Uploads
UPLOAD_DIR=uploads
MAX_FILE_SIZE=52428800  # 50MB

# Preview Token System (CV-006)
JWT_PREVIEW_SECRET=preview-secret-change-in-production
PREVIEW_AES_KEY=32-byte-hex-key-change-in-production
SHORT_URL_BASE=https://dprev.it
PREVIEW_CACHE_TTL=300000  # 5 minutes in milliseconds

# Stripe Configuration (SF-003)
# Test Mode (development)
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...

# Live Mode (production) - See docs/STRIPE_SETUP.md for complete setup
# STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
# STRIPE_SECRET_KEY_LIVE=sk_live_...
# STRIPE_WEBHOOK_SECRET_LIVE=whsec_...
# STRIPE_PRICE_STARTER_MONTHLY_LIVE=price_...
# STRIPE_PRICE_STARTER_ANNUAL_LIVE=price_...
# STRIPE_PRICE_PRO_MONTHLY_LIVE=price_...
# STRIPE_PRICE_PRO_ANNUAL_LIVE=price_...

# SendGrid Email Configuration (SF-013)
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=noreply@dprogres.com
SENDGRID_FROM_NAME=DProgres CMS

# Monitoring & Alerting (SF-026) - All optional
SENTRY_DSN=https://xxx@sentry.io/123    # Error tracking (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... # Slack alerts (optional)
ALERT_EMAIL=alerts@example.com          # Email alerts (optional, falls back to SENDGRID_FROM_EMAIL)
```

### Stripe Environment-Based Key Selection

The application automatically selects Stripe keys based on `NODE_ENV`:
- `development` → Uses `*_TEST` keys
- `production` → Uses `*_LIVE` keys

See `docs/STRIPE_SETUP.md` for complete production Stripe setup instructions.

## Development Workflow

### Understanding the Product Context
Before starting work, familiarize yourself with:
1. **Product Vision** (`docs/prd.md`): Understand this is a SaaS-first headless CMS, not just a blog platform
2. **Current Epic** (`docs/tickets/EPIC-001_*`): Know which features are in scope for current development
3. **Architecture Decisions** (`docs/DECISIONS.md`): Understand why certain technologies/patterns were chosen
4. **Code Patterns** (`docs/PATTERNS.md`): Follow established patterns (ServiceResponse, Events, Caching)

### Multi-Tenant Development Guidelines
Always consider the multi-tenant architecture:
- **Organization → Project → Environment → Site → Domain → Locale → Page**
- Every operation must be **site-scoped** for data isolation
- Test with multiple sites to ensure proper isolation
- Consider locale fallback chains for internationalized content

### Feature Development Approach
1. **Read the ticket** in `docs/tickets/EPIC-XXX_CV-YYY_*.md` if working on EPIC-001
2. **Check dependencies**: What other tickets does this depend on?
3. **Review existing patterns**: Look at similar completed features (e.g., CV-003, CV-006, CV-007)
4. **Plan the implementation**:
   - Database schema changes (if any)
   - Service layer methods
   - API endpoints
   - Frontend components
   - Tests
5. **Implement incrementally**: Small commits, frequent testing
6. **Document as you go**: Update relevant docs/ files

### Performance-First Mindset
This project has strict performance targets:
- API p95 ≤ 300ms
- Token validation <50ms
- Publish-to-live p99 ≤ 10s

Always:
- Add indexes for new query patterns
- Use caching for frequently accessed data
- Profile slow operations
- Write performance tests for critical paths

## Common Development Tasks

### Adding a New API Endpoint
1. Create route handler in `backend/src/routes/`
2. Add Joi validation schema in the same file
3. Apply auth middleware if needed: `authenticateToken` from `middleware/auth.ts`
4. Add TypeScript types to `backend/src/types/`
5. Write tests in `backend/src/__tests__/`
6. Document in relevant docs/ files if it's a major feature

### Adding a New Admin Page
1. Create page component in `frontend/src/pages/admin/`
2. Add route in `frontend/src/App.tsx` wrapped with `ProtectedRoute`
3. Create API service functions in `frontend/src/services/`
4. Add navigation link in `AdminLayout` sidebar
5. Write component tests in same directory

### Adding a New Service Layer Component
1. Create service class in `backend/src/services/`
2. Follow `ServiceResponse<T>` pattern for return types
3. Add comprehensive test coverage in `backend/src/__tests__/`
4. Document public methods with JSDoc comments
5. Update `docs/COMPONENTS.md` with service description

### Database Migrations
1. Create versioned migration file in `backend/migrations/`
2. Name format: `NNN_feature_description.sql`
3. Include both UP and DOWN migrations
4. Update TypeScript types to match schema changes
5. Test migration on development database before committing

## Current Development Status

### Project Timeline
- **Project Start**: July 2024
- **Current Phase**: Phase 1 (MVP) - EPIC-001 Content Versioning
- **Active Branch**: `fix/categories-query-params` (distribution system changes staged)
- **Test Coverage**: 92% across completed features
- **Performance Achieved**:
  - Version Creation: 85ms (target: <100ms) ✅
  - Token Validation: 35ms (target: <50ms) ✅
  - Cache Hit Ratio: 88% (target: >85%) ✅

### EPIC-001 Progress Summary

**Phase**: Content Versioning & Draft Preview System (Foundation for Visual Editing)

**Major Achievements**:
1. ✅ **CV-003 - Version Management Service**:
   - 30+ methods for version CRUD, comparison, rollback, pruning
   - Event-driven architecture with lifecycle hooks
   - In-memory caching with auto-pruning
   - Comprehensive audit logging for compliance

2. ✅ **CV-006 - Preview Token System**:
   - JWT+AES dual-layer encryption
   - Sub-50ms validation with 85% cache hit ratio
   - Site isolation and access control (IP, email, password)
   - Short URL generation with QR code support

3. ✅ **CV-007 - Version Comparison & Diff**:
   - Multiple diff algorithms (Myers, Patience, Histogram, Semantic)
   - Three view modes (side-by-side, unified, inline)
   - Export functionality (PDF, HTML, JSON)
   - WCAG 2.1 AA accessibility compliance

4. ✅ **Multi-Site Foundation**:
   - Sites, domains, menus implemented
   - Domain verification workflow
   - Site-scoped content filtering

5. ✅ **Distribution System**:
   - `DistributionService.ts` with publishing schedules
   - AI-powered content adaptation (`AiAuthorService.ts`)
   - Distribution logs and analytics

**Next Priorities** (EPIC-001 completion):
- CV-004: Version API endpoints (in progress)
- CV-005: Auto-save full integration (routes exist)
- CV-008: Version UI components
- CV-009: Collaborative comments

### Known Issues & Technical Debt
- **High Priority**:
  - Some React Query mutations use v3 patterns (need migration to v5)
  - Distribution UI components incomplete
  - No full-text search implementation
  - Missing Redis/caching layer

- **Medium Priority**:
  - Need OpenAPI/Swagger API documentation
  - Webhook system for third-party integrations
  - Batch operations for bulk editing

- **Planned Features** (Post-EPIC-001):
  - WebSocket support for real-time collaboration
  - Visual page builder with drag-and-drop
  - CDP integration (Segment, mParticle)
  - Edge caching and transformation (Phase 2)

## Documentation Structure

### Main Documentation Files
When documenting features or capturing progress, use these primary files:
- **`docs/ARCHITECTURE.md`** - System architecture and technical design
- **`docs/COMPONENTS.md`** - Component inventory and service descriptions
- **`docs/DECISIONS.md`** - Architectural decisions and rationale (ADRs)
- **`docs/MILESTONES.md`** - Project milestones and achievements
- **`docs/PATTERNS.md`** - Design patterns and best practices
- **`docs/TROUBLESHOOTING.md`** - Common issues and solutions

### Feature-Specific Documentation
For major features (CV-XXX), create temporary guides:
- `docs/CV-XXX_IMPLEMENTATION_GUIDE.md` - Detailed implementation steps
- `docs/CV-XXX_DEVELOPER_SUMMARY.md` - Quick reference for developers
- Consolidate into main docs after feature completion

### API Documentation
- `docs/API_VERSIONING_SPEC.md` - Version API specifications
- `docs/API_VERSIONING_ENDPOINTS.md` - Endpoint reference
- `docs/VERSIONING_SYSTEM.md` - Version system architecture

## Git Workflow

### Branch Naming
- Features: `feat/ticket-id-description` (e.g., `feat/cv-003-version-management`)
- Bugs: `fix/ticket-id-description` (e.g., `fix/categories-query-params`)
- Chores: `chore/description`

### Commit Messages
- Follow conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Reference ticket IDs when applicable
- Examples:
  - `feat(versions): add version comparison API endpoints`
  - `fix(auth): resolve token refresh race condition`
  - `docs(cv-007): update diff service documentation`

### Before Creating PRs
1. Run all tests: `cd backend && npm test && cd ../frontend && npm test`
2. Run linting: `cd backend && npm run lint && cd ../frontend && npm run lint`
3. Ensure TypeScript compilation: `cd backend && npx tsc --noEmit`
4. Update relevant documentation in main docs/ files
5. Update CHANGELOG if significant feature
6. Ensure no console.log() or debug code remains

## Development Environment Notes

### Windows Development
This project is developed on Windows. Be aware:
- Use forward slashes in code, even on Windows
- Git will handle line endings (CRLF → LF)
- Some bash commands may need PowerShell equivalents
- Docker Desktop required for containerized development

### IDE Recommendations
- **VS Code** with extensions:
  - ESLint
  - Prettier
  - TypeScript + React
  - Jest/Vitest Test Runner
- **TypeScript**: Enable strict mode checking
- **Format on Save**: Recommended for consistency

### Common Troubleshooting
- **Port conflicts**: Backend (5000), Frontend (5173), Postgres (5432)
- **Module not found**: Run `npm run install:all` from root
- **Database connection**: Ensure PostgreSQL is running and DATABASE_URL is correct
- **TypeScript errors**: Run `npx tsc --noEmit` to see all errors
- **Test failures**: Check `__tests__/` for test-specific .env requirements

See `docs/TROUBLESHOOTING.md` for detailed solutions.

## Common Pitfalls & Lessons Learned

This section documents mistakes made during development and how to avoid them. These patterns emerged from code review feedback and should be checked during implementation.

### TypeScript Import Pitfalls

**Type-only imports vs value imports (SF-026)**
```typescript
// ❌ WRONG: Importing a value (array/object) as type-only
import type { AlertConfig, DEFAULT_ALERTS } from '../types/monitoring';

// ✅ CORRECT: Separate type imports from value imports
import type { AlertConfig } from '../types/monitoring';
import { DEFAULT_ALERTS } from '../types/monitoring';
```
**Rule**: If you're importing something you'll use at runtime (not just for type annotations), it cannot be in an `import type` block.

**Missing package.json dependencies (SF-026)**
```typescript
// ❌ WRONG: Using require() without adding to package.json
Sentry = require('@sentry/node'); // Will fail at runtime!

// ✅ CORRECT: Add dependency first
// package.json: "@sentry/node": "^8.42.0"
// Then use the import
```
**Rule**: When adding code that uses a new package (even optionally), always add it to package.json dependencies.

### SQL & Database Pitfalls

**Integer division truncation (SF-026)**
```sql
-- ❌ WRONG: Integer division truncates decimals
SELECT amount_cents / 12 as monthly_amount  -- 1150 / 12 = 95 (loses $0.83)

-- ✅ CORRECT: Use decimal division
SELECT amount_cents / 12.0 as monthly_amount  -- 1150 / 12.0 = 95.83
SELECT (amount_cents / 12.0)::integer as monthly_amount  -- Cast after division
```
**Rule**: For monetary calculations, always use decimal division (`/ 12.0`) and cast to integer only at the final step if needed.

**Wrong status filtering in aggregations (SF-026)**
```sql
-- ❌ WRONG: Including wrong statuses in MRR calculation
SELECT SUM(amount) FROM subscriptions
WHERE status IN ('active', 'trialing', 'past_due')  -- trialing hasn't paid, past_due may not pay

-- ✅ CORRECT: Only count confirmed revenue
SELECT SUM(amount) FROM subscriptions
WHERE status = 'active'  -- Only subscriptions that have actually paid
```
**Rule**: Understand the business meaning of each status. For revenue metrics, only count confirmed payments.

**Counting wrong invoice statuses as payment attempts (SF-026)**
```sql
-- ❌ WRONG: Counting all invoices as payment attempts
SELECT COUNT(*) as total_attempts,
       COUNT(*) FILTER (WHERE status = 'paid') as successful,
       COUNT(*) FILTER (WHERE status IN ('open', 'void', 'uncollectible')) as failed
FROM invoices

-- ✅ CORRECT: Only count invoices where payment was actually attempted
SELECT COUNT(*) FILTER (WHERE status IN ('paid', 'uncollectible')) as total_attempts,
       COUNT(*) FILTER (WHERE status = 'paid') as successful,
       COUNT(*) FILTER (WHERE status = 'uncollectible') as failed
FROM invoices
-- 'draft' = no attempt, 'open' = may not be attempted yet, 'void' = canceled
```
**Rule**: Understand the domain-specific lifecycle (e.g., Stripe invoice states) before writing metrics queries.

### Algorithm & Logic Pitfalls

**P95 percentile calculation (SF-026)**
```typescript
// ❌ WRONG: Using floor gives the maximum value in the array
const p95Index = Math.floor(sortedTimes.length * 0.95);

// ✅ CORRECT: Use nearest-rank method (ceil - 1, clamped)
const p95Index = sortedTimes.length > 0
  ? Math.min(Math.ceil(sortedTimes.length * 0.95) - 1, sortedTimes.length - 1)
  : 0;
```
**Rule**: For percentile calculations, use the nearest-rank method: `ceil(n * percentile) - 1`, clamped to valid array bounds.

**Alert thresholds not wired to all metric types (SF-026)**
```typescript
// ❌ WRONG: Generic alert check only handles error counts
checkAlertThreshold(alertId: string): void {
  const errorCount = this.getErrorCount(alert.category, alert.windowMinutes);
  if (errorCount > alert.threshold) this.triggerAlert(alertId, errorCount);
}

// ✅ CORRECT: Handle each metric type appropriately
checkAlertThreshold(alertId: string): void {
  const alert = this.alerts.get(alertId);
  let currentValue: number;

  if (alertId === 'api_response_time') {
    currentValue = this.getApiP95ResponseTime(alert.windowMinutes);
  } else {
    currentValue = this.getErrorCount(alert.category, alert.windowMinutes);
  }

  if (currentValue > alert.threshold) this.triggerAlert(alertId, currentValue);
}
```
**Rule**: When building alert systems, ensure each alert type is wired to its appropriate metric source.

**Missing event hooks for monitoring (SF-026)**
```typescript
// ❌ WRONG: Alert defined but never triggered because no code records the metric
// DEFAULT_ALERTS has 'payment_failure_rate' but handleInvoiceFailed() doesn't call recordError()

// ✅ CORRECT: Wire up the event source to the monitoring system
async handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
  // ... handle the failure ...

  // Record the failure for monitoring/alerting
  monitoringService.recordError('payment', `Invoice ${invoice.id}: ${failureReason}`);
}
```
**Rule**: When adding alerts, verify the corresponding metrics are actually being recorded somewhere.

### Edge Case Pitfalls

**Zero-data edge cases (SF-026)**
```typescript
// ❌ WRONG: Division fallback inflates metrics
const arpu = totalRevenue / (activeCount || 1);  // With 0 subscribers, shows full revenue as ARPU

// ✅ CORRECT: Handle zero explicitly
const arpu = activeCount > 0 ? totalRevenue / activeCount : 0;

// ❌ WRONG: 100% success rate with no data is misleading
const successRate = total > 0 ? (successful / total) * 100 : 100;

// ✅ CORRECT: Return 0 when no data to avoid misleading metrics
const successRate = total > 0 ? (successful / total) * 100 : 0;
```
**Rule**: Always test with empty/zero data sets. Metrics should return 0 or indicate "no data" rather than misleading values.

### Pre-Implementation Checklist

Before implementing features involving metrics, billing, or monitoring:

1. **Domain Understanding**: Do you understand the lifecycle states? (e.g., Stripe invoice: draft → open → paid/void/uncollectible)
2. **Type Imports**: Are you separating `import type` from value imports?
3. **Dependencies**: Have you added all required packages to package.json?
4. **SQL Division**: Are monetary calculations using decimal division (`/ 12.0`)?
5. **Status Filtering**: Are you only counting the statuses that match the business meaning?
6. **Edge Cases**: What happens with zero/empty data?
7. **Metric Wiring**: If adding alerts, is there code that records the corresponding metrics?
8. **Algorithm Correctness**: For statistical calculations, are you using the correct formula?

See `docs/PATTERNS.md` for detailed code patterns and anti-patterns.
