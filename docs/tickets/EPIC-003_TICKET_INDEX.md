# EPIC-003: SaaS Foundation - Ticket Index

**Epic Document**: [EPIC-003_SAAS_FOUNDATION.md](./EPIC-003_SAAS_FOUNDATION.md)

This index provides a complete breakdown of all tickets for the SaaS Foundation feature, organized by phase and implementation order.

---

## Overview

**Timeline**: 12 weeks (3 months)
**Total Tickets**: 27 tickets across 6 phases
**Engineers**: 2 full-time
**Target**: $1,500 MRR by Week 12

---

## Phase 1: Database & Stripe Foundation (Week 1-2)

**Goal**: Set up multi-tenant schema and Stripe integration

### Infrastructure (Week 1)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-001** | Database Schema Migrations | 3 days | P0 | None |
| **SF-002** | Stripe Account Setup & Configuration | 1 day | P0 | None |

### Core Services (Week 1-2)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-003** | SubscriptionService Foundation | 3 days | P0 | SF-001, SF-002 |
| **SF-004** | Webhook Handler with Idempotency | 3 days | P0 | SF-003 |

**Phase 1 Total**: 4 tickets, ~10 days effort (~2 weeks with 2 engineers)

**Deliverables:**
- ✅ PostgreSQL schema with 10 new tables (subscriptions, invoices, payment_methods, subscription_events, usage_quotas, organizations, organization_members, organization_invites)
- ✅ Stripe Checkout working in test mode
- ✅ Webhook endpoint receiving and processing events (subscription.created, invoice.paid)
- ✅ Basic subscription record creation

---

## Phase 2: RBAC & Organization Management (Week 3-4)

**Goal**: Multi-tenant organization structure with role-based access

### Organization Services (Week 3)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-005** | OrganizationService Implementation | 3 days | P0 | SF-001 |
| **SF-006** | Member Management & Invites | 3 days | P0 | SF-005 |

### RBAC System (Week 4)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-007** | RBAC Middleware & Permissions Matrix | 3 days | P0 | SF-006 |
| **SF-008** | Auto-Create Free Tier on Signup | 2 days | P0 | SF-005, SF-007 |

**Phase 2 Total**: 4 tickets, ~11 days effort (~2 weeks with 2 engineers)

**Deliverables:**
- ✅ Organizations can have multiple members with roles (Owner, Admin, Editor, Publisher, Viewer)
- ✅ Invites sent via email with accept flow
- ✅ Permissions enforced on all routes (RBAC middleware)
- ✅ New users get Free tier org automatically on signup

---

## Phase 3: Quota System & Enforcement (Week 5-6)

**Goal**: Real-time usage tracking and enforcement

### Quota Service (Week 5)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-009** | QuotaService Implementation | 4 days | P0 | SF-001, SF-003 |
| **SF-010** | Quota Enforcement Middleware | 2 days | P0 | SF-009 |

### Quota Management (Week 6)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-011** | Monthly Quota Reset Job | 2 days | P1 | SF-009 |
| **SF-012** | Quota Warning System | 2 days | P1 | SF-009 |

**Phase 3 Total**: 4 tickets, ~10 days effort (~2 weeks with 2 engineers)

**Deliverables:**
- ✅ All create actions check quotas first (sites, posts, users, storage, API calls)
- ✅ 402 Payment Required returned when quota exceeded
- ✅ Upgrade prompts shown in UI when limit reached
- ✅ Email sent when approaching limits (80%, 90%, 95%)

---

## Phase 4: Webhooks & Email System (Week 7-8)

**Goal**: Complete webhook handling and transactional emails

### Email Infrastructure (Week 7)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-013** | EmailService with SendGrid Integration | 3 days | P0 | None |
| **SF-014** | Email Templates | 3 days | P0 | SF-013 |

### Webhook Completion (Week 8)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-015** | Complete Webhook Event Handling | 3 days | P0 | SF-004, SF-013 |
| **SF-016** | Subscription Lifecycle Management | 2 days | P0 | SF-015 |

**Phase 4 Total**: 4 tickets, ~11 days effort (~2 weeks with 2 engineers)

**Deliverables:**
- ✅ Welcome email sent on signup
- ✅ Receipt email sent after payment
- ✅ Quota warning emails working (80%, 90%, 95%)
- ✅ All Stripe webhook events handled (subscription.created, updated, deleted, invoice.paid, invoice.failed, payment_method.attached)

**Email Templates:**
1. Welcome Email (Free signup)
2. Subscription Confirmation (First payment)
3. Payment Receipt (Recurring payment)
4. Payment Failed (Retry prompt)
5. Quota Warning (80%, 90%, 95%)
6. Quota Exceeded (Hard limit)
7. Member Invite (Organization invite)
8. Subscription Canceled (End notice)

---

## Phase 5: Frontend Billing Dashboard (Week 9-10)

**Goal**: Self-service billing management for customers

