# Social Media Distribution - Executive Summary

**Version**: 1.0
**Date**: 2025-11-21
**Full Specification**: [SOCIAL_MEDIA_DISTRIBUTION_TECH_SPEC.md](./SOCIAL_MEDIA_DISTRIBUTION_TECH_SPEC.md)

---

## Overview

Transform the current webhook-based distribution system into a production-ready social media publishing platform supporting Twitter/X, LinkedIn, Facebook, Instagram, TikTok, and Threads.

**Current State**: Basic webhook dispatcher with simple text truncation
**Target State**: OAuth-based multi-platform publisher with AI content adaptation, queue system, and comprehensive analytics

---

## Key Technical Decisions

### 1. Queue System: **BullMQ + Redis** ✅

**Why BullMQ?**
- Built on Redis (already planned infrastructure)
- Excellent TypeScript support
- Advanced features: rate limiting, priority, delayed jobs, retry with backoff
- Horizontal scaling support
- Built-in monitoring (Bull Board)

**Performance Target**: 10+ jobs/second, p95 API response ≤ 300ms

---

### 2. OAuth Strategy: **Platform-Specific Implementations** ✅

**Architecture**:
- Separate `platform_connections` table for OAuth credentials
- AES-256-GCM encryption at rest
- Automatic token refresh with fallback
- Per-site, per-platform credential management

**Security**:
```
OAUTH_ENCRYPTION_KEY=<64-char-hex> (environment variable)
Encryption: AES-256-GCM with random IV and auth tag
Key Rotation: Supported via migration script
```

---

### 3. Platform Integration: **Adapter Pattern** ✅

**Interface**:
```typescript
abstract class PlatformAdapter {
  abstract publish(request: PublishRequest): Promise<PublishResult>;
  abstract validateCredentials(): Promise<boolean>;
  abstract refreshToken(): Promise<PlatformCredentials>;
  abstract getRateLimitStatus(): Promise<RateLimitStatus>;
  abstract getCharacterLimit(): number;
  abstract supportsMedia(type: 'image' | 'video' | 'gif'): boolean;
}
```

**Platforms**:
- ✅ Twitter/X: OAuth 2.0 PKCE, API v2 (280 chars, rate: 200/15min)
- ✅ LinkedIn: OAuth 2.0, UGC API (3000 chars, rate: 100/day)
- ⚠️ Facebook: Graph API (63k chars, rate: 200/hour)
- ⚠️ Instagram: Business account required, two-step publish (2200 chars)
- ❌ TikTok: API approval required, video-only (2200 chars)
- ⚠️ Threads: Beta API (500 chars)

---

### 4. AI Content Adaptation: **Multi-LLM Router** ✅

**Strategy**:
- **Primary**: Google Gemini Flash ($0.0001/1k tokens, 800ms p50)
- **Fallback**: GPT-4o Mini, Cohere Command, Claude Haiku
- **Cost Tracking**: `ai_usage_logs` table (partitioned by month)
- **Target Cost**: ≤ $0.01 per distribution

**Features**:
- Platform-specific content adaptation
- Hashtag generation (limit: 4-30 depending on platform)
- Image caption generation (vision models)
- Fallback to simple truncation if AI fails

---

### 5. Rate Limiting: **Site-Scoped, Redis-Backed** ✅

**Implementation**:
- Track per `(site_id, platform, time_window)`
- Store in `rate_limit_tracking` table
- Pre-check before enqueueing job
- Respect platform-specific limits
- Alert users before hitting quota

---

## Database Schema Changes

### New Tables

1. **platform_connections** - OAuth credentials storage
2. **rate_limit_tracking** - Per-site rate limit enforcement
3. **ai_usage_logs** - AI cost tracking (partitioned)
4. **distribution_analytics** - Aggregated metrics

### Modified Tables

- `publishing_targets`: Add `site_id`, `connection_id`
- `publishing_schedules`: Add `connection_id`
- `distribution_logs`: Add `site_id`, `ai_adapted`, `ai_cost_usd`, `platform_post_id`, `platform_url`

**Migration Complexity**: LOW (3-5 days)

---

## API Endpoints

### Platform Connection Management
```
POST   /api/admin/distribution/platforms/:platform/connect
GET    /api/admin/distribution/platforms/:platform/callback
GET    /api/admin/distribution/connections
DELETE /api/admin/distribution/connections/:id
```

### Distribution Dispatch
```
POST   /api/admin/distribution/dispatch          # Immediate dispatch
POST   /api/admin/distribution/schedules         # Schedule for later
GET    /api/admin/distribution/schedules
DELETE /api/admin/distribution/schedules/:id
```

### Analytics
```
GET    /api/admin/distribution/analytics         # Metrics dashboard
GET    /api/admin/distribution/queue/status      # Queue health
GET    /api/admin/distribution/queue/failed      # Failed jobs
POST   /api/admin/distribution/queue/retry/:id   # Retry failed job
```

