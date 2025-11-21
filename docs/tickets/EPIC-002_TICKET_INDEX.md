# EPIC-002: Social Media Distribution - Ticket Index

**Epic Document**: [EPIC-002_SOCIAL_MEDIA_DISTRIBUTION.md](./EPIC-002_SOCIAL_MEDIA_DISTRIBUTION.md)

This index provides a complete breakdown of all tickets for the Social Media Distribution feature, organized by phase and implementation order.

---

## Phase 1: MVP (Twitter + LinkedIn) - 6 weeks

**Goal**: Ship basic distribution to 2 platforms with manual content editing

### Infrastructure & Foundation (Week 1-2)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-001** | Infrastructure Setup - Redis & BullMQ | 3 days | P0 | None |
| **SD-002** | Database Schema Migrations | 2 days | P0 | None |
| **SD-003** | OAuth Service Foundation | 3 days | P0 | SD-001 |
| **SD-004** | Encryption Service for OAuth Tokens | 2 days | P0 | None |

### Platform Adapters (Week 2-3)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-005** | Platform Adapter Interface | 2 days | P0 | SD-003 |
| **SD-006** | Twitter/X OAuth Integration | 3 days | P0 | SD-003, SD-005 |
| **SD-007** | Twitter/X Platform Adapter | 3 days | P0 | SD-006 |
| **SD-008** | LinkedIn OAuth Integration | 3 days | P0 | SD-003, SD-005 |
| **SD-009** | LinkedIn Platform Adapter | 3 days | P0 | SD-008 |

### Queue & Distribution Logic (Week 3-4)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-010** | Distribution Queue Workers | 4 days | P0 | SD-001, SD-005 |
| **SD-011** | Rate Limiting Service | 2 days | P1 | SD-001 |
| **SD-012** | Distribution API Endpoints | 3 days | P0 | SD-010 |

### Frontend UI (Week 4-5)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-013** | Platform Connections Page | 4 days | P0 | SD-012 |
| **SD-014** | Distribution Modal in Post Editor | 5 days | P0 | SD-012 |
| **SD-015** | Queue Monitoring UI Enhancements | 3 days | P1 | SD-012 |
| **SD-016** | Basic Analytics Dashboard | 3 days | P1 | SD-012 |

### Testing & Documentation (Week 6)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-017** | Integration Tests - Platform Adapters | 3 days | P0 | SD-007, SD-009 |
| **SD-018** | E2E Tests - Distribution Flow | 2 days | P0 | SD-014 |
| **SD-019** | User Documentation - Platform Setup | 2 days | P1 | SD-013 |

**Phase 1 Total**: 13 tickets, ~51 days effort (~6 weeks with 2 engineers)

---

## Phase 2: Full Platform Support + AI (8 weeks)

**Goal**: Add Facebook, Instagram, Threads + Multi-LLM AI content adaptation

### AI Infrastructure (Week 7-8)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-020** | Multi-LLM Router Service | 5 days | P0 | Phase 1 complete |
| **SD-021** | AI Cost Tracking & Budgets | 3 days | P1 | SD-020 |
| **SD-022** | Platform-Specific Content Adapters | 4 days | P0 | SD-020 |
| **SD-023** | AI Integration in Distribution Flow | 3 days | P0 | SD-020, SD-022 |

### Additional Platforms (Week 8-10)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-024** | Facebook OAuth & Adapter | 4 days | P0 | SD-005 |
| **SD-025** | Instagram OAuth & Adapter (Business) | 5 days | P0 | SD-005 |
| **SD-026** | Threads OAuth & Adapter | 3 days | P1 | SD-005 |

### Media Handling (Week 10-11)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-027** | Media Upload Service | 4 days | P0 | None |
| **SD-028** | Image Resizing & Validation | 3 days | P0 | SD-027 |
| **SD-029** | Platform-Specific Media Requirements | 3 days | P0 | SD-027, SD-028 |

### Enhanced UI (Week 11-13)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-030** | AI Preview in Distribution Modal | 4 days | P0 | SD-023 |
| **SD-031** | Platform Preview Simulations | 4 days | P1 | SD-030 |
| **SD-032** | Scheduled Publishing UI | 3 days | P0 | SD-012 |
| **SD-033** | Advanced Analytics Dashboard | 5 days | P1 | SD-021 |

### Testing & Documentation (Week 14)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-034** | Integration Tests - AI & New Platforms | 4 days | P0 | SD-025, SD-023 |
| **SD-035** | Performance Testing - AI Latency | 2 days | P1 | SD-023 |
| **SD-036** | Documentation - AI Configuration | 2 days | P1 | SD-020 |

**Phase 2 Total**: 17 tickets, ~61 days effort (~8 weeks with 2 engineers)

---

## Phase 3: Enterprise Features (4-6 weeks)

**Goal**: Bulk operations, A/B testing, advanced monitoring

