# EPIC-002: Social Media Distribution System

**Status**: Planning
**Priority**: High
**Estimated Effort**: 18-22 weeks (4.5-5.5 months)
**Target Completion**: Q2-Q3 2025
**Owner**: Product & Engineering Team
**Dependencies**: EPIC-001 (Content Versioning - CV-003, CV-006 completed)

---

## Executive Summary

Enable content creators and social media managers to distribute blog posts to multiple social media platforms (Twitter/X, LinkedIn, Facebook, Instagram, Threads) with AI-assisted content optimization, scheduling capabilities, and performance analytics. This feature transforms DProgres CMS from a standalone content management system into a complete content distribution platform.

### Business Value

- **Time Savings**: Reduce manual posting time by 80% (from ~30 min to ~6 min per post across 3 platforms)
- **Increased Reach**: Enable consistent cross-platform presence, increasing content visibility
- **Content Optimization**: AI-powered platform-specific captions improve engagement
- **Market Differentiation**: Positions DProgres as SaaS-first headless CMS with built-in social distribution

### Success Metrics

- **Adoption**: ≥50% of active users connect at least one platform within 30 days
- **Distribution Success Rate**: ≥95% of scheduled posts successfully distributed
- **User Satisfaction**: ≥4.5/5 rating for distribution feature
- **Time Saved**: Measured reduction in posting workflow time
- **API Performance**: p95 ≤ 300ms for distribution endpoints (background queue processing)

---

## Product Context

### Current State (What Exists)

**Backend Implementation:**
- ✅ `DistributionService.ts` - Webhook-based distribution with retry logic
- ✅ `AiAuthorService.ts` - Basic content adaptation (text truncation, hashtag extraction)
- ✅ Database schema: `publishing_targets`, `publishing_schedules`, `distribution_logs`
- ✅ Distribution queue monitoring API

**Frontend Implementation:**
- ✅ `DistributionQueuePage.tsx` - Monitoring UI for failed/retrying deliveries
- ✅ API services for distribution operations
- ✅ React Query hooks for metrics

**Limitations:**
- ❌ No real platform integrations (Twitter, LinkedIn, Facebook APIs)
- ❌ No OAuth authentication flows
- ❌ No admin UI for managing platform connections
- ❌ No UI in post editor for scheduling distributions
- ❌ No platform-specific content previews
- ❌ No AI-powered multi-LLM content adaptation
- ❌ No analytics dashboard for distribution performance

### Target State (Vision)

A complete social media distribution system where:
1. Users connect social media accounts via OAuth in 3 clicks
2. Post editor has "Share to Social Media" button that opens distribution modal
3. AI generates platform-optimized captions (respecting character limits)
4. Users preview exactly how posts will look on each platform
5. Posts are scheduled or published immediately to multiple platforms
6. Queue monitors all distributions with automatic retry for failures
7. Analytics dashboard shows performance metrics (success rates, cost, engagement)

---

## Technical Architecture

### High-Level Design

```
┌─────────────────┐
│  Post Editor    │
│  (Frontend)     │
└────────┬────────┘
         │ POST /admin/distribution/dispatch
         ▼
┌─────────────────────────────────────────────────────────┐
│  Express API (Backend)                                  │
│  ┌─────────────────┐    ┌──────────────────────┐      │
│  │DistributionRoute│───▶│DistributionService   │      │
│  └─────────────────┘    └──────┬───────────────┘      │
│                                  │                       │
│                    ┌─────────────┴──────────────┐      │
│                    ▼                             ▼       │
│         ┌──────────────────┐         ┌────────────────┐│
│         │  BullMQ Queue    │         │ Multi-LLM Router││
│         │  (Redis)         │         │ (AiAuthor)      ││
│         └────────┬─────────┘         └────────────────┘│
│                  │                                       │
└──────────────────┼───────────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
┌────────────────┐   ┌────────────────┐
│ Platform       │   │ Platform       │
│ Adapter        │   │ Adapter        │
│ (Twitter)      │   │ (LinkedIn)     │
└────────┬───────┘   └────────┬───────┘
         │                    │
         ▼                    ▼
   Twitter API          LinkedIn API
```

