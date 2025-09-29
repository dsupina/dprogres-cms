# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern, lightweight CMS built as a monorepo with React frontend (Vite/React 18) and Express/TypeScript backend, deployed via Docker with PostgreSQL database. The project is evolving from a basic CMS to a SaaS-ready platform with multi-site management, versioning, and personalization capabilities.

**Key Documentation:**
- `/docs/PRD.md` - Complete product requirements and vision
- `/docs/CV-003_DEVELOPER_SUMMARY.md` - Version management implementation details
- `/docs/tickets/EPIC-001_*` - Active development epics

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

### Testing

#### Test Execution Before Completing Work
**IMPORTANT**: Always run tests before marking work as complete:

```bash
# Quick test suite (run after any significant changes)
cd backend && npm test DiffService                  # Test new diff functionality
cd backend && npm test versions                     # Test version routes
cd frontend && npm test VersionComparison           # Test UI components

# Full test suite (run before committing)
cd backend && npm test                             # All backend tests
cd frontend && npm test                             # All frontend tests

# Comprehensive validation (before PR)
cd backend && npm run test:coverage                 # Ensure 80%+ coverage
cd backend && npm run lint && npx tsc --noEmit      # Linting and type check
cd frontend && npm run test:coverage                # Frontend coverage
cd frontend && npm run lint && npm run build        # Frontend validation
```

#### General Testing Commands
```bash
# Backend tests (from backend/)
cd backend && npm test                             # Run all tests
cd backend && npm test VersionService               # Run specific test file pattern
cd backend && npm run test:watch                    # Watch mode for TDD
cd backend && npm run test:coverage                 # Generate coverage report

# Frontend tests (from frontend/)
cd frontend && npm test                             # Run Vitest tests
cd frontend && npm run test:ui                      # Vitest UI interface
cd frontend && npm run test:coverage                # Generate coverage report
cd frontend && npm run test:e2e                     # Playwright E2E tests
```

#### Feature-Specific Test Patterns
```bash
# Version Comparison (CV-007)
cd backend && npm test DiffService                  # Diff algorithm tests
cd backend && npm test "routes.*versions"           # Version API tests
cd frontend && npm test "diff.*"                    # Diff viewer components
cd frontend && npm test VersionComparison           # Main comparison UI

# Version Management (CV-003)
cd backend && npm test VersionService               # Core version service
cd backend && npm test autosave                     # Auto-save functionality

# Performance Tests
cd backend && npm test -- --testNamePattern="performance"
cd frontend && npm test -- --testNamePattern="large.*document"
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
dprogres_site/
├── backend/
│   ├── src/
│   │   ├── routes/          # Express route handlers (thin controllers)
│   │   ├── services/        # Business logic layer (VersionService, etc.)
│   │   ├── middleware/      # Auth, validation, rate limiting
│   │   ├── types/           # TypeScript type definitions
│   │   ├── utils/           # Helper functions (database, password, etc.)
│   │   └── __tests__/       # Jest test files
│   ├── dist/                # Compiled TypeScript output
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

### Database Schema Highlights
- **Core Tables**: users, posts, pages, categories, media_files, tags, post_tags, site_settings
- **Multi-Site Tables**: sites, domains, menus, templates, page_templates
- **Version Management**: content_versions table with append-only versioning
- **Indexes** on: posts(status, category_id, slug, created_at), categories(slug), pages(slug)
- **Role-based access**: admin, author, editor roles
- **SEO fields** on posts and pages: meta_title, meta_description, og_image

### File Upload & Media
- **Multer** for file handling with size limits (MAX_FILE_SIZE env var)
- **Sharp** for image processing and optimization
- Files stored in `uploads/` directory (configurable via UPLOAD_DIR)
- Media metadata tracked in `media_files` table

### Version Management System (CV-003)
- **Core Service**: `backend/src/services/VersionService.ts` - 30+ methods for version operations
- **Version Types**: draft, published, auto_save, archived
- **Security**: Site isolation, input sanitization with DOMPurify, audit logging
- **Performance**: In-memory caching, batch operations, auto-pruning of old versions
- **Event System**: EventEmitter for version lifecycle hooks
- **Testing**: Comprehensive test coverage in `VersionService.enhanced.test.ts`

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
- Route handlers stay thin - business logic goes in `services/` or utils
- Service layer pattern: All complex operations through service classes (e.g., `VersionService`)
- Always use TypeScript types for API request/response shapes - define in `types/` directory
- Parameterized SQL queries only - never concatenate user input
- Return consistent error shapes: `{ success: boolean, data?: T, error?: string }`
- Site isolation: Every multi-tenant operation must validate site_id ownership

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
- Backend: Test services, route handlers, and middleware
- Frontend: Test components with Testing Library, focus on user interactions
- Minimum coverage targets: 80% for new code
- Run tests before committing - all must pass
- E2E tests cover critical user flows (login, CRUD operations)
- Use Jest for backend, Vitest for frontend

#### Preview Token System Testing
- Security tests: Token enumeration prevention, site isolation, access control
- Performance tests: Sub-50ms validation, cache hit rates
- Integration tests: Multi-domain preview, token expiration, revocation
- Load tests: 1000+ concurrent token validations

## Environment Variables

Required for development:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/cms_db
JWT_SECRET=dev-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
NODE_ENV=development
PORT=5000
UPLOAD_DIR=uploads
MAX_FILE_SIZE=52428800  # 50MB after Nginx config update

# Preview Token System (CV-006)
JWT_PREVIEW_SECRET=preview-secret-change-in-production
PREVIEW_AES_KEY=32-byte-hex-key-change-in-production
SHORT_URL_BASE=https://dprev.it
PREVIEW_CACHE_TTL=300000  # 5 minutes in milliseconds
```