### Bulk Operations (Week 15-16)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-037** | Bulk Distribution API | 3 days | P1 | Phase 2 complete |
| **SD-038** | Bulk Distribution UI | 3 days | P1 | SD-037 |
| **SD-039** | Bulk Scheduling & Templates | 3 days | P1 | SD-037 |

### A/B Testing (Week 16-17)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-040** | A/B Testing Framework | 4 days | P2 | Phase 2 complete |
| **SD-041** | Variant Tracking & Analytics | 3 days | P2 | SD-040 |
| **SD-042** | A/B Testing UI | 3 days | P2 | SD-040 |

### Webhooks & Monitoring (Week 17-18)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-043** | Webhook Notification System | 3 days | P1 | Phase 2 complete |
| **SD-044** | Real-Time Queue Monitoring (WebSocket) | 4 days | P1 | SD-001 |
| **SD-045** | Queue Monitoring Dashboard | 3 days | P1 | SD-044 |

### Video Support (Optional - Week 18-20)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-046** | Video Upload & Processing Service | 5 days | P2 | SD-027 |
| **SD-047** | TikTok OAuth & Adapter (if API approved) | 5 days | P2 | SD-005, SD-046 |
| **SD-048** | Instagram Reels Support | 3 days | P2 | SD-046 |

### Testing & Documentation (Week 19-20)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SD-049** | Integration Tests - Bulk & Webhooks | 3 days | P1 | SD-037, SD-043 |
| **SD-050** | Operational Docs - Monitoring & Alerts | 2 days | P1 | SD-045 |

**Phase 3 Total**: 14 tickets, ~47 days effort (~6 weeks with 2 engineers)

---

## Summary

| Phase | Tickets | Effort (days) | Duration (weeks) | Engineers |
|-------|---------|---------------|------------------|-----------|
| **Phase 1: MVP** | 19 tickets | 51 days | 6 weeks | 2 |
| **Phase 2: Full Platform + AI** | 17 tickets | 61 days | 8 weeks | 2 |
| **Phase 3: Enterprise** | 14 tickets | 47 days | 6 weeks | 2 |
| **Total** | **50 tickets** | **159 days** | **20 weeks** | **2** |

**Timeline**: ~5 months (20 weeks) with 2 full-time engineers

---

## Priority Legend

- **P0**: Must-have for MVP, blocking other work
- **P1**: Important, should be in MVP but can be deferred if needed
- **P2**: Nice-to-have, can be moved to Phase 3 or later
- **P3**: Optional, future enhancement

---

## Ticket Template

Each ticket follows this structure:

```markdown
# SD-XXX: [Title]

**Epic**: EPIC-002 Social Media Distribution
**Phase**: Phase X (MVP/Full Platform/Enterprise)
**Priority**: PX
**Estimated Effort**: X days
**Status**: Not Started / In Progress / In Review / Done
**Dependencies**: SD-XXX, SD-XXX
**Assigned To**: [Name]

---

## Objective
[What this ticket achieves]

## Requirements
### Functional Requirements
[What it must do]

### Non-Functional Requirements
[Performance, security, etc.]

## Technical Design
[Code examples, API specs, database changes]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Testing
[Test cases and scenarios]

## Documentation
[What needs to be documented]

## Deployment Notes
[Setup, configuration, dependencies]
```

---

## Risk Mitigation

### High-Risk Tickets (Require Extra Attention)

- **SD-004**: Encryption Service - Security critical, must be bulletproof
- **SD-006/SD-008**: OAuth Integrations - Complex flows, many edge cases
- **SD-020**: Multi-LLM Router - Cost management is critical
- **SD-025**: Instagram Adapter - Two-step publish, Business account requirement
- **SD-047**: TikTok Adapter - API approval uncertain, may block Phase 3

### Tickets with External Dependencies

- **SD-001**: Requires Redis infrastructure (managed service or self-hosted)
- **SD-020**: Requires LLM API keys (Google, OpenAI, Cohere, Anthropic)
- **SD-047**: Requires TikTok API approval (3-6 months, uncertain outcome)

---

## Next Steps

1. **Week 0 (Planning)**:
   - Review EPIC-002 with product, engineering, design teams
   - Confirm platform priorities (Twitter, LinkedIn for MVP?)
   - Approve technical architecture (BullMQ, Redis, multi-LLM router)
   - Set up project tracking (Jira, Linear, GitHub Projects)

2. **Week 1 (Kickoff)**:
   - Assign tickets SD-001 through SD-004 to engineers
   - Set up Redis infrastructure (local dev + staging)
   - Begin database schema design review
   - Start OAuth service implementation

3. **Ongoing**:
   - Weekly sprint planning (pull next 5-7 tickets)
   - Daily standups to unblock dependencies
   - Code reviews within 24 hours
   - Integration testing every Friday

---

**Last Updated**: 2025-01-21
**Version**: 1.0