### Key Components

#### 1. **Queue System: BullMQ + Redis**
- **Why**: Background processing for async distribution, meets p95 ≤ 300ms API target
- **Performance**: 10+ jobs/second capacity
- **Features**: Priority queues, automatic retry with exponential backoff, dead letter queue
- **Infrastructure**: Requires Redis (HA recommended for production)

#### 2. **OAuth Management**
- **Security**: AES-256-GCM encryption for credentials at rest
- **Architecture**: Separate `platform_connections` table with encrypted tokens
- **Token Refresh**: Automatic background job refreshes tokens 7 days before expiration
- **Multi-Account**: Support multiple accounts per platform per user

#### 3. **Platform Adapters (Strategy Pattern)**
- **Abstract Interface**: `PlatformAdapter` with methods: `authenticate()`, `publish()`, `validate()`, `formatContent()`
- **Implementations**: `TwitterAdapter`, `LinkedInAdapter`, `FacebookAdapter`, `InstagramAdapter`, `ThreadsAdapter`
- **Complexity Tiers**:
  - **Easy (MVP)**: Twitter/X (5/10), LinkedIn (6/10)
  - **Medium (Phase 2)**: Facebook (7/10), Threads (6/10)
  - **Complex (Phase 2)**: Instagram (8/10 - requires Business account, two-step publish)
  - **Difficult (Phase 3)**: TikTok (9/10 - API approval required, video-only)

#### 4. **Multi-LLM AI Router**
- **Primary**: Google Gemini Flash ($0.0001/1k tokens, 800ms latency)
- **Fallback Chain**: GPT-4o Mini → Cohere Command → Claude Haiku
- **Target**: ≤ $0.01 per distribution
- **Features**:
  - Platform-specific caption optimization (character limits, tone, hashtags)
  - Content variation generation (A/B testing support)
  - Cost tracking per LLM call with monthly budgets
  - Fallback to simple truncation if AI unavailable

### Database Schema Changes

#### New Tables

```sql
-- OAuth credentials (encrypted)
CREATE TABLE platform_connections (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'twitter', 'linkedin', 'facebook', etc.
  account_identifier VARCHAR(255), -- @username or account name
  encrypted_credentials BYTEA NOT NULL, -- AES-256-GCM encrypted JSON
  token_expires_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'revoked', 'error'
  last_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id, platform, account_identifier)
);
CREATE INDEX idx_platform_connections_site ON platform_connections(site_id);
CREATE INDEX idx_platform_connections_status ON platform_connections(status);

-- Rate limit tracking per site per platform
CREATE TABLE rate_limit_tracking (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  platform VARCHAR(50) NOT NULL,
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  requests_count INTEGER DEFAULT 0,
  limit_max INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id, platform, window_start)
);
CREATE INDEX idx_rate_limit_site_platform ON rate_limit_tracking(site_id, platform, window_end);

-- AI usage tracking for cost analysis (partitioned by month)
CREATE TABLE ai_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  user_id INTEGER,
  provider VARCHAR(50) NOT NULL, -- 'gemini', 'openai', 'cohere', 'anthropic'
  model VARCHAR(100) NOT NULL,
  operation VARCHAR(50) NOT NULL, -- 'caption', 'hashtags', 'variation'
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC(10, 6),
  latency_ms INTEGER,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (created_at);
-- Create monthly partitions
CREATE TABLE ai_usage_logs_2025_01 PARTITION OF ai_usage_logs FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
-- ... (script to auto-create partitions)

-- Aggregated distribution analytics (updated hourly via background job)
CREATE TABLE distribution_analytics (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  platform VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  total_distributed INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  retried INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10, 4) DEFAULT 0,
  avg_processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id, platform, date)
);
CREATE INDEX idx_distribution_analytics_site_date ON distribution_analytics(site_id, date);
```

