# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern, lightweight CMS built as a monorepo with React frontend and Express backend, deployed in a single Docker container with PostgreSQL database.
Reference /docs/PRD.md for all project context
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
```bash
# Backend tests (from backend/)
cd backend && npm test
cd backend && npm run test:coverage

# Frontend tests (from frontend/)
cd frontend && npm test
cd frontend && npm run test:coverage
cd frontend && npm run test:e2e  # Playwright E2E tests
```

### Linting & Type Checking
```bash
# Backend
cd backend && npm run lint

# Frontend
cd frontend && npm run lint
cd frontend && npm run build  # Runs TypeScript check then builds
```

### Building & Deployment
```bash
# Build both frontend and backend
npm run build

# Docker deployment
docker-compose up --build  # Development with hot reload
docker-compose -f docker-compose.prod.yml up -d  # Production
```

## Architecture & Key Patterns

### API Structure
- **REST API** at `/api/*` with Express + TypeScript
- **JWT Authentication** with access/refresh token pattern
- **Joi validation** on all mutable routes - schemas colocated with routes
- **Middleware pipeline**: `helmet` → `cors` → `compression` → `morgan` → `express-rate-limit` → auth → validation
- **Database**: PostgreSQL with `pg` library, parameterized queries to prevent SQL injection

### Frontend Architecture
- **React Query** for server state management - all API calls go through `services/` directory
- **Zustand** for auth state management in `lib/auth.ts`
- **Protected Routes** using `ProtectedRoute` component for admin areas
- **Form Handling** with `react-hook-form` and validation
- **Rich Text Editor** using Quill.js for content editing
- **Toast Notifications** via `react-hot-toast` for user feedback

### Database Schema Highlights
- **Tables**: users, posts, pages, categories, media_files, tags, post_tags, site_settings
- **Indexes** on: posts(status, category_id, slug, created_at), categories(slug), pages(slug)
- **Role-based access**: admin, author, editor roles
- **SEO fields** on posts and pages: meta_title, meta_description, og_image

### File Upload & Media
- **Multer** for file handling with size limits (MAX_FILE_SIZE env var)
- **Sharp** for image processing and optimization
- Files stored in `uploads/` directory (configurable via UPLOAD_DIR)
- Media metadata tracked in `media_files` table

### Security Patterns
- All routes requiring auth check JWT via `middleware/auth.ts`
- Password hashing with bcryptjs (utils/password.ts)
- Input sanitization via Joi schemas
- Rate limiting on sensitive endpoints (auth, uploads)
- CSP headers via Nginx + helmet middleware

## Important Conventions

### Backend Conventions
- Route handlers stay thin - business logic goes in utils/ or inline
- Always use TypeScript types for API request/response shapes
- Parameterized SQL queries only - never concatenate user input
- Return consistent error shapes: `{ error: string, details?: any }`

### Frontend Conventions
- UI components in `components/ui/` are pure, reusable primitives
- Page components handle data fetching via React Query hooks
- Keep styles in Tailwind classes, avoid inline styles
- Use `clsx` or `tailwind-merge` for conditional classes
- Images use responsive loading with proper alt text

### Testing Requirements
- Backend: Test auth middleware, route handlers, and utils
- Frontend: Test components with Testing Library, focus on user interactions
- Run tests before committing - all must pass
- E2E tests cover critical user flows (login, CRUD operations)

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

## Recent Changes & Known Issues

- **File uploads**: Recently increased to 50MB limit (API + Nginx configured)
- **Preflight checks**: Stabilization work in progress on `chore/preflight-stabilize` branch
- **Template management**: New pages template system added with admin UI
- **Rich text uploads**: WYSIWYG editor now supports image uploads with validation
- **Settings integration**: Site title/description now wired to database