## Common Development Tasks

### Adding a New API Endpoint
1. Create route handler in `backend/src/routes/`
2. Add Joi validation schema in the same file
3. Apply auth middleware if needed
4. Add TypeScript types to `backend/src/types/`
5. Write tests in `backend/src/__tests__/`

### Adding a New Admin Page
1. Create page component in `frontend/src/pages/admin/`
2. Add route in `frontend/src/App.tsx` wrapped with `ProtectedRoute`
3. Create API service functions in `frontend/src/services/`
4. Add navigation link in `AdminLayout` sidebar

### Database Migrations
1. Add migration SQL to `init-db.sql`
2. For production, create versioned migration files
3. Update TypeScript types to match schema changes

## Current Development Status

### Active Development
The project has multiple feature branches with advanced capabilities:

#### Completed Features:
- **CV-003**: Enhanced VersionService with security hardening, caching, and multi-site support
- **CV-006**: Preview Token System with JWT+AES encryption, multi-domain support, and analytics
- **CV-007**: Version Comparison and Diff Viewer with multiple view modes, export functionality, and performance optimization

#### In Progress:
- **CV-004**: Version API endpoints development
- **CV-005**: Auto-save system with React Query v5 integration

### Version Comparison System (CV-007)
- **Core Service**: `backend/src/services/DiffService.ts` - Comprehensive diff computation and export
- **Diff Algorithms**: diff-match-patch for text, custom HTML structural diff, metadata comparison
- **API Endpoints**: `/api/versions/compare`, `/api/versions/:id1/diff/:id2`, `/api/versions/diff/export`
- **Frontend Components**: `VersionComparison`, `DiffViewer`, `ChangeNavigator`, `ChangeStatistics`
- **View Modes**: Side-by-side, unified, inline with synchronized scrolling
- **Export Formats**: PDF, HTML, JSON with customizable options
- **Performance**: In-memory caching, Web Workers for large documents, virtual scrolling
- **Accessibility**: WCAG 2.1 AA compliant with keyboard navigation and screen reader support

### Preview Token System (CV-006)
- **Core Service**: `backend/src/services/PreviewService.ts` - Secure token generation and validation
- **Security**: JWT+AES encryption, site isolation, IP/email restrictions, password protection
- **Performance**: Sub-50ms validation, in-memory caching, partitioned analytics
- **Database**: `preview_tokens`, `preview_analytics`, `short_urls`, `preview_feedback` tables
- **Migration**: `backend/migrations/005_preview_token_system.sql`

### Recent Major Changes
- **Version Management**: Complete versioning system with audit logging and site isolation (CV-003)
- **React Query v5**: Migrated from v3 to v5 with updated mutation patterns
- **Multi-Site Support**: Added sites, domains, and menu management tables
- **File uploads**: Increased to 50MB limit (API + Nginx configured)
- **Template System**: New pages template system with admin UI

### Known Issues & TODOs
- Some React Query mutations may still use v3 patterns - check for `useMutation` with onSuccess/onError in options
- Auto-save system (CV-005) is designed but not yet implemented
- WebSocket infrastructure planned but not yet in place

## Documentation Structure

### Main Documentation Files
When documenting features or capturing progress, use these primary files:
- **`docs/ARCHITECTURE.md`** - System architecture and technical design
- **`docs/COMPONENTS.md`** - Component inventory and service descriptions
- **`docs/DECISIONS.md`** - Architectural decisions and rationale
- **`docs/MILESTONES.md`** - Project milestones and achievements
- **`docs/PATTERNS.md`** - Design patterns and best practices
- **`docs/TROUBLESHOOTING.md`** - Common issues and solutions

### Feature-Specific Documentation
For major features (CV-XXX), create temporary guides that get merged into main docs:
- `docs/CV-XXX_IMPLEMENTATION_GUIDE.md` - Implementation details
- `docs/CV-XXX_DEVELOPER_SUMMARY.md` - Quick reference
- These should be consolidated into main docs after completion

## Git Workflow

### Branch Naming
- Features: `feat/ticket-id-description` (e.g., `feat/cv-003-version-management`)
- Bugs: `fix/ticket-id-description`
- Chores: `chore/description`

### Commit Messages
- Follow conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Reference ticket IDs when applicable

### Before Creating PRs
1. Run all tests: `cd backend && npm test && cd ../frontend && npm test`
2. Run linting: `cd backend && npm run lint && cd ../frontend && npm run lint`
3. Ensure TypeScript compilation: `cd backend && npx tsc --noEmit`
4. Update relevant documentation in main files (not just feature-specific docs)