#### Modified Tables

```sql
-- Add site_id and connection_id to existing tables
ALTER TABLE publishing_targets
  ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  ADD COLUMN connection_id INTEGER REFERENCES platform_connections(id) ON DELETE SET NULL;

ALTER TABLE publishing_schedules
  ADD COLUMN connection_id INTEGER REFERENCES platform_connections(id) ON DELETE SET NULL;

-- Enhance distribution_logs with AI and platform metadata
ALTER TABLE distribution_logs
  ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  ADD COLUMN ai_adapted BOOLEAN DEFAULT false,
  ADD COLUMN ai_cost_usd NUMERIC(10, 6),
  ADD COLUMN platform_post_id VARCHAR(255), -- ID returned by platform API
  ADD COLUMN platform_url TEXT; -- Direct link to post on platform

-- Add indexes for performance
CREATE INDEX idx_publishing_targets_site ON publishing_targets(site_id);
CREATE INDEX idx_publishing_schedules_site_status ON publishing_schedules(site_id, status);
CREATE INDEX idx_distribution_logs_site_status ON distribution_logs(site_id, status, created_at);
```

### API Endpoints

#### Platform Connection Management

```typescript
// OAuth Flows
POST   /api/admin/distribution/platforms/:platform/connect
       → Initiate OAuth flow, redirect to platform
GET    /api/admin/distribution/platforms/:platform/callback
       → Handle OAuth callback, exchange code for token

// Connection CRUD
GET    /api/admin/distribution/connections
       → List all connected platforms for current site
GET    /api/admin/distribution/connections/:id
       → Get single connection details
PUT    /api/admin/distribution/connections/:id/refresh
       → Manually refresh OAuth token
DELETE /api/admin/distribution/connections/:id
       → Disconnect platform (revoke token)

// Connection Health
POST   /api/admin/distribution/connections/:id/test
       → Test connection with lightweight API call
```

#### Distribution Operations

```typescript
// Scheduling & Publishing
POST   /api/admin/distribution/dispatch
       Body: { postId, connectionIds[], scheduledFor?, options? }
       → Schedule distribution to multiple platforms

POST   /api/admin/distribution/schedules/:id/dispatch
       → Manually dispatch a pending schedule

DELETE /api/admin/distribution/schedules/:id
       → Cancel a scheduled distribution

// Queue Management
GET    /api/admin/distribution/queue
       Query: { status?, platform?, limit? }
       → List queued/failed distributions

POST   /api/admin/distribution/logs/:id/retry
       → Manually retry a failed distribution

POST   /api/admin/distribution/logs/:id/feedback
       Body: { feedback: {} }
       → Submit feedback for AI retraining
```

#### Analytics

```typescript
GET    /api/admin/distribution/analytics
       Query: { startDate?, endDate?, platform?, postId? }
       → Get distribution performance metrics

GET    /api/admin/distribution/analytics/cost
       Query: { startDate?, endDate? }
       → Get AI cost breakdown by provider/model
```

---

## Product Experience (UX)

### User Personas

**1. Content Creator Casey** (Primary)
- 25-40 years old, writes 2-5 blog posts per week
- **Goal**: Share content without repetitive manual work
- **Pain Point**: Manually copying/pasting to each platform, forgetting to share
- **Need**: Simple, fast distribution with AI help

**2. Social Media Manager Sam** (Primary)
- 28-45 years old, manages 5-10 brand accounts
- **Goal**: Centralized dashboard for all distribution
- **Pain Point**: Switching between platforms, missing failed posts
- **Need**: Robust monitoring, bulk actions, detailed analytics

**3. Marketing Director Morgan** (Secondary)
- 35-55 years old, oversees content strategy
- **Goal**: Understand platform ROI, optimize budget
- **Pain Point**: No visibility into distribution performance
- **Need**: Clear analytics, exportable reports