### Billing UI (Week 9)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-017** | Billing Page UI & Layout | 3 days | P0 | Phase 4 complete |
| **SF-018** | Stripe Checkout Integration | 2 days | P0 | SF-017 |
| **SF-019** | Stripe Customer Portal Link | 1 day | P0 | SF-017 |

### Dashboard Features (Week 10)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-020** | Quota Status Dashboard | 3 days | P0 | SF-009, SF-017 |
| **SF-021** | Organization Settings Page | 4 days | P0 | SF-006, SF-017 |

**Phase 5 Total**: 5 tickets, ~13 days effort (~2 weeks with 2 engineers)

**Deliverables:**
- ✅ Users can view current plan and usage
- ✅ "Upgrade" button redirects to Stripe Checkout
- ✅ "Manage Billing" button opens Customer Portal
- ✅ Organization owners can invite/remove members
- ✅ Quota usage shown with progress bars and percentages

**UI Components:**
1. **BillingPage** - Main billing dashboard
   - Current plan card with tier, price, billing cycle
   - Usage overview with progress bars (sites, posts, users, storage, API calls)
   - Upgrade CTA button
   - Invoice history table
   - "Manage Billing" link to Customer Portal

2. **QuotaStatusCard** - Individual quota display
   - Progress bar with current/limit
   - Percentage used
   - Warning state at 80%+
   - Upgrade prompt at 100%

3. **OrganizationSettingsPage** - Team management
   - Member list with roles
   - Invite member form
   - Role update dropdown
   - Remove member button

4. **UpgradeModal** - Plan comparison
   - Side-by-side tier comparison
   - Feature checklist per tier
   - Pricing toggle (monthly/annual)
   - "Select Plan" button → Stripe Checkout

---

## Phase 6: Testing & Production Deployment (Week 11-12)

**Goal**: Comprehensive testing and production launch

### Testing (Week 11)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-022** | Unit Tests - Service Layer | 3 days | P0 | All services complete |
| **SF-023** | Integration Tests - Stripe & Quotas | 3 days | P0 | SF-022 |
| **SF-024** | E2E Tests - Signup to Checkout Flow | 2 days | P0 | SF-023 |

### Production Readiness (Week 12)

| Ticket | Title | Effort | Priority | Dependencies |
|--------|-------|--------|----------|--------------|
| **SF-025** | Production Stripe Setup | 1 day | P0 | SF-024 |
| **SF-026** | Monitoring & Alerting | 2 days | P0 | SF-025 |
| **SF-027** | Documentation & Runbooks | 2 days | P1 | SF-026 |

**Phase 6 Total**: 6 tickets, ~13 days effort (~2 weeks with 2 engineers)

**Deliverables:**
- ✅ 90%+ test coverage on service layer (SubscriptionService, QuotaService, OrganizationService)
- ✅ Production Stripe account configured (live keys, webhook endpoint, tax settings)
- ✅ Monitoring dashboards in place (Sentry, webhook failures, quota enforcement, payment success rate)
- ✅ API documentation published
- ✅ First paying customer onboarded successfully

**Testing Coverage:**

**Unit Tests:**
- SubscriptionService: createCheckoutSession, handleWebhook, upgradeSubscription, cancelSubscription
- QuotaService: checkQuota, incrementQuota, resetMonthlyQuotas, getQuotaStatus
- OrganizationService: createOrganization, inviteMember, acceptInvite, updateMemberRole, checkPermission

**Integration Tests:**
- Stripe webhook simulation (subscription.created, invoice.paid, invoice.failed)
- Quota enforcement across multiple requests (race condition testing)
- Multi-tenant data isolation (ensure Org A cannot access Org B data)

**E2E Tests:**
1. Signup → Auto-create Free org → Create site → Hit quota → Upgrade prompt
2. Upgrade → Stripe Checkout → Webhook → Database update → Quota increased
3. Invite member → Accept invite → Member can access org → Role enforced
4. Payment failure → Email sent → Retry → Success → Subscription active

---

## Summary

| Phase | Focus | Tickets | Effort (days) | Duration (weeks) | Engineers |
|-------|-------|---------|---------------|------------------|-----------|
| **Phase 1** | Database & Stripe | 4 tickets | 10 days | 2 weeks | 2 |
| **Phase 2** | RBAC & Organizations | 4 tickets | 11 days | 2 weeks | 2 |
| **Phase 3** | Quota System | 4 tickets | 10 days | 2 weeks | 2 |
| **Phase 4** | Webhooks & Email | 4 tickets | 11 days | 2 weeks | 2 |
| **Phase 5** | Frontend Dashboard | 5 tickets | 13 days | 2 weeks | 2 |
| **Phase 6** | Testing & Deployment | 6 tickets | 13 days | 2 weeks | 2 |
| **Total** | **SaaS Foundation** | **27 tickets** | **68 days** | **12 weeks** | **2** |

**Timeline**: 12 weeks (3 months) with 2 full-time engineers

---

## Priority Legend

