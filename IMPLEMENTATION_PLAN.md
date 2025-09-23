# Domain-Specific Menu System Implementation Plan

## Feature Overview
Implement hierarchical navigation menus for each domain with drag-and-drop management interface.

## Critical Security BLOCKERs (MUST be addressed first)

### Phase 0: Security Foundation (BLOCKER - Must complete before any other work)

#### TICKET-SEC-001: CSRF Protection Implementation
**Priority: BLOCKER**
**Dependencies: None**
**Estimated: 4 hours**

Tasks:
1. Implement double-submit cookie pattern in backend middleware
2. Add CSRF token generation on session creation
3. Validate CSRF tokens on all state-changing operations
4. Add CSRF token to all frontend API calls
5. Test CSRF protection across all endpoints

Files to modify:
- `backend/src/middleware/csrf.ts` (new)
- `backend/src/middleware/auth.ts` (update)
- `frontend/src/api/client.ts` (update)

#### TICKET-SEC-002: XSS Protection for Menu Labels
**Priority: BLOCKER**
**Dependencies: None**
**Estimated: 3 hours**

Tasks:
1. Install and configure DOMPurify for frontend sanitization
2. Create sanitization utility for backend
3. Sanitize all menu labels on input (backend)
4. Sanitize all menu labels on display (frontend)
5. Add XSS test cases

Files to modify:
- `backend/src/utils/sanitizer.ts` (new)
- `frontend/src/utils/sanitizer.ts` (new)
- All menu-related components and API endpoints

#### TICKET-SEC-003: SQL Injection Prevention
**Priority: BLOCKER**
**Dependencies: None**
**Estimated: 2 hours**

Tasks:
1. Audit all database queries for parameterization
2. Create query builder utilities for menu operations
3. Add SQL injection tests
4. Document secure query patterns

Files to modify:
- `backend/src/db/menuQueries.ts` (new)
- Update all existing queries to use parameterized queries

#### TICKET-SEC-004: URL Validation
**Priority: BLOCKER**
**Dependencies: None**
**Estimated: 2 hours**

Tasks:
1. Implement URL validation utility
2. Validate all external URLs (protocol, domain whitelist option)
3. Validate internal page references
4. Add URL validation tests

Files to modify:
- `backend/src/utils/urlValidator.ts` (new)
- `backend/src/routes/menus.ts` (will create in Phase 1)

#### TICKET-SEC-005: Rate Limiting for Menu Operations
**Priority: BLOCKER**
**Dependencies: TICKET-SEC-001**
**Estimated: 2 hours**

Tasks:
1. Implement rate limiting middleware for menu endpoints
2. Configure limits: 10 updates per minute per user
3. Add rate limit headers to responses
4. Test rate limiting

Files to modify:
- `backend/src/middleware/rateLimit.ts` (update/create)
- Apply to menu routes

## Phase 1: Database & Backend Foundation

#### TICKET-DB-001: Database Schema with Safety Constraints
**Priority: HIGH**
**Dependencies: Phase 0 complete**
**Estimated: 3 hours**

Tasks:
1. Create migration for menu_items table
2. Add CHECK constraint for circular reference prevention
3. Add indexes for performance:
   - (domain_id, parent_id)
   - (domain_id, position)
   - (page_id)
4. Add compound unique constraint (domain_id, parent_id, position)
5. Create recursive CTE functions for hierarchy queries
6. Add depth limiting function (max 3 levels)

Files to create:
- `backend/migrations/004_create_menu_items.sql`
- `backend/src/db/menuQueries.ts`

#### TICKET-BE-001: Menu API Endpoints
**Priority: HIGH**
**Dependencies: TICKET-DB-001, Phase 0 complete**
**Estimated: 6 hours**

Tasks:
1. Create menu routes with CRUD operations
2. Implement hierarchical menu fetching with CTEs
3. Add menu reordering endpoint
4. Implement batch operations for efficiency
5. Add optimistic locking for concurrent edits
6. Integrate all security measures from Phase 0

Files to create:
- `backend/src/routes/menus.ts`
- `backend/src/controllers/menuController.ts`
- `backend/src/__tests__/routes/menus.test.ts`

## Phase 2: Caching Layer

#### TICKET-CACHE-001: Redis Integration for Menu Caching
**Priority: MEDIUM**
**Dependencies: TICKET-BE-001**
**Estimated: 4 hours**

Tasks:
1. Set up Redis connection with error handling
2. Implement menu cache service (5-minute TTL)
3. Add cache invalidation on menu updates
4. Add cache warming on startup
5. Add fallback to database on cache miss

Files to create:
- `backend/src/services/cacheService.ts`
- `backend/src/config/redis.ts`
- Update docker-compose.yml for Redis

## Phase 3: Frontend Implementation

#### TICKET-FE-001: Menu Data Management with React Query
**Priority: HIGH**
**Dependencies: TICKET-BE-001**
**Estimated: 4 hours**

Tasks:
1. Create menu API client functions
2. Set up React Query hooks for menu operations
3. Implement optimistic updates
4. Add error recovery
5. Create menu context provider