### Key User Flows

#### Flow 1: Connect Platform (OAuth)
1. User navigates to **Admin > Distribution > Platforms**
2. Clicks **"Add Platform"** button
3. Selects platform from grid (Twitter, LinkedIn, Facebook, etc.)
4. Clicks **"Connect"** → Redirected to platform's OAuth page
5. Grants permissions on platform site
6. Redirected back to CMS → Success message
7. Platform appears in active connections list

**Error Handling**:
- User denies permissions → Clear message with retry option
- OAuth token exchange fails → Log error, show retry button
- Platform API down → Show status link, suggest retry later

#### Flow 2: Schedule Distribution from Post Editor
1. User viewing published post in editor
2. Clicks **"Share to Social Media"** button in toolbar
3. **Distribution modal opens** with platform selection
4. Selects one or more connected platforms (checkboxes)
5. **AI generates platform-specific previews** (3-5 seconds loading)
6. Reviews AI captions, hashtags, character counts
7. Optionally edits captions or clicks **"Regenerate"**
8. Selects schedule time (immediate or future date/time)
9. Clicks **"Schedule Posts"** or **"Publish Now"**
10. Success confirmation with link to queue

**Error Handling**:
- No platforms connected → Empty state with "Connect Platform" CTA
- Caption exceeds limit → Red border, "Auto-shorten" button
- Platform disconnected → Inline "Reconnect" button
- API failure → Error message with retry, save as draft option

#### Flow 3: Monitor Distribution Queue
1. User navigates to **Admin > Distribution > Queue**
2. Sees summary metrics: Pending, Sent, Failed, Retrying counts
3. Views list of queued/failed items (table on desktop, cards on mobile)
4. Filters by status or platform
5. Clicks failed item to see error details
6. Reviews error message and suggested fixes
7. Clicks **"Retry Now"** button
8. System re-attempts distribution
9. Status updates in real-time (success or new error)

**Error Handling**:
- Retry fails again → Increment retry count, suggest manual intervention
- OAuth token expired → Clear message with "Reconnect" button
- Platform rate limit → Show next auto-retry time

#### Flow 4: View Analytics Dashboard
1. User navigates to **Admin > Distribution > Analytics**
2. Selects date range (last 7/30/90 days or custom)
3. Views channel performance bar chart (sent/failed by platform)
4. Reviews recent deliveries timeline
5. Clicks platform name to filter to single platform
6. Exports report as CSV or PDF

### UI Components (New)

**1. PlatformConnectionCard** (`components/distribution/PlatformConnectionCard.tsx`)
- Platform logo (64x64px), name, status badge (green/gray/red dot)
- Last used timestamp, actions menu (Edit, Reconnect, Delete)
- States: Connected (green border), Disconnected (gray), Error (red)
- Responsive: 300px min-width, stacks vertically on mobile

**2. DistributionModal** (`components/distribution/DistributionModal.tsx`)
- 800px wide modal (90vw max on mobile)
- Platform selection checkboxes (2-column grid)
- AI preview cards (expandable accordion per platform)
- Schedule options (radio buttons + date/time picker)
- Footer actions (Cancel, Save Draft, Schedule)

**3. PlatformPreview** (`components/distribution/PlatformPreview.tsx`)
- Accordion item with platform logo, name, character counter
- Mock platform UI showing how post will appear
- Editable caption textarea with live character count
- Hashtag pills (deletable, editable)
- "Regenerate" button for AI refresh

**4. QueueItemCard** (`components/distribution/QueueItemCard.tsx`)
- Post title, platform icon, status badge
- Timestamp, error message (if failed)
- Action buttons: Retry, Edit, Cancel, View Details
- Responsive: Card layout on mobile, table row on desktop

**5. ChannelPerformanceChart** (`components/distribution/ChannelPerformanceChart.tsx`)
- Horizontal bar chart showing sent/failed counts per platform
- Accessible color palette with patterns for color-blind users
- "View Data Table" toggle for screen readers
- Responsive: Stacks bars vertically on mobile

