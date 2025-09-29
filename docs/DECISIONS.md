# Technical Decisions & Rationale

## Core Technology Choices

### Why Node.js + Express?
**Decision**: Node.js with Express framework for backend

**Rationale**:
- JavaScript everywhere reduces context switching
- Large ecosystem of packages and middleware
- Non-blocking I/O ideal for CMS workloads
- Easy to find developers
- Good performance for I/O-heavy operations

**Alternatives Considered**:
- Go: Better performance but smaller ecosystem
- Python/Django: Good but team prefers JavaScript
- .NET Core: Excellent but different ecosystem

---

### Why PostgreSQL?
**Decision**: PostgreSQL as primary database

**Rationale**:
- JSONB support for flexible content schemas
- Robust indexing capabilities
- ACID compliance for data integrity
- Excellent performance at scale
- Multi-domain support via schemas/partitioning

**Alternatives Considered**:
- MongoDB: No ACID, eventual consistency issues
- MySQL: Limited JSON support
- SQLite: Not suitable for production scale

---

### Why React + Vite?
**Decision**: React with Vite for frontend

**Rationale**:
- React's component model fits CMS UI needs
- Vite's fast HMR improves developer experience
- Large ecosystem of UI libraries
- Good TypeScript support
- Easy to test with Testing Library

**Alternatives Considered**:
- Next.js: Overkill for admin panel
- Vue.js: Smaller ecosystem
- Angular: Too heavyweight for requirements

---

## Architecture Decisions

### Monorepo Structure
**Decision**: Single repository with npm workspaces

**Rationale**:
- Shared types between frontend and backend
- Atomic commits across stack
- Simplified dependency management
- Easier to maintain consistency

**Trade-offs**:
- Larger repository size
- Can't scale teams independently
- All developers need full stack access

---

### REST vs GraphQL
**Decision**: REST API architecture

**Rationale**:
- Simpler to implement and maintain
- Better caching strategies
- Predictable performance characteristics
- Easier to debug and monitor

**Trade-offs**:
- Over/under-fetching issues
- Multiple requests for related data
- No built-in schema documentation

**Future Consideration**:
May add GraphQL layer when complexity justifies it

---

### JWT Authentication
**Decision**: JWT with access/refresh token pattern

**Rationale**:
- Stateless authentication scales well
- Refresh tokens provide security + UX balance
- Works well with SPAs
- Standard implementation pattern

**Implementation Details**:
- Access token: 15 minutes
- Refresh token: 7 days
- Stored in httpOnly cookies (future)

---

## Database Design Decisions

### Domain Isolation Strategy
**Decision**: Foreign key based multi-tenancy

**Rationale**:
- Simpler than separate databases
- Easier backup and maintenance
- Can share data across domains if needed
- Single connection pool

**Trade-offs**:
- Must remember to filter by domain_id
- Risk of data leakage if not careful
- Can't scale domains independently

---

### JSONB for Flexible Content
**Decision**: Use JSONB for pages.data and template schemas

**Rationale**:
- Flexibility for custom fields
- No schema migrations for content changes
- Can index JSONB fields if needed
- Good query performance with GIN indexes

**Trade-offs**:
- Less type safety
- More complex queries
- Need application-level validation

---

### No ORM
**Decision**: Raw SQL queries with pg library

**Rationale**:
- Full control over query optimization
- No ORM abstraction overhead
- Easier to debug performance issues
- Team knows SQL well

**Trade-offs**:
- More boilerplate code
- Manual query building
- No automatic migrations

---

## Frontend Architecture Decisions

### State Management Split
**Decision**: React Query for server state, Zustand for client state

**Rationale**:
- React Query handles caching, sync, and updates
- Zustand is lightweight for auth/UI state
- Clear separation of concerns
- Minimal boilerplate

**Alternatives Considered**:
- Redux: Too much boilerplate
- Context API only: Performance issues
- MobX: Team unfamiliar

---

### Tailwind CSS
**Decision**: Tailwind for styling

**Rationale**:
- Rapid prototyping
- Consistent design system
- Small bundle size with PurgeCSS
- Good IDE support

**Trade-offs**:
- Verbose className strings
- Learning curve for team
- Hard to do complex animations

---

### Form Handling
**Decision**: React Hook Form with Joi validation

**Rationale**:
- Minimal re-renders
- Built-in validation
- Good TypeScript support
- Works well with controlled/uncontrolled inputs

**Alternatives Considered**:
- Formik: More complex, larger bundle
- Native forms: Too much manual work
- React Final Form: Less popular

---

## Security Decisions

### Input Validation Strategy
**Decision**: Joi schemas at API boundary

**Rationale**:
- Single source of truth for validation
- Declarative schema definition
- Good error messages
- Can generate documentation from schemas

**Implementation**:
- Validate all mutable operations
- Sanitize HTML content
- Parameterized SQL queries

---

### Rate Limiting Approach
**Decision**: Express-rate-limit with different tiers