- **P0**: Must-have for launch, blocking other work
- **P1**: Important, should be in launch but can be deferred if needed
- **P2**: Nice-to-have, can be moved to post-launch enhancement

---

## Ticket Template

Each ticket follows this structure:

```markdown
# SF-XXX: [Title]

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase X (Database/RBAC/Quota/Webhooks/Frontend/Testing)
**Priority**: PX
**Estimated Effort**: X days
**Status**: Not Started / In Progress / In Review / Done
**Dependencies**: SF-XXX, SF-XXX
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

- **SF-004**: Webhook Handler - Security critical, must prevent duplicate processing
  - **Risk**: Duplicate webhooks cause duplicate charges or subscription state drift
  - **Mitigation**: Idempotency via unique `stripe_event_id` check, database transaction

- **SF-009**: QuotaService - Race conditions can bypass limits
  - **Risk**: Two simultaneous requests create resources, exceeding quota
  - **Mitigation**: PostgreSQL row-level locking (`SELECT FOR UPDATE`), atomic increment with check

- **SF-010**: Quota Enforcement Middleware - Data isolation critical
  - **Risk**: User from Org A accesses data from Org B
  - **Mitigation**: All queries require `organization_id` filter, PostgreSQL row-level security (RLS)

- **SF-015**: Complete Webhook Handling - Subscription lifecycle complexity
  - **Risk**: Edge cases (trial ends, payment fails, downgrade) not handled correctly
  - **Mitigation**: State machine diagram, comprehensive test matrix, manual sync fallback

### Tickets with External Dependencies

- **SF-002**: Stripe Account Setup - Requires Stripe approval (usually instant for test mode, 1-2 days for live mode)
- **SF-013**: EmailService - Requires SendGrid account approval (usually instant)
- **SF-025**: Production Stripe Setup - Requires tax registrations (1-2 weeks for EU VAT)

---

## Implementation Order

### Critical Path (Cannot Be Parallelized)

```
SF-001 (Schema) → SF-003 (SubscriptionService) → SF-004 (Webhooks) → SF-015 (Complete Webhooks)
                                                  ↓
SF-005 (OrganizationService) → SF-006 (Members) → SF-007 (RBAC) → SF-008 (Auto-create Org)
                                                  ↓
SF-009 (QuotaService) → SF-010 (Enforcement) → SF-020 (Quota Dashboard)
```

### Parallel Tracks

**Backend Track (Engineer 1)**:
- Week 1-2: SF-001, SF-003, SF-004
- Week 3-4: SF-005, SF-006, SF-009
- Week 5-6: SF-011, SF-012, SF-015
- Week 7-8: SF-013, SF-014, SF-016

**Frontend Track (Engineer 2)**:
- Week 1-4: Prepare components (can start once API specs defined)
- Week 5-6: Build reusable UI components
- Week 9-10: SF-017, SF-018, SF-019, SF-020, SF-021

**Testing Track (Both Engineers)**:
- Week 11: SF-022, SF-023, SF-024 (pair programming)
- Week 12: SF-025, SF-026, SF-027

---

## Next Steps

### Week 0 (Planning)
- [ ] Review EPIC-003 with product, engineering, finance teams
- [ ] Confirm pricing tiers (Free $0, Starter $29, Pro $99, Enterprise custom)
- [ ] Approve PostgreSQL-first approach (no Redis in Phase 1)
- [ ] Set up project tracking (assign tickets to engineers)

### Week 1 (Kickoff)
- [ ] Assign tickets SF-001 through SF-004 to engineers
- [ ] Create Stripe test account
- [ ] Set up SendGrid account (for Week 7)
- [ ] Begin database schema design review
- [ ] Start SubscriptionService implementation

### Ongoing
- [ ] Daily standups to unblock dependencies
- [ ] Code reviews within 24 hours
- [ ] Weekly demo on Fridays (show progress to stakeholders)
- [ ] Integration testing every Friday
- [ ] Update EPIC document with learnings

---

## Milestone Checklist

### Week 4 Milestone: Database + Stripe Integration
- [ ] Can create test subscription via Stripe Checkout
- [ ] Webhooks update database correctly
- [ ] Idempotency prevents duplicate processing
- [ ] Organizations can have multiple members
- [ ] RBAC middleware enforces permissions

### Week 8 Milestone: Quota System + Email
- [ ] Quota checks block requests at 100% usage
- [ ] Monthly API call quotas reset correctly
- [ ] Email templates render correctly (8 templates)
- [ ] All Stripe webhook events handled
- [ ] Subscription lifecycle works (trial → active → past_due → canceled)

### Week 12 Milestone: Production Launch
- [ ] First paying customer onboarded successfully
- [ ] Billing dashboard shows usage and invoices
- [ ] Customer Portal allows self-service plan changes
- [ ] 90%+ test coverage on service layer
- [ ] Monitoring alerts configured (webhook failures, payment failures)
- [ ] API documentation published

---

**Last Updated**: 2025-01-21
**Version**: 1.0