**6. CharacterCounter** (`components/distribution/CharacterCounter.tsx`)
- Displays "X/Y" with dynamic color: green (<70%), yellow (70-90%), red (>90%)
- Announces changes to screen readers via `aria-live`

### Accessibility (WCAG 2.2 AA Compliance)

- **Contrast**: Text 4.5:1 ratio (3:1 for large text), UI components 3:1 ratio
- **Keyboard Navigation**: Tab order logical, modal focus trap, Esc to close
- **Focus Visible**: Custom 2px focus rings on all interactive elements
- **Touch Targets**: Minimum 44x44px for mobile
- **Screen Readers**: All images have alt text, status changes announced via `aria-live`
- **Error Messages**: Clear text descriptions, never rely on color alone
- **Reduced Motion**: Respect `prefers-reduced-motion`, disable animations

---

## Implementation Plan

### Phase 1: MVP (6 weeks) - Twitter + LinkedIn

**Goal**: Ship basic distribution to 2 platforms with manual content editing

**Scope**:
- ✅ Platform connections: Twitter, LinkedIn (OAuth 2.0 flows)
- ✅ Distribution modal in post editor (no AI yet, manual captions)
- ✅ BullMQ queue system with retry logic
- ✅ Basic analytics (success/failure counts)
- ✅ Queue monitoring UI enhancements
- ❌ No AI content adaptation (use post excerpt as fallback)
- ❌ No media uploads (text-only posts)

**Deliverables**:
- Database migrations (4 new tables, 3 modified tables)
- BullMQ setup with Redis
- OAuth service for Twitter & LinkedIn
- Platform adapters: `TwitterAdapter`, `LinkedInAdapter`
- Queue workers: `DispatchWorker`, `ScheduledPublishWorker`
- API endpoints (8 new routes)
- Frontend: Platform connections page, distribution modal (basic)
- Tests: Integration tests with mock platform APIs
- Documentation: Setup guide, platform connection docs

**Tickets**: SD-001 through SD-013 (13 tickets)

---

### Phase 2: Full Platform Support + AI (8 weeks)

**Goal**: Add Facebook, Instagram, Threads + Multi-LLM AI content adaptation

**Scope**:
- ✅ Platform connections: Facebook, Instagram, Threads
- ✅ Multi-LLM AI router (Gemini, GPT-4o, Cohere, Claude)
- ✅ AI-generated captions and hashtags per platform
- ✅ Media upload handling (images, aspect ratio validation)
- ✅ Advanced analytics (engagement metrics, cost tracking)
- ✅ Scheduled publishing with optimal time suggestions
- ❌ No video content yet
- ❌ No A/B testing

**Deliverables**:
- OAuth implementations: Facebook, Instagram (multi-step), Threads
- Platform adapters: `FacebookAdapter`, `InstagramAdapter`, `ThreadsAdapter`
- Multi-LLM router service with cost tracking
- Media upload service (image resizing, platform-specific validation)
- Enhanced distribution modal with AI previews
- Analytics dashboard with charts
- Tests: AI adapter tests, media upload tests
- Documentation: AI configuration guide, media requirements

**Tickets**: SD-014 through SD-026 (13 tickets)

---

### Phase 3: Enterprise Features (4-6 weeks)

**Goal**: Bulk operations, A/B testing, advanced monitoring

**Scope**:
- ✅ Bulk distribution (schedule to multiple posts at once)
- ✅ A/B testing framework (test different captions)
- ✅ Webhook notifications for distribution events
- ✅ Queue monitoring dashboard with real-time updates
- ✅ Platform: TikTok (optional - requires API approval)
- ✅ Video content support (TikTok, Instagram Reels, YouTube Shorts)

