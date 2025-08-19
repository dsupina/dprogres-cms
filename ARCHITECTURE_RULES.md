## Lightweight CMS – Architecture & Rules

### 1) System Architecture
- **Frontend**: React 18 + TypeScript + Vite (SPA)
- **Backend**: Node.js + Express + TypeScript (REST API)
- **Database**: PostgreSQL 15+
- **Runtime**: Single container with Nginx reverse proxy + Node API managed by Supervisor
- **Build**: Multi-stage Dockerfile (frontend builder, backend builder, runtime)

### 2) Project Structure
```
dprogres_site/
├─ frontend/           # React app (Vite, TS)
├─ backend/            # Express API (TS)
├─ nginx/              # Nginx config
├─ Dockerfile          # Multi-stage build
├─ docker-compose.yml  # App + Postgres services
├─ init-db.sql         # Schema + seeds
└─ supervisord.conf    # Nginx + backend processes
```

### 3) Tech Stack
- **Frontend**: React, React Router, React Query, Zustand, Tailwind CSS, React Hook Form, React Markdown, Quill, Framer Motion, Axios
- **Backend**: Express, pg, Joi, Multer, slugify, bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit, compression, morgan, dotenv
- **Tooling**: TypeScript, ESLint, Jest (API), Supertest, Vitest (+ Testing Library, jsdom), Playwright

### 4) Backend Code Layout
```
backend/src/
├─ index.ts                     # App bootstrap
├─ routes/                      # REST endpoints: auth, posts, pages, categories, media, settings, admin
├─ middleware/                  # auth (JWT), validation (Joi)
├─ utils/                       # database (pg pool), jwt, password (bcrypt), slug
├─ types/                       # Shared types
└─ __tests__/                   # Jest unit/integration tests
```

#### Backend Conventions
- Use Joi schemas for input validation on all mutable routes.
- Use parameterized SQL via `pg` to avoid injection.
- Issue access/refresh tokens with `jsonwebtoken`; verify in `middleware/auth`.
- Apply security middlewares: `helmet`, `cors`, `rate-limit`, `compression`, `morgan`.
- Prefer explicit TypeScript types for public APIs and data shapes.

### 5) Frontend Code Layout
```
frontend/src/
├─ components/
│  ├─ auth/           # ProtectedRoute, auth UI pieces
│  ├─ layout/         # PublicLayout, AdminLayout, Header, Footer
│  └─ ui/             # Button, Input, Select, Textarea, Spinner
├─ pages/
│  ├─ admin/          # Dashboard, Posts, Pages, Categories, Media, Settings, Login
│  └─ public          # Home, Blog, Post, Category, PageView
├─ lib/               # api (axios), auth (zustand), utils
├─ services/          # API service wrappers (posts, pages, categories, media)
└─ types/             # Shared TS types
```

#### Frontend Conventions
- Use React Query for server state; colocate queries/mutations in `services/`.
- Keep auth state in Zustand (`lib/auth`). Guard admin routes with `ProtectedRoute`.
- Use `react-hook-form` for forms with validation and `react-hot-toast` for UX feedback.
- Use Tailwind for styling; keep UI primitives in `components/ui`.

### 6) Database Schema (init-db.sql)
- Tables: `users`, `categories`, `posts`, `pages`, `tags`, `post_tags` (many-to-many), `media_files`, `site_settings` (KV).
- Indexes: `posts(status)`, `posts(category_id)`, `posts(slug)`, `posts(created_at)`, `categories(slug)`, `pages(slug)`, `media_files(uploaded_by)`.
- Seeds: default admin user, default categories, default site settings.

#### Entity Highlights
- **users**: local + OAuth fields, roles: admin/author/editor.
- **posts**: SEO fields, status, scheduling, featured, counters.
- **pages**: static pages with templates and SEO.
- **media_files**: path, mime, size, alt text, uploader.
- **site_settings**: global config KV store.

### 7) API Surface (high-level)
```
/api/auth/*        # login, logout, refresh
/api/posts/*       # CRUD + search + list
/api/categories/*  # CRUD
/api/pages/*       # CRUD
/api/media/*       # upload, list, delete
/api/settings/*    # get/set site configuration
/api/admin/*       # admin-only ops
```

### 8) Security & Performance
- Enforce validation and RBAC on all write endpoints.
- Set CSP/security headers via Nginx + `helmet`.
- Rate-limit auth and sensitive endpoints.
- Use gzip and Nginx static caching for frontend assets and uploads.
- Keep queries indexed; paginate list endpoints.

### 9) Build & Deployment
- `docker-compose up` runs `app` (Nginx + Node) and `db` (Postgres 15-alpine).
- Runtime image serves React build from `/app/public`, API at 3001 via Nginx 3000.
- Supervisor manages `backend` and `nginx` processes.

### 10) Development Rules
- Create a feature branch before changes.
- Run all tests and fix failures before committing.
- Follow TypeScript strictness and ESLint rules; no `any` for public APIs.
- Keep route handlers thin; push logic to utils/services.
- Prefer small, focused components and colocated styles.

### 11) Environment Variables
```
DATABASE_URL=postgresql://postgres:password@db:5432/cms_db?sslmode=disable
JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me
NODE_ENV=production
PORT=3001
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
# Admin bootstrap
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User
```

### 12) Testing
- Backend: Jest + Supertest. Run from `backend`: `npm test`.
- Frontend: Vitest + Testing Library. Run from `frontend`: `npm test`.
- E2E: Playwright from `frontend`.