---

## Implementation Complexity

| Component | Complexity | Effort | Priority |
|-----------|------------|--------|----------|
| Twitter/X Adapter | 5/10 | 1 week | MVP |
| LinkedIn Adapter | 6/10 | 1 week | MVP |
| Facebook Adapter | 7/10 | 1.5 weeks | Phase 2 |
| Instagram Adapter | 8/10 | 2 weeks | Phase 2 |
| TikTok Adapter | 9/10 | 2-3 weeks | Phase 3 |
| Threads Adapter | 6/10 | 1 week | Phase 2 |
| OAuth Implementation | 7/10 | 2-3 weeks | MVP |
| Queue System (BullMQ) | 4/10 | 1 week | MVP |
| Multi-LLM Router | 6/10 | 2 weeks | Phase 2 |
| AI Content Adaptation | 5/10 | 1.5 weeks | Phase 2 |
| Analytics Dashboard | 5/10 | 1 week | Phase 2 |

**Total Effort**: 16-22 weeks (4-5.5 months)

---

## Phased Rollout

### Phase 1: MVP (6 weeks)

**Platforms**: Twitter, LinkedIn
**Features**:
- OAuth flows (2 platforms)
- Queue system (BullMQ)
- Distribution API endpoints
- Basic analytics
- Rate limiting
- Simple text truncation (no AI)

**Deliverables**:
- Working Twitter + LinkedIn integration
- Admin UI for platform connections
- Distribution queue monitoring
- Basic analytics dashboard

**Success Criteria**:
- Publish to Twitter and LinkedIn
- API p95 ≤ 300ms
- Queue processing ≥ 10 jobs/second
- Zero credential leaks

---

### Phase 2: Full Platform Support (8 weeks)

**Platforms**: +Facebook, +Instagram, +Threads
**Features**:
- Multi-LLM router
- AI content adaptation
- Hashtag generation
- Media upload (images + videos)
- Scheduled publishing
- Advanced analytics

**Deliverables**:
- 5 platform support (Twitter, LinkedIn, Facebook, Instagram, Threads)
- AI content adaptation with cost tracking
- Media upload handler
- Cost dashboard

**Success Criteria**:
- AI content quality ≥ 85% approval
- Media upload success ≥ 95%
- AI cost ≤ $0.01 per distribution

---

### Phase 3: Enterprise Features (4-6 weeks)

**Platforms**: +TikTok (if available)
**Features**:
- Bulk distribution
- A/B testing
- Webhook notifications
- Queue monitoring dashboard (BullBoard)
- Token auto-refresh
- Platform health checks

**Deliverables**:
- 6 platform support (including TikTok)
- Bulk distribution UI
- Webhook system
- Comprehensive monitoring

**Success Criteria**:
- Bulk dispatch ≥ 100 posts/minute
- Queue uptime ≥ 99.9%
- Webhook delivery ≥ 99%

---

## Key Risks & Mitigations

### High-Severity Risks

| Risk | Mitigation |
|------|------------|
| **Platform API Changes** | Version adapters, monitor changelogs, graceful degradation |
| **OAuth Token Management** | Auto-refresh, secure storage, monitoring, alerts |
| **Security Breach** | AES-256 encryption, key rotation, audit logging |
| **Platform Account Bans** | Follow ToS strictly, conservative rate limits, user education |

### Medium-Severity Risks

| Risk | Mitigation |
|------|------------|
| **Rate Limiting** | Per-site tracking, Redis cache, queue delays, prioritization |
| **Queue Downtime** | Redis HA, dead letter queue, job persistence |
| **AI Content Quality** | Fallback to truncation, multi-LLM routing, user preview |
| **High AI Costs** | Per-site budgets, cheapest LLM default, caching, optional toggle |

---

## Platform Feasibility Analysis

### Easy to Implement (MVP)
- ✅ **Twitter/X**: OAuth 2.0 PKCE, well-documented API v2
- ✅ **LinkedIn**: Straightforward OAuth 2.0, UGC API

### Medium Complexity (Phase 2)
- ⚠️ **Facebook**: Graph API stable, but Page vs Profile UX complicates
- ⚠️ **Threads**: Beta API (changing spec), similar to Instagram

### Complex (Phase 2-3)
- ⚠️ **Instagram**: Requires Business account + Facebook Page, two-step publish
- ❌ **TikTok**: API approval required, limited availability, video-only

**Recommendation**: Start with Twitter + LinkedIn for MVP, add Facebook/Instagram/Threads in Phase 2, defer TikTok to Phase 3 or make optional.

---

## UX Recommendations Based on Technical Constraints

### Must-Have Features

1. **Preview Before Publish**: AI-adapted content may need editing
   - Show character count per platform
   - Display hashtag suggestions
   - Preview with platform-specific styling