**Deliverables**:
- Bulk distribution UI and API
- A/B testing service with variant tracking
- Webhook system for external integrations
- Enhanced queue monitoring with WebSocket updates
- Video handling service (if TikTok/video platforms included)
- Tests: Bulk operations tests, webhook tests
- Documentation: Webhook integration guide, A/B testing guide

**Tickets**: SD-027 through SD-038 (12 tickets)

---

## Risk Assessment

### High-Severity Risks ⚠️

**1. Platform API Changes Breaking Integrations**
- **Impact**: Features stop working, user frustration
- **Probability**: HIGH (platforms change APIs 2-3x per year)
- **Mitigation**:
  - Use versioned API endpoints (e.g., Twitter API v2, LinkedIn API v2)
  - Implement adapter pattern for easy updates
  - Subscribe to platform developer newsletters
  - Monitor platform status pages
  - Quarterly review of integrations
- **Contingency**: Fallback to webhook mode if platform API breaks

**2. OAuth Token Security Breach**
- **Impact**: CRITICAL - User account access compromised
- **Probability**: LOW (if implemented correctly)
- **Mitigation**:
  - AES-256-GCM encryption for credentials at rest
  - Never log or expose tokens in API responses/errors
  - Implement key rotation every 90 days
  - Audit logging for all credential access
  - Rate limiting on connection endpoints
- **Contingency**: Emergency token revocation process, user notification system

**3. Platform Account Bans from API Abuse**
- **Impact**: HIGH - Platform connections break, distribution fails
- **Probability**: MEDIUM (if rate limits not respected)
- **Mitigation**:
  - Conservative rate limits (50% of platform limits)
  - Per-site rate limit tracking
  - Queue delays to spread load
  - Clear documentation of platform ToS
  - User education on best practices
- **Contingency**: Appeal process documentation, alternative platform support

**4. AI Cost Overruns**
- **Impact**: MEDIUM - Higher operating costs than budgeted
- **Probability**: MEDIUM (AI usage hard to predict)
- **Mitigation**:
  - Use cheapest LLM as default (Gemini Flash)
  - Per-site monthly budgets with alerts
  - Caching of AI-generated content (7-day TTL)
  - Fallback to simple truncation when budget exceeded
  - Cost monitoring dashboard
- **Contingency**: Disable AI features temporarily, increase budget, optimize prompts

### Medium-Severity Risks ⚠️

**5. Queue Downtime from Redis Failure**
- **Impact**: MEDIUM - Distributions paused until Redis recovers
- **Probability**: LOW (with HA setup)
- **Mitigation**:
  - Redis HA with automatic failover
  - Dead letter queue for failed jobs
  - Monitoring and alerting on queue health
  - Regular backups of queue state
- **Contingency**: Graceful degradation to synchronous dispatch, manual retry after recovery

**6. Instagram Business Account Requirement Confusion**
- **Impact**: MEDIUM - Users frustrated by complex setup
- **Probability**: HIGH (Instagram API requires Business accounts)
- **Mitigation**:
  - Clear onboarding documentation with screenshots
  - In-app setup wizard for Instagram
  - Validation before OAuth flow (check account type)
  - Help articles and video tutorials
- **Contingency**: Dedicated support flow for Instagram setup issues

**7. Character Limit Validation Inaccuracies**
- **Impact**: LOW-MEDIUM - Posts fail on platform with "too long" errors
- **Probability**: MEDIUM (platform limits change)
- **Mitigation**:
  - Configuration file for platform limits (easy to update)
  - Pre-validation before queue dispatch
  - Clear error messages with exact character count
  - Automatic "Auto-shorten" feature
- **Contingency**: Manual user editing, documentation of current limits

---

## Dependencies

### External Dependencies
- **Redis**: Required for BullMQ queue system (must install Redis 6.2+ on server or use managed service like Upstash)
- **Platform APIs**: Twitter API v2, LinkedIn API v2, Facebook Graph API, Instagram Graph API, Threads API
- **LLM APIs**: Google Gemini (primary), OpenAI (fallback), Cohere (fallback), Anthropic (fallback)