Files to create:
- `frontend/src/api/menus.ts`
- `frontend/src/hooks/useMenus.ts`
- `frontend/src/context/MenuContext.tsx`

#### TICKET-FE-002: Drag-and-Drop Menu Builder
**Priority: HIGH**
**Dependencies: TICKET-FE-001**
**Estimated: 8 hours**

Tasks:
1. Install and configure @dnd-kit
2. Create DraggableMenuItem component
3. Implement hierarchical drag-and-drop logic
4. Add visual feedback during drag
5. Implement depth limiting (max 3 levels)
6. Add keyboard navigation support
7. Integrate XSS protection for labels

Files to create:
- `frontend/src/components/admin/MenuBuilder.tsx`
- `frontend/src/components/admin/DraggableMenuItem.tsx`
- `frontend/src/components/admin/MenuItemEditor.tsx`
- `frontend/src/pages/admin/MenusPage.tsx`

#### TICKET-FE-003: Menu Preview & Public Display
**Priority: MEDIUM**
**Dependencies: TICKET-FE-002**
**Estimated: 4 hours**

Tasks:
1. Create real-time preview component
2. Update PublicHeader to use domain menus
3. Implement responsive mobile menu
4. Add active state detection
5. Ensure accessibility (ARIA labels, keyboard nav)

Files to modify/create:
- `frontend/src/components/admin/MenuPreview.tsx`
- `frontend/src/components/layout/PublicHeader.tsx` (update)
- `frontend/src/components/layout/MobileMenu.tsx` (new)

## Phase 4: Testing & Validation

#### TICKET-TEST-001: Security Test Suite
**Priority: HIGH**
**Dependencies: Phase 0, 1, 2, 3**
**Estimated: 4 hours**

Tasks:
1. CSRF protection tests
2. XSS prevention tests
3. SQL injection tests
4. URL validation tests
5. Rate limiting tests
6. Authorization tests

Files to create:
- `backend/src/__tests__/security/menuSecurity.test.ts`
- `frontend/src/__tests__/security/menuXSS.test.tsx`

#### TICKET-TEST-002: Integration Tests
**Priority: HIGH**
**Dependencies: TICKET-TEST-001**
**Estimated: 4 hours**

Tasks:
1. End-to-end menu creation flow
2. Drag-and-drop operations
3. Concurrent edit handling
4. Cache invalidation
5. Performance benchmarks

Files to create:
- `e2e/menuManagement.test.ts`
- `backend/src/__tests__/integration/menus.test.ts`

#### TICKET-TEST-003: Accessibility Testing
**Priority: MEDIUM**
**Dependencies: TICKET-FE-003**
**Estimated: 3 hours**

Tasks:
1. Keyboard navigation testing
2. Screen reader compatibility
3. ARIA labels validation
4. Focus management
5. Color contrast checks

## Phase 5: Performance Optimization

#### TICKET-PERF-001: Materialized Paths Implementation
**Priority: LOW**
**Dependencies: TICKET-DB-001**
**Estimated: 4 hours**

Tasks:
1. Add materialized_path column to menu_items
2. Update path on insert/update/move
3. Create indexes on materialized paths
4. Benchmark query performance improvements

#### TICKET-PERF-002: Performance Monitoring
**Priority: LOW**
**Dependencies: All phases**
**Estimated: 2 hours**

Tasks:
1. Add performance metrics collection
2. Monitor query times
3. Track cache hit rates
4. Set up alerting for slow queries

## Rollout Plan

### Stage 1: Security & Foundation (Week 1)
- Complete Phase 0 (all security BLOCKERs)
- Complete Phase 1 (database & backend)
- Deploy to staging for security audit

### Stage 2: Core Functionality (Week 2)
- Complete Phase 2 (caching)
- Complete Phase 3 (frontend)
- Internal testing

### Stage 3: Testing & Optimization (Week 3)
- Complete Phase 4 (testing)
- Complete Phase 5 (performance)
- UAT testing

### Stage 4: Production Rollout
- Feature flag deployment
- Gradual rollout (10% → 50% → 100%)
- Monitor metrics and errors
- Full deployment after 48 hours of stability

## Success Metrics
- Zero security vulnerabilities in penetration testing
- Menu load time < 100ms (cached)
- Menu update time < 500ms
- 100% keyboard navigable
- Zero XSS/CSRF/SQL injection incidents
- Cache hit rate > 90%
- Concurrent edit success rate > 95%

## Dependencies & Risks
- Redis availability for caching (fallback to DB)
- @dnd-kit library compatibility
- Database migration rollback plan needed
- CSRF token storage strategy for SPAs

## Required Reviews
1. Security review after Phase 0
2. Database review after Phase 1
3. UX review after Phase 3
4. Performance review after Phase 5
5. Final security audit before production

## Team Assignments (Suggested)
- Security Engineer: Phase 0 (BLOCKER items)
- Backend Developer: Phase 1, 2
- Frontend Developer: Phase 3
- QA Engineer: Phase 4
- DevOps: Redis setup, monitoring, deployment

---

**CRITICAL**: No work should begin on Phases 1-5 until ALL Phase 0 security BLOCKERs are completed and reviewed by security team.