2. **Clear OAuth Flow**: Multi-step for some platforms
   - Instagram: "Connect Facebook Page first"
   - TikTok: "API approval required"
   - Progress indicators

3. **Media Validation**: Platform-specific requirements
   - Pre-validate before upload
   - Show clear error messages
   - Suggest fixes (e.g., "Video too long for Instagram, trim to 60s")

4. **Rate Limit Warnings**: Prevent hitting quotas
   - Show remaining quota in UI
   - Warn before hitting limit
   - Suggest spreading out posts

5. **AI Cost Transparency**: Show costs before generating
   - "Estimated cost: $0.005"
   - Monthly budget tracker
   - Toggle to disable AI (free)

### Optional but Recommended

1. **Timezone Handling**: Use user's local timezone
2. **Bulk Operations**: Schedule multiple posts at once
3. **Distribution Templates**: Save common hashtag sets
4. **Platform Health Indicator**: Show platform status (green/yellow/red)

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **API Response Time** | p95 ≤ 300ms | Excluding external platform calls |
| **Queue Processing** | ≥ 10 jobs/second | Per worker instance |
| **Distribution Success** | ≥ 95% | Excluding platform errors |
| **OAuth Success** | ≥ 98% | Excluding user cancellations |
| **AI Generation** | p95 ≤ 2 seconds | Per content adaptation |
| **Queue Uptime** | ≥ 99.9% | Redis HA required |
| **Retry Success** | ≥ 80% | Of initially failed jobs |

---

## Cost Estimates

### Infrastructure Costs (Monthly)
- **Redis** (HA): ~$30-50/month (AWS ElastiCache t3.small)
- **AI LLM**: ~$10-50/month depending on usage
  - Gemini Flash: $0.0001/1k tokens (primary)
  - GPT-4o Mini: $0.0015/1k tokens (fallback)
- **Total**: ~$40-100/month

### Development Costs
- **Phase 1 (MVP)**: 6 weeks × 1 developer = 6 person-weeks
- **Phase 2 (Full)**: 8 weeks × 1 developer = 8 person-weeks
- **Phase 3 (Enterprise)**: 4-6 weeks × 1 developer = 4-6 person-weeks
- **Total**: 18-20 person-weeks (4.5-5 months)

---

## Success Metrics

### Performance
- API p95 ≤ 300ms ✅
- Queue processing ≥ 10 jobs/second ✅
- Distribution success ≥ 95% ✅

### Business
- Platform coverage: 5+ by Phase 2
- User adoption: % of sites with ≥1 connected platform
- Monthly active distributions per site

### Quality
- AI content approval ≥ 85%
- Error rate ≤ 2%
- Retry success ≥ 80%
- Uptime ≥ 99.9%

---

## Next Steps

1. ✅ **Review Spec**: Product, UX, Engineering approval
2. 🔄 **Phase 1 Kickoff**: Start MVP (Twitter + LinkedIn)
3. ⏳ **Infrastructure Setup**: Redis, BullMQ, env variables
4. ⏳ **Database Migration**: Create tables, migrate data
5. ⏳ **OAuth Implementation**: Twitter + LinkedIn flows
6. ⏳ **Platform Adapters**: TwitterAdapter, LinkedInAdapter
7. ⏳ **Queue System**: BullMQ integration, workers
8. ⏳ **API Endpoints**: Distribution routes
9. ⏳ **Frontend UI**: Connection flow, distribution UI
10. ⏳ **Testing**: Integration tests, manual platform testing
11. ⏳ **Deployment**: Staging → Production
12. ⏳ **Phase 2 Planning**: Facebook, Instagram, AI enhancement

---

## Questions for Product/UX

1. **Platform Priority**: Confirm Twitter + LinkedIn for MVP?
2. **AI Default**: Should AI content adaptation be ON by default or opt-in?
3. **Budget Limits**: Per-site monthly AI budget caps?
4. **Instagram Requirement**: Are users willing to create Business accounts?
5. **TikTok**: Skip entirely or defer to later phase?
6. **Webhook Events**: Which distribution events need webhooks?
7. **Bulk Operations**: Priority for Phase 2 or Phase 3?

---

## Documentation Links

- **Full Technical Spec**: [SOCIAL_MEDIA_DISTRIBUTION_TECH_SPEC.md](./SOCIAL_MEDIA_DISTRIBUTION_TECH_SPEC.md)
- **Platform APIs**:
  - [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)
  - [LinkedIn API](https://docs.microsoft.com/en-us/linkedin/)
  - [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
  - [Instagram API](https://developers.facebook.com/docs/instagram-api)
- **Queue System**: [BullMQ Docs](https://docs.bullmq.io/)
- **AI Providers**:
  - [Google Gemini](https://ai.google.dev/docs)
  - [OpenAI](https://platform.openai.com/docs)

---

**Status**: Ready for Architecture Review
**Maintained By**: Tech Architect
**Last Updated**: 2025-11-21