### Internal Dependencies
- **EPIC-001 (CV-003)**: VersionService - Used for draft preview links in distributions
- **EPIC-001 (CV-006)**: PreviewService - Generate short preview URLs for social posts
- **User Authentication**: JWT middleware, role-based permissions
- **Multi-Tenant Architecture**: Site isolation, organization/project hierarchy

### Infrastructure Requirements
- **Redis Server**: 512MB RAM minimum (1GB recommended for production)
- **Disk Space**: +2GB for queue data and logs
- **Network**: Outbound HTTPS access to platform APIs (whitelist if firewall)
- **Environment Variables**: 20+ new env vars (API keys, secrets, Redis connection)

---

## Testing Strategy

### Unit Tests (Jest)
- **Services**: DistributionService, PlatformAdapters, MultiLLMRouter, OAuthService
- **Database**: CRUD operations for new tables
- **Utilities**: Encryption/decryption, token refresh logic
- **Target**: 85% code coverage

### Integration Tests (Jest + Supertest)
- **API Endpoints**: All 8 new distribution routes
- **OAuth Flows**: Mock platform OAuth callbacks
- **Queue Processing**: BullMQ job execution
- **Database Transactions**: Multi-table operations
- **Target**: All happy paths + error scenarios covered

### E2E Tests (Playwright)
- **Platform Connection Flow**: OAuth (with mock platform)
- **Distribution Scheduling**: Post editor → modal → queue
- **Queue Monitoring**: View, filter, retry failed items
- **Analytics Dashboard**: View charts, export data
- **Target**: Critical user journeys automated

### Manual Testing (Required Before Release)
- **Real Platform Integration**: Test with actual Twitter, LinkedIn accounts
- **OAuth Flows**: Verify each platform's OAuth works end-to-end
- **Rate Limiting**: Confirm rate limits enforced correctly
- **AI Content Quality**: Review AI-generated captions for quality
- **Performance**: Load testing with 100+ concurrent distributions

---

## Documentation Requirements

### User Documentation
- **Setup Guide**: How to connect first platform (with screenshots)
- **Platform-Specific Guides**: Twitter setup, LinkedIn setup, Instagram setup (Business account requirement)
- **Distribution Tutorial**: Scheduling posts from editor
- **Queue Monitoring Guide**: Understanding statuses, retrying failures
- **Analytics Guide**: Interpreting metrics, exporting reports
- **Troubleshooting**: Common errors and solutions

### Developer Documentation
- **Architecture Overview**: System design, component interactions
- **Platform Adapter Guide**: How to add new platforms
- **API Reference**: Endpoint specifications, request/response schemas
- **Database Schema**: ERD with relationships, migration scripts
- **Configuration Guide**: Environment variables, Redis setup
- **Testing Guide**: Running tests, writing new tests

### Operational Documentation
- **Deployment Guide**: Infrastructure setup, Redis configuration
- **Monitoring Guide**: Key metrics, alerting thresholds
- **Incident Response**: Common issues and fixes
- **Backup & Recovery**: Queue state backup, database migration rollback

---

## Success Criteria

### Phase 1 MVP (Twitter + LinkedIn)
- [ ] Users can connect Twitter and LinkedIn accounts via OAuth
- [ ] Users can schedule distributions from post editor
- [ ] 95%+ distribution success rate for Twitter and LinkedIn
- [ ] API response time p95 ≤ 300ms (queue operations in background)
- [ ] Queue monitoring shows all pending/sent/failed distributions
- [ ] Manual retry works for failed distributions
- [ ] Basic analytics show success/failure counts per platform

### Phase 2 Full Platform Support + AI
- [ ] Users can connect Facebook, Instagram, Threads
- [ ] AI generates platform-optimized captions in <3 seconds
- [ ] Character limits validated per platform with auto-shorten
- [ ] Media uploads work with correct aspect ratios per platform
- [ ] AI cost ≤ $0.01 per distribution (average)
- [ ] Advanced analytics show engagement metrics and cost breakdown
- [ ] Scheduled publishing executes at correct times (within 2-minute window)