**Rationale**:
- Simple to implement
- Memory-based for MVP
- Can upgrade to Redis later
- Flexible configuration

**Limits Set**:
- Auth: 5/min (prevent brute force)
- Upload: 10/min (prevent abuse)
- API: 100/min (normal usage)

---

## Development Process Decisions

### TypeScript Everywhere
**Decision**: TypeScript for both frontend and backend

**Rationale**:
- Catch errors at compile time
- Better IDE support
- Self-documenting code
- Easier refactoring

**Trade-offs**:
- Longer initial development
- Build step required
- Learning curve for team

---

### Testing Strategy
**Decision**: Jest for backend, Vitest for frontend

**Rationale**:
- Jest is standard for Node.js
- Vitest is faster for Vite projects
- Similar APIs reduce cognitive load
- Good coverage reporting

**Coverage Goals**:
- Critical paths: 90%
- Utilities: 100%
- UI Components: 70%
- Overall: 80%

---

## Deployment Decisions

### Docker for Everything
**Decision**: Docker containers for all services

**Rationale**:
- Consistent environments
- Easy local development
- Simplified deployment
- Good for microservices migration

**Trade-offs**:
- Additional complexity
- Resource overhead
- Docker knowledge required

---

### Single Container Deployment
**Decision**: Deploy frontend and backend in one container for MVP

**Rationale**:
- Simpler deployment
- Lower hosting costs
- Easier to manage
- Good enough for current scale

**Future Plan**:
- Separate when traffic justifies
- Add CDN for static assets
- Implement horizontal scaling

---

## Deferred Decisions

### Search Technology
**Current**: Basic SQL LIKE queries
**Future Options**:
- PostgreSQL full-text search
- Elasticsearch
- Algolia
- Typesense

**Waiting For**:
- User feedback on search needs
- Content volume to justify complexity

---

### File Storage
**Current**: Local filesystem
**Future Options**:
- AWS S3
- Cloudinary
- Digital Ocean Spaces
- Azure Blob Storage

**Waiting For**:
- Scale requirements
- Backup needs
- CDN requirements

---

### Monitoring Stack
**Current**: Console logging
**Future Options**:
- ELK Stack
- Datadog
- New Relic
- Prometheus + Grafana

**Waiting For**:
- Production deployment
- Performance baselines
- Budget approval

---

## Lessons Learned

### What Worked Well
1. TypeScript from day one
2. Monorepo structure
3. Docker development environment
4. Joi validation
5. React Query for data fetching

### What We'd Do Differently
1. Add monitoring from the start
2. Implement versioning earlier
3. Better error handling strategy
4. API documentation from day one
5. More integration tests

### Technical Debt Addressed
1. ✓ Implemented content versioning system
2. No caching layer
3. Limited error tracking
4. No comprehensive API documentation
5. No performance monitoring

## Multi-Agent Architectural Decisions

### CV-003: Version Management Service
**Decision**: Develop enterprise-grade versioning service with advanced security and performance

**Multi-Agent Design Approach**:
1. **PX Agent**: User experience optimization
2. **Tech Architect**: System design
3. **DB Advisor**: Database performance
4. **Security Advisor**: Threat modeling
5. **Performance Optimizers**: Caching and query strategies

**Key Architectural Choices**:
- Event-driven architecture
- JWT token-based site isolation
- Intelligent caching layer
- Comprehensive audit logging

**Performance Targets**:
- Version creation: <100ms
- Version publishing: <500ms
- Cache hit ratio: >85%

### CV-006: Preview Token System
**Decision**: Implement cryptographically secure, multi-domain preview mechanism

**Design Considerations**:
- JWT+AES hybrid encryption
- Fine-grained access controls
- Site-specific token restrictions
- Performance-optimized validation

**Architectural Innovation**:
- Partitioned analytics tables
- Sub-50ms token validation
- Comprehensive preview interaction tracking

## Content Versioning Decision

### Strategic Rationale
**Decision**: Implement comprehensive content versioning system with granular control

**Key Drivers**:
- Enable collaborative content editing
- Support complex publishing workflows
- Maintain complete content history
- Provide secure content preview mechanisms

**Implementation Strategy**:
- Separate versioning tables from main content
- Use JSONB for flexible metadata storage
- Implement role-based access controls
- Support multiple content types (posts, pages)

### Design Philosophy
1. **Complete Historical Tracking**
   - Every content change is a new version
   - Preserves full editing context
   - Supports rollback and comparison

2. **Secure Previewing**
   - Time-limited preview tokens
   - IP and password restrictions
   - Granular access control

3. **Collaborative Workflow**
   - Inline and general comments
   - Review and approval tracking
   - Multiple comment types (suggestions, issues)

**Trade-offs Considered**:
- Increased database complexity
- Higher storage requirements
- More complex query patterns

**Alternatives Evaluated**:
- Simple revision tracking
- Git-like versioning system
- External version control integration

**Chosen Solution Benefits**:
- Native database implementation
- Full PostgreSQL feature utilization
- Tight integration with existing ORM
- Minimal external dependencies