### Phase 3 Enterprise Features
- [ ] Bulk distribution to 10+ posts works without performance degradation
- [ ] A/B testing tracks variant performance
- [ ] Webhook notifications deliver successfully to external systems
- [ ] Queue monitoring updates in real-time (<5 second latency)
- [ ] Video content distributes to TikTok/Instagram Reels (if in scope)

---

## Open Questions for Product Team

1. **Platform Priority**: Confirm Twitter, LinkedIn for MVP; defer Instagram to Phase 2 due to complexity?
2. **Multiple Accounts**: Support multiple accounts per platform (e.g., personal + brand Twitter)?
   - Recommendation: YES - critical for social media managers
3. **AI Default**: Should AI caption generation be ON by default or opt-in?
   - Recommendation: Default ON with easy toggle, fallback to excerpt
4. **Character Limit Handling**: Auto-truncate or require manual editing when over limit?
   - Recommendation: Show error + "Auto-shorten" button (user control)
5. **Platform Permissions**: Minimum OAuth scopes needed (e.g., Twitter read+write vs full access)?
   - Recommendation: Minimal scopes (post creation only, no DM or profile edit)
6. **Analytics Scope**: MVP basic counts or include engagement metrics (likes, shares, clicks)?
   - Recommendation: MVP counts only, Phase 2 engagement (requires additional OAuth scopes)
7. **TikTok Priority**: Worth API approval effort or defer indefinitely?
   - Recommendation: Phase 3 optional - requires API approval (3-6 months), video-only, niche use case
8. **Cost Transparency**: Show AI cost estimate before generating?
   - Recommendation: YES - show estimated cost in modal (e.g., "$0.008 per distribution")

---

## Appendix: Related Documents

- **Product Experience Spec**: [PX Specification from agent output] (detailed UX flows, wireframes, microcopy)
- **Technical Architecture Spec**: `docs/SOCIAL_MEDIA_DISTRIBUTION_TECH_SPEC.md` (76 pages)
- **Technical Summary**: `docs/SOCIAL_MEDIA_DISTRIBUTION_SUMMARY.md` (executive overview)
- **Current Implementation**: `backend/src/services/DistributionService.ts`, `backend/src/services/AiAuthorService.ts`
- **Database Schema**: `backend/src/db/migrations/004_distribution_infrastructure.sql`

---

## Timeline & Milestones

| Phase | Duration | Start Date | End Date | Key Deliverables |
|-------|----------|------------|----------|------------------|
| **Planning & Design** | 2 weeks | Week 1 | Week 2 | EPIC approved, tickets created, tech spec finalized |
| **Phase 1: MVP** | 6 weeks | Week 3 | Week 8 | Twitter + LinkedIn integration, basic queue |
| **Phase 1: Testing** | 1 week | Week 9 | Week 9 | Integration tests, manual platform testing |
| **Phase 1: Deploy** | 1 week | Week 10 | Week 10 | Staging → Production, user onboarding docs |
| **Phase 2: Full Platforms** | 8 weeks | Week 11 | Week 18 | Facebook, Instagram, Threads, AI router |
| **Phase 2: Testing** | 1 week | Week 19 | Week 19 | AI quality testing, media upload validation |
| **Phase 2: Deploy** | 1 week | Week 20 | Week 20 | Production release, analytics dashboard |
| **Phase 3: Enterprise** | 4-6 weeks | Week 21 | Week 26 | Bulk ops, A/B testing, webhooks, monitoring |
| **Phase 3: Deploy** | 1 week | Week 27 | Week 27 | Final release, documentation complete |

**Total Duration**: 27 weeks (~6.5 months)

---

**Last Updated**: 2025-01-21
**Version**: 1.0
**Status**: Ready for Review
