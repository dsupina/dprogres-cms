# EPIC-003: SaaS Foundation - Multi-Tenant Subscription Management

**Status**: Ready for Implementation
**Priority**: P0 (Critical - Blocks Revenue)
**Estimated Effort**: 12 weeks (3 months)
**Target Completion**: Q2 2025
**Budget**: $69,240 development + $0-80/month infrastructure (first 200 customers)

---

## Executive Summary

### What We're Building

Transform DProgres CMS from a single-instance application into a true **SaaS-first multi-tenant platform** with subscription management, usage quotas, and role-based access control. This foundational infrastructure enables monetization and scales to support hundreds of paying customers.

### Why Now

**Strategic Imperative**: Cannot be "SaaS-first" without billing infrastructure. Distribution features (EPIC-002) have no revenue model without subscriptions. Building SaaS foundation first enables:

- **Immediate Revenue**: $1,500 MRR by Week 12 vs. $0 with distribution-first approach
- **Market Validation**: Test pricing and packaging with real customers before expensive feature investments
- **Sustainable Growth**: Usage-based quotas prevent infrastructure cost overruns
- **Competitive Position**: Price leader vs. Contentful ($300+), Sanity ($99+), Strapi ($99+)

### Success Metrics

**Week 12 Targets:**
- 10-15 paying customers ($29-99/mo) = $1,500 MRR
- 95%+ subscription success rate (payment processing)
- <100ms quota check latency (p95)
- $0.02 cost per organization per month (infrastructure)

**Key Features:**
1. Stripe-powered subscription management (Checkout + Customer Portal)
2. PostgreSQL-based usage quota tracking (sites, posts, users, storage, API calls)
3. Organization-level RBAC (Owner, Admin, Editor, Publisher, Viewer)
4. Webhook-driven event processing with idempotency
5. Self-service billing dashboard with upgrade flows

---

## Current State vs. Target State

### Current State (Single-Tenant)

**Architecture:**
- No payment processing or subscription management
- No usage quotas or enforcement
- Basic user roles (admin vs. user) without organization context
- Single database instance, no multi-tenant isolation
- No billing dashboard or upgrade prompts

**Limitations:**
- $0 revenue - unsustainable business model
- Cannot onboard paying customers
- No way to enforce tier limits (sites, posts, users)
- Shared infrastructure with no cost allocation
- No organization/team collaboration features

### Target State (Multi-Tenant SaaS)

**Architecture:**
- **Stripe Integration**: Checkout sessions + Customer Portal for self-service billing
- **Multi-Tenant Data Model**: `organizations` table with `organization_id` foreign keys
- **Usage Quotas**: Real-time tracking with PostgreSQL-based counters
- **RBAC System**: 5 roles (Owner, Admin, Editor, Publisher, Viewer) with permissions matrix
- **Event-Driven**: Stripe webhooks → database updates → email notifications
- **Cost-Optimized Hosting**: Hybrid architecture (Vercel + Railway + Neon) for $0-80/mo

**Capabilities:**
- ✅ Accept credit card payments via Stripe
- ✅ Automatically provision Free tier organizations
- ✅ Enforce usage quotas per tier (sites, posts, users, storage, API calls)
- ✅ Allow customers to self-upgrade via Stripe Customer Portal
- ✅ Send transactional emails (welcome, receipts, quota warnings)
- ✅ Invite team members with role-based permissions
- ✅ Track subscription lifecycle events for analytics

---

## Pricing Strategy

### Tier Structure

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| **Price** | $0/mo | $29/mo | $99/mo | Custom |
| **Sites** | 1 | 3 | 10 | Unlimited |
| **Posts** | 20/site | 100/site | 1,000/site | Unlimited |
| **Users** | 2 | 5 | 20 | Unlimited |
| **Storage** | 500 MB | 5 GB | 50 GB | Unlimited |
| **API Calls** | 10k/mo | 100k/mo | 1M/mo | Custom |
| **Support** | Community | Email | Priority | Dedicated |
| **Version History** | 7 days | 30 days | 90 days | Unlimited |
| **Custom Domains** | ❌ | ✅ | ✅ | ✅ |
| **AI Features** | ❌ | Basic | Advanced | Custom |
| **Webhooks** | ❌ | ❌ | ✅ | ✅ |

### Annual Discount
- **Monthly Billing**: Full price
- **Annual Billing**: 2 months free (16.7% discount)
  - Starter: $29/mo → $24.17/mo ($290/year)
  - Pro: $99/mo → $82.50/mo ($990/year)

### Competitive Positioning

**Price Leader Strategy:**

| Platform | Entry Tier | Mid Tier | High Tier |
|----------|-----------|----------|-----------|
| **DProgres** | $0 (Free) | $29 (Starter) | $99 (Pro) |
| Contentful | $300/mo | $900/mo | Enterprise |
| Sanity | $99/mo | $399/mo | Enterprise |
| Strapi Cloud | $99/mo | $499/mo | Enterprise |
| Directus Cloud | $15/mo | $65/mo | $250/mo |

**Value Proposition**: Enterprise-grade features at startup-friendly pricing (66% cheaper than Sanity, 90% cheaper than Contentful)

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Vercel)                       │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Billing Page  │  │ Org Settings │  │ Upgrade Prompts   │   │
│  │ - Plans       │  │ - Members    │  │ - Quota Warnings  │   │
│  │ - Payment     │  │ - Roles      │  │ - Feature Gates   │   │
│  │ - Invoices    │  │ - Invites    │  │                   │   │
│  └───────────────┘  └──────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Railway $5-20/mo)               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Subscription     │  │ Quota Service    │  │ Organization │ │
│  │ Service          │  │ - Check quotas   │  │ Service      │ │
│  │ - Stripe calls   │  │ - Increment usage│  │ - RBAC       │ │
│  │ - Webhooks       │  │ - Reset monthly  │  │ - Invites    │ │
│  │ - Trials         │  │                  │  │              │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              PostgreSQL (Neon Serverless - Free → $20/mo)       │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐    │
│  │ subscriptions│  │ usage_quotas  │  │ organizations    │    │
│  │ invoices     │  │ organization  │  │ org_members      │    │
│  │ payment_     │  │ _members      │  │ org_invites      │    │
│  │ methods      │  │               │  │                  │    │
│  └──────────────┘  └───────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   External Services                              │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Stripe           │  │ SendGrid         │                    │
│  │ - Checkout       │  │ - Welcome emails │                    │
│  │ - Customer Portal│  │ - Receipts       │                    │
│  │ - Webhooks       │  │ - Quota warnings │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. SubscriptionService (`backend/src/services/SubscriptionService.ts`)

**Responsibilities:**
- Create Stripe Checkout sessions for new subscriptions
- Handle subscription lifecycle (active, past_due, canceled, trialing)
- Process Stripe webhooks (subscription created, updated, deleted, payment succeeded/failed)
- Manage subscription upgrades/downgrades
- Track MRR and LTV metrics

**Key Methods:**
```typescript
class SubscriptionService extends EventEmitter {
  async createCheckoutSession(orgId, planTier, billingCycle, userId): ServiceResponse<{ sessionUrl, sessionId }>
  async handleWebhook(event: Stripe.Event): ServiceResponse<void>
  async upgradeSubscription(orgId, newTier): ServiceResponse<Subscription>
  async cancelSubscription(orgId, cancelAtPeriodEnd): ServiceResponse<Subscription>
  async getCustomerPortalUrl(orgId): ServiceResponse<{ portalUrl }>
  async getCurrentSubscription(orgId): ServiceResponse<Subscription>
}
```

**Webhook Events Handled:**
- `checkout.session.completed` → Create subscription record
- `customer.subscription.updated` → Update status, plan tier
- `customer.subscription.deleted` → Mark as canceled
- `invoice.payment_succeeded` → Create invoice record, send receipt
- `invoice.payment_failed` → Mark past_due, send warning email

#### 2. QuotaService (`backend/src/services/QuotaService.ts`)

**Responsibilities:**
- Check if organization can perform action (create site, post, user, etc.)
- Increment usage counters atomically
- Reset monthly quotas (API calls)
- Enforce tier limits based on subscription

**Key Methods:**
```typescript
class QuotaService {
  async checkQuota(orgId, dimension, amount = 1): ServiceResponse<{ allowed, current, limit, remaining }>
  async incrementQuota(orgId, dimension, amount = 1): ServiceResponse<void>
  async resetMonthlyQuotas(orgId): ServiceResponse<void>
  async getQuotaStatus(orgId): ServiceResponse<Record<dimension, QuotaStatus>>
  async setQuotaOverride(orgId, dimension, newLimit): ServiceResponse<void> // Enterprise only
}
```

**Quota Dimensions:**
- `sites`: Number of sites per organization
- `posts`: Number of posts per site (aggregated)
- `users`: Number of organization members
- `storage_bytes`: Total media storage across all sites
- `api_calls`: API requests per month (resets on billing cycle)

**Enforcement Strategy:**
- **Soft Limits**: Warn at 80%, 90%, 95% usage
- **Hard Limits**: Block at 100% with upgrade prompt
- **Grace Period**: 7 days past_due before enforcing quotas

#### 3. OrganizationService (`backend/src/services/OrganizationService.ts`)

**Responsibilities:**
- Create organizations (auto-created on signup for Free tier)
- Manage organization members (RBAC)
- Send and accept invites
- Transfer ownership

**Key Methods:**
```typescript
class OrganizationService extends EventEmitter {
  async createOrganization(name, ownerId): ServiceResponse<Organization>
  async inviteMember(orgId, email, role, inviterId): ServiceResponse<Invite>
  async acceptInvite(inviteToken, userId): ServiceResponse<Member>
  async updateMemberRole(orgId, userId, newRole, actorId): ServiceResponse<Member>
  async removeMember(orgId, userId, actorId): ServiceResponse<void>
  async transferOwnership(orgId, newOwnerId, currentOwnerId): ServiceResponse<void>
  async checkPermission(orgId, userId, permission): ServiceResponse<boolean>
}
```

**RBAC Permissions Matrix:**

| Permission | Owner | Admin | Editor | Publisher | Viewer |
|------------|-------|-------|--------|-----------|--------|
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remove users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create sites | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete sites | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create posts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit posts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publish posts | ✅ | ✅ | ✅ | ✅ | ❌ |
| View posts | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage settings | ✅ | ✅ | ❌ | ❌ | ❌ |

#### 4. EmailService (`backend/src/services/EmailService.ts`)

**Responsibilities:**
- Send transactional emails via SendGrid
- Template management (welcome, receipt, quota warning, invite)
- Track email delivery status

**Email Templates:**
1. **Welcome Email**: Sent after signup (Free tier)
2. **Subscription Confirmation**: Sent after first payment
3. **Payment Receipt**: Sent after successful payment
4. **Payment Failed**: Sent when payment fails (with retry link)
5. **Quota Warning**: Sent at 80%, 90%, 95% usage
6. **Quota Exceeded**: Sent when hard limit reached
7. **Member Invite**: Sent when invited to organization
8. **Subscription Canceled**: Sent when subscription ends

**SendGrid Cost:**
- Free tier: 100 emails/day (sufficient for 0-50 customers)
- Essentials plan: $15/mo for 50,000 emails (50-200 customers)

---

## Database Schema

### New Tables

#### subscriptions
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL, -- 'free', 'starter', 'pro', 'enterprise'
  billing_cycle VARCHAR(20) NOT NULL, -- 'monthly', 'annual'
  status VARCHAR(50) NOT NULL, -- 'active', 'past_due', 'canceled', 'trialing', 'incomplete'
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id) -- One active subscription per organization
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

#### invoices
```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL, -- 'draft', 'open', 'paid', 'void', 'uncollectible'
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  billing_reason VARCHAR(100), -- 'subscription_create', 'subscription_cycle', 'subscription_update'
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_stripe ON invoices(stripe_invoice_id);
```

#### payment_methods
```sql
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'card', 'sepa_debit', etc.
  card_brand VARCHAR(50), -- 'visa', 'mastercard', 'amex'
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_org ON payment_methods(organization_id);
```

#### subscription_events
```sql
CREATE TABLE subscription_events (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- 'subscription.created', 'payment.succeeded', etc.
  data JSONB NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscription_events_org ON subscription_events(organization_id);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
```

#### usage_quotas
```sql
CREATE TABLE usage_quotas (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  dimension VARCHAR(50) NOT NULL, -- 'sites', 'posts', 'users', 'storage_bytes', 'api_calls'
  current_usage BIGINT DEFAULT 0,
  quota_limit BIGINT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP, -- NULL for non-resetting quotas (sites, posts, users)
  last_reset_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, dimension)
);

CREATE INDEX idx_usage_quotas_org ON usage_quotas(organization_id);
CREATE INDEX idx_usage_quotas_dimension ON usage_quotas(dimension);
```

#### organizations
```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL, -- URL-safe identifier
  owner_id INTEGER NOT NULL REFERENCES users(id),
  plan_tier VARCHAR(50) DEFAULT 'free', -- Denormalized from subscriptions for quick checks
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);
```

#### organization_members
```sql
CREATE TABLE organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'owner', 'admin', 'editor', 'publisher', 'viewer'
  invited_by INTEGER REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

#### organization_invites
```sql
CREATE TABLE organization_invites (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  invite_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  accepted_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, email) -- Can't have multiple pending invites for same email
);

CREATE INDEX idx_org_invites_org ON organization_invites(organization_id);
CREATE INDEX idx_org_invites_token ON organization_invites(invite_token);
CREATE INDEX idx_org_invites_email ON organization_invites(email);
```

### Modified Tables

#### users
```sql
ALTER TABLE users
  ADD COLUMN current_organization_id INTEGER REFERENCES organizations(id),
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN email_verification_token VARCHAR(255),
  ADD COLUMN email_verification_sent_at TIMESTAMP;

CREATE INDEX idx_users_current_org ON users(current_organization_id);
```

#### sites
```sql
ALTER TABLE sites
  ADD COLUMN organization_id INTEGER NOT NULL REFERENCES organizations(id);

CREATE INDEX idx_sites_organization ON sites(organization_id);
```

#### posts, pages, media_files, categories
```sql
-- All content tables get organization_id for multi-tenant isolation
ALTER TABLE posts ADD COLUMN organization_id INTEGER NOT NULL REFERENCES organizations(id);
ALTER TABLE pages ADD COLUMN organization_id INTEGER NOT NULL REFERENCES organizations(id);
ALTER TABLE media_files ADD COLUMN organization_id INTEGER NOT NULL REFERENCES organizations(id);
ALTER TABLE categories ADD COLUMN organization_id INTEGER NOT NULL REFERENCES organizations(id);

CREATE INDEX idx_posts_organization ON posts(organization_id);
CREATE INDEX idx_pages_organization ON pages(organization_id);
CREATE INDEX idx_media_organization ON media_files(organization_id);
CREATE INDEX idx_categories_organization ON categories(organization_id);
```

---

## API Endpoints

### Subscription Management

#### POST /api/billing/checkout
Create Stripe Checkout session for new subscription or upgrade.

**Auth**: Required (JWT)
**Permissions**: Owner only

**Request:**
```json
{
  "planTier": "starter",
  "billingCycle": "monthly",
  "successUrl": "https://app.dprogres.com/billing/success",
  "cancelUrl": "https://app.dprogres.com/billing"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "cs_test_abc123",
    "sessionUrl": "https://checkout.stripe.com/pay/cs_test_abc123"
  }
}
```

#### GET /api/billing/subscription
Get current subscription details.

**Auth**: Required
**Permissions**: Any member

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "planTier": "pro",
    "billingCycle": "annual",
    "status": "active",
    "currentPeriodStart": "2025-01-01T00:00:00Z",
    "currentPeriodEnd": "2026-01-01T00:00:00Z",
    "amountCents": 99000,
    "cancelAtPeriodEnd": false
  }
}
```

#### POST /api/billing/portal
Get Stripe Customer Portal URL for managing subscription.

**Auth**: Required
**Permissions**: Owner only

**Response:**
```json
{
  "success": true,
  "data": {
    "portalUrl": "https://billing.stripe.com/session/live_abc123"
  }
}
```

#### POST /api/billing/cancel
Cancel subscription at period end.

**Auth**: Required
**Permissions**: Owner only

**Request:**
```json
{
  "cancelAtPeriodEnd": true,
  "feedback": "Too expensive"
}
```

#### GET /api/billing/invoices
List invoices for organization.

**Auth**: Required
**Permissions**: Owner, Admin

**Query Params:**
- `limit`: Number of invoices (default: 10)
- `status`: Filter by status (paid, open, void)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "stripeInvoiceId": "in_abc123",
      "amountCents": 9900,
      "currency": "USD",
      "status": "paid",
      "invoicePdfUrl": "https://pay.stripe.com/invoice/in_abc123/pdf",
      "periodStart": "2025-01-01T00:00:00Z",
      "periodEnd": "2025-02-01T00:00:00Z",
      "paidAt": "2025-01-01T00:05:00Z"
    }
  ]
}
```

#### POST /api/webhooks/stripe
Handle Stripe webhook events (server-to-server).

**Auth**: Stripe signature verification

**Headers:**
- `Stripe-Signature`: Webhook signature for verification

**Body:** Raw Stripe event JSON

**Handled Events:**
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_method.attached`

### Quota Management

#### GET /api/quotas/status
Get current quota usage for organization.

**Auth**: Required
**Permissions**: Any member

**Response:**
```json
{
  "success": true,
  "data": {
    "sites": { "current": 2, "limit": 3, "remaining": 1, "percentage": 66.7 },
    "posts": { "current": 45, "limit": 100, "remaining": 55, "percentage": 45.0 },
    "users": { "current": 3, "limit": 5, "remaining": 2, "percentage": 60.0 },
    "storage_bytes": { "current": 2147483648, "limit": 5368709120, "remaining": 3221225472, "percentage": 40.0 },
    "api_calls": { "current": 15000, "limit": 100000, "remaining": 85000, "percentage": 15.0 }
  }
}
```

#### POST /api/quotas/check
Check if action is allowed (internal API, called by services).

**Auth**: Required
**Permissions**: System (not exposed to frontend)

**Request:**
```json
{
  "organizationId": 1,
  "dimension": "posts",
  "amount": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "current": 45,
    "limit": 100,
    "remaining": 55
  }
}
```

### Organization Management

#### POST /api/organizations
Create new organization (auto-invoked on user signup for Free tier).

**Auth**: Required

**Request:**
```json
{
  "name": "Acme Corporation",
  "slug": "acme-corp"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "ownerId": 1,
    "planTier": "free",
    "createdAt": "2025-01-21T00:00:00Z"
  }
}
```

#### GET /api/organizations/:id/members
List organization members with roles.

**Auth**: Required
**Permissions**: Any member

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 1,
      "email": "owner@acme.com",
      "name": "Jane Doe",
      "role": "owner",
      "joinedAt": "2025-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "userId": 2,
      "email": "editor@acme.com",
      "name": "John Smith",
      "role": "editor",
      "joinedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

#### POST /api/organizations/:id/invites
Invite new member to organization.

**Auth**: Required
**Permissions**: Owner, Admin

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "editor"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "newuser@example.com",
    "role": "editor",
    "inviteToken": "inv_abc123xyz",
    "expiresAt": "2025-02-05T00:00:00Z"
  }
}
```

#### POST /api/organizations/invites/:token/accept
Accept organization invite.

**Auth**: Required

**Response:**
```json
{
  "success": true,
  "data": {
    "organizationId": 1,
    "role": "editor",
    "joinedAt": "2025-01-21T00:00:00Z"
  }
}
```

#### PATCH /api/organizations/:id/members/:userId
Update member role.

**Auth**: Required
**Permissions**: Owner, Admin

**Request:**
```json
{
  "role": "admin"
}
```

#### DELETE /api/organizations/:id/members/:userId
Remove member from organization.

**Auth**: Required
**Permissions**: Owner, Admin (cannot remove self)

---

## Implementation Plan

### Phase 1: Database & Stripe Foundation (Week 1-2)

**Goal**: Set up multi-tenant schema and Stripe integration

**Tickets:**
- **SF-001**: Database schema migrations (organizations, subscriptions, quotas, members, invites)
- **SF-002**: Stripe account setup (test mode keys, webhook endpoint)
- **SF-003**: SubscriptionService foundation (Checkout session creation)
- **SF-004**: Webhook handler with idempotency (process subscription.created, invoice.paid)

**Deliverables:**
- ✅ PostgreSQL schema with 10 new tables
- ✅ Stripe Checkout working in test mode
- ✅ Webhook endpoint receiving and processing events
- ✅ Basic subscription record creation

**Validation:**
- Can create test subscription via Stripe Checkout
- Webhooks update database correctly
- Idempotency prevents duplicate processing

---

### Phase 2: RBAC & Organization Management (Week 3-4)

**Goal**: Multi-tenant organization structure with role-based access

**Tickets:**
- **SF-005**: OrganizationService (create, get, update)
- **SF-006**: Member management (invite, accept, remove)
- **SF-007**: RBAC middleware (check permissions before actions)
- **SF-008**: Auto-create Free tier org on signup

**Deliverables:**
- ✅ Organizations can have multiple members
- ✅ Invites sent via email with accept flow
- ✅ Permissions enforced on all routes
- ✅ New users get Free tier org automatically

**Validation:**
- Owner can invite Editor
- Editor can create posts but not invite users
- Viewer can only read content
- Removed members lose access immediately

---

### Phase 3: Quota System & Enforcement (Week 5-6)

**Goal**: Real-time usage tracking and enforcement

**Tickets:**
- **SF-009**: QuotaService (check, increment, reset)
- **SF-010**: Quota enforcement middleware on routes
- **SF-011**: Monthly quota reset job (API calls)
- **SF-012**: Quota warning emails (80%, 90%, 95%)

**Deliverables:**
- ✅ All create actions check quotas first
- ✅ 402 Payment Required returned when quota exceeded
- ✅ Upgrade prompts shown in UI
- ✅ Email sent when approaching limits

**Validation:**
- Free tier blocked at 2nd site creation
- API calls reset on 1st of month
- Email sent when storage hits 80%
- Upgrade to Starter increases limits immediately

---

### Phase 4: Webhooks & Email System (Week 7-8)

**Goal**: Complete webhook handling and transactional emails

**Tickets:**
- **SF-013**: EmailService with SendGrid integration
- **SF-014**: Email templates (welcome, receipt, quota warning, invite)
- **SF-015**: Complete webhook event handling (all Stripe events)
- **SF-016**: Subscription lifecycle management (trial, active, past_due, canceled)

**Deliverables:**
- ✅ Welcome email sent on signup
- ✅ Receipt email sent after payment
- ✅ Quota warning emails working
- ✅ All Stripe webhook events handled

**Validation:**
- Emails delivered to inbox (not spam)
- Links in emails work correctly
- Webhooks idempotent (duplicate events ignored)
- Past_due subscriptions downgraded to Free after 7 days

---

### Phase 5: Frontend Billing Dashboard (Week 9-10)

**Goal**: Self-service billing management for customers

**Tickets:**
- **SF-017**: Billing page UI (current plan, usage, upgrade CTA)
- **SF-018**: Stripe Checkout integration (redirect flow)
- **SF-019**: Stripe Customer Portal link
- **SF-020**: Quota status dashboard with progress bars
- **SF-021**: Organization settings page (members, invites, roles)

**Deliverables:**
- ✅ Users can view current plan and usage
- ✅ "Upgrade" button redirects to Stripe Checkout
- ✅ "Manage Billing" button opens Customer Portal
- ✅ Organization owners can invite/remove members

**Validation:**
- Checkout flow completes successfully
- Customer Portal allows plan changes
- Usage bars update in real-time
- Member list shows correct roles

---

### Phase 6: Testing & Production Deployment (Week 11-12)

**Goal**: Comprehensive testing and production launch

**Tickets:**
- **SF-022**: Unit tests for SubscriptionService, QuotaService, OrganizationService
- **SF-023**: Integration tests (Stripe webhook simulation, quota enforcement)
- **SF-024**: E2E tests (signup → checkout → webhook → dashboard)
- **SF-025**: Production Stripe setup (live keys, webhook endpoint, tax settings)
- **SF-026**: Monitoring & alerting (webhook failures, quota enforcement, payment failures)
- **SF-027**: Documentation (API docs, integration guide, troubleshooting)

**Deliverables:**
- ✅ 90%+ test coverage on service layer
- ✅ Production Stripe account configured
- ✅ Monitoring dashboards in place
- ✅ API documentation published

**Validation:**
- All tests pass in CI/CD
- Production webhooks processing correctly
- First paying customer onboarded successfully
- No critical bugs in production

---

## Risk Assessment

### High Risks (Require Mitigation)

#### 1. Stripe Webhook Reliability
**Risk**: Webhooks fail or are delayed, causing subscription state drift.

**Impact**: Customers charged but not upgraded; database out of sync with Stripe.

**Mitigation:**
- Idempotency keys on all webhook handlers (check `stripe_event_id` uniqueness)
- Retry logic with exponential backoff (3 attempts)
- Manual sync endpoint for admins: `POST /api/admin/sync-stripe`
- Monitoring alerts for webhook failures >5 in 1 hour
- Daily reconciliation job comparing Stripe vs. database state

**Fallback**: Customer Support can manually update subscription status via admin panel

---

#### 2. Quota Enforcement Race Conditions
**Risk**: Two requests create resources simultaneously, bypassing quota checks.

**Impact**: Organization exceeds limits (e.g., creates 4 sites on 3-site limit).

**Mitigation:**
- PostgreSQL row-level locking on `usage_quotas` table (`SELECT FOR UPDATE`)
- Atomic increment with check: `UPDATE usage_quotas SET current_usage = current_usage + 1 WHERE current_usage < quota_limit`
- Quota checks in database transaction with resource creation
- Periodic audit job flags violations (email support)

**Acceptance**: Small overages tolerated (<5% over limit); reconciled monthly

---

#### 3. Stripe Payment Failures
**Risk**: Payments fail due to card issues, hitting retry limits.

**Impact**: Customers downgraded to Free tier, lose access to content.

**Mitigation:**
- Grace period: 7 days past_due before downgrade
- Email reminders on day 1, 3, 5 after payment failure
- Customer Portal link to update payment method
- Smart Retries enabled in Stripe (automatic retry after 3 days)
- Soft enforcement: Read-only mode during grace period (can view, not create)

**Support SLA**: Manual payment link sent within 24 hours of request

---

#### 4. Multi-Tenant Data Isolation Bugs
**Risk**: User from Org A accesses data from Org B due to missing `organization_id` filter.

**Impact**: Critical security breach; data leakage between customers.

**Mitigation:**
- All database queries require `organization_id` in WHERE clause
- Middleware enforces `req.user.organizationId` populated from JWT
- Integration tests with multiple orgs validate isolation
- PostgreSQL row-level security (RLS) policies as defense-in-depth:
  ```sql
  ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation ON posts
    USING (organization_id = current_setting('app.current_organization_id')::int);
  ```
- Quarterly security audits by external firm

**Response Plan**: If breach detected, notify affected customers within 72 hours per GDPR

---

### Medium Risks

#### 5. SendGrid Email Deliverability
**Risk**: Emails land in spam, customers don't receive invites/receipts.

**Impact**: Poor onboarding experience; missed quota warnings.

**Mitigation:**
- Domain authentication (SPF, DKIM, DMARC records)
- Warm up sending reputation (start with low volume)
- Unsubscribe links in non-critical emails
- Monitor bounce rate and spam complaints
- Fallback: In-app notifications for critical actions

---

#### 6. Stripe Tax Calculation
**Risk**: Incorrect tax rates applied, compliance issues.

**Impact**: Legal liability; customer disputes.

**Mitigation:**
- Enable Stripe Tax (automatic calculation based on customer location)
- Collect billing address during checkout
- Set up tax registrations in key regions (EU VAT, US sales tax)
- Quarterly review with accountant

---

## Open Questions for Stakeholders

### Product Decisions

1. **Free Tier Limits**: Are 1 site + 20 posts sufficient for lead generation, or too restrictive?
   - **Recommendation**: Keep limits low to encourage upgrades, but offer trial of Starter (14 days)

2. **Trial Period**: Offer 14-day free trial of Starter/Pro, or no trial?
   - **Recommendation**: 14-day trial with payment method required upfront (reduces fraud, increases conversion)

3. **Downgrade Handling**: When customer downgrades from Pro to Starter, what happens to excess content?
   - **Recommendation**: Read-only mode for excess sites/posts until within limits (soft enforcement)

4. **Annual Discount**: 2 months free (16.7%) competitive?
   - **Recommendation**: Yes - standard SaaS practice (Stripe: 20%, Slack: 17%)

5. **Enterprise Pricing**: Custom pricing or start at $499/mo?
   - **Recommendation**: Custom only - allows negotiation, higher ASP

---

### Technical Decisions

6. **Redis for Quota Caching**: Add Redis in Phase 1 or defer to Phase 2?
   - **Recommendation**: Defer to Phase 2 - PostgreSQL fast enough for <200 customers (<50ms queries)

7. **Webhook Retry Strategy**: How many retries before giving up?
   - **Recommendation**: 3 retries with exponential backoff (5s, 25s, 125s), then alert support

8. **Quota Reset Timing**: Reset API calls at billing cycle or calendar month?
   - **Recommendation**: Billing cycle - aligns with invoice, no surprise overages

9. **Multi-Currency Support**: USD only or support EUR, GBP?
   - **Recommendation**: USD only in Phase 1, add EUR/GBP in Phase 2 if international customers >20%

10. **Payment Method**: Credit card only or also SEPA, bank transfer?
    - **Recommendation**: Credit card only in Phase 1 (Stripe Checkout), add SEPA in Phase 2 for EU customers

---

## Cost Optimization Strategy

### Infrastructure Costs by Customer Count

#### 0-50 Customers (Month 1-3): $0-5/mo
- **Frontend**: Vercel free tier (100 GB bandwidth)
- **Backend**: Railway Hobby plan ($5/mo) or Render free tier
- **Database**: Neon free tier (0.5 GB storage, 100 hours compute)
- **Email**: SendGrid free tier (100 emails/day = 3,000/mo)
- **Monitoring**: Free tiers (Sentry, LogRocket)
- **Total**: **$0-5/mo**

#### 50-200 Customers (Month 4-12): $70-90/mo
- **Frontend**: Vercel Pro ($20/mo, 1 TB bandwidth)
- **Backend**: Railway Pro ($20/mo, 8 GB RAM)
- **Database**: Neon Launch plan ($19/mo, 10 GB storage)
- **Email**: SendGrid Essentials ($15/mo, 50k emails)
- **Redis**: Upstash pay-as-you-go ($10/mo)
- **Monitoring**: Sentry Team ($26/mo)
- **Total**: **$70-90/mo**

#### 200-1000 Customers (Year 2): $300-350/mo
- **Frontend**: Vercel Enterprise ($250/mo)
- **Backend**: Railway scaled ($50/mo)
- **Database**: Neon Scale ($69/mo, autoscaling)
- **Email**: SendGrid Pro ($90/mo, 100k emails)
- **Redis**: Upstash scaled ($30/mo)
- **Monitoring**: Sentry Business ($90/mo)
- **Total**: **$300-350/mo**

### Revenue per Dollar Spent

**Target Ratios:**
- Month 3: $1,500 MRR / $5 infra = **300x return**
- Month 12: $15,000 MRR / $90 infra = **167x return**
- Year 2: $100,000 MRR / $350 infra = **286x return**

### Cost-Saving Techniques

1. **PostgreSQL-First**: No Redis until customer count justifies cost
2. **LRU In-Memory Cache**: Cache quota limits in Node.js process (evict after 5 min)
3. **Serverless Database**: Neon charges only for active compute time
4. **Email Batching**: Group notifications to avoid hitting SendGrid limits
5. **CDN Caching**: Vercel Edge Network caches frontend assets
6. **Lazy Loading**: Load Stripe SDK only on billing page

---

## Success Metrics (Track Monthly)

### Adoption Metrics
- **Signups**: New organizations created
- **Activation Rate**: % of signups who create first site (target: >60%)
- **Paid Conversion**: % of Free tier orgs that upgrade (target: >10% in 90 days)
- **Trial-to-Paid**: % of trials that convert to paid (target: >40%)

### Revenue Metrics
- **MRR (Monthly Recurring Revenue)**: Target $1,500 by Week 12
- **ARPU (Average Revenue Per User)**: Target $50/mo
- **LTV (Lifetime Value)**: Target $1,500 (30 months average tenure)
- **CAC (Customer Acquisition Cost)**: Target <$150 (LTV:CAC = 10:1)

### Quota Metrics
- **Quota Exceeded Events**: Count of 402 responses (target: <5% of requests)
- **Upgrade Prompt Clicks**: CTR on upgrade CTA (target: >10%)
- **Quota Warning Emails**: Open rate (target: >40%)
- **Average Quota Usage**: % of limit used per dimension (target: 60-80% to encourage upgrades)

### Payment Metrics
- **Payment Success Rate**: % of charges that succeed (target: >95%)
- **Past Due Rate**: % of subscriptions past_due (target: <5%)
- **Churn Rate**: % of paid customers who cancel (target: <5%/mo)
- **Involuntary Churn**: % canceled due to payment failure (target: <2%/mo)

### Performance Metrics
- **Quota Check Latency**: p95 latency for quota enforcement (target: <100ms)
- **Webhook Processing Time**: p95 time from Stripe event to DB update (target: <500ms)
- **Checkout Completion Rate**: % who complete Stripe Checkout (target: >85%)

### Support Metrics
- **Billing Support Tickets**: Count per month (target: <10)
- **Payment Failure Response Time**: Time to resolve payment issues (target: <24 hours)
- **Quota Upgrade Requests**: Manual quota increases (should be rare: <5/mo)

---

## Security & Compliance

### Data Security
- **Encryption at Rest**: PostgreSQL encrypted with AES-256
- **Encryption in Transit**: TLS 1.3 for all API traffic
- **PII Handling**: Email addresses encrypted in database
- **Stripe Keys**: Stored in environment variables, never in code

### Compliance Requirements
- **GDPR**: Data deletion endpoint for EU customers
- **PCI DSS**: Stripe handles all card data (Level 1 compliant)
- **SOC 2 Type II**: Planned for Year 2 (50+ enterprise customers)

### Audit Logging
- **Subscription Changes**: Log all tier changes, cancellations
- **Payment Events**: Track successful/failed payments
- **Permission Changes**: Audit role updates, member removals
- **Quota Overrides**: Log manual quota adjustments by support

---

## Dependencies & Blockers

### Critical Path Items (Must Have Before Week 1)
- [ ] Stripe account approved (test mode + live mode)
- [ ] Domain configured for email (SPF, DKIM, DMARC records)
- [ ] SendGrid account created and verified
- [ ] PostgreSQL migrations tested on staging
- [ ] JWT authentication working (auth system prerequisite)

### Nice-to-Have (Can Acquire During Implementation)
- [ ] Stripe Tax registrations (EU VAT, US sales tax)
- [ ] Logo for billing page
- [ ] Terms of Service and Privacy Policy links
- [ ] Customer success playbook

---

## Communication Plan

### Weekly Updates (Every Friday)
- Sprint progress (tickets completed, in progress, blocked)
- Live demo of new functionality
- Revenue metrics (signups, conversions, MRR)
- Blockers and support needs

### Milestone Reviews
- **Week 4**: Database + Stripe integration demo, validate webhook flow
- **Week 8**: RBAC + quota system demo, test enforcement
- **Week 12**: Full billing dashboard demo, launch readiness review

### Slack Channels
- `#saas-foundation` - General updates, questions
- `#saas-dev` - Technical discussions, code reviews
- `#saas-billing-support` - Customer payment issues

---

## Approval Checklist

Before proceeding to implementation, obtain sign-off from:

- [ ] **Product Manager**: Approve pricing tiers, Free tier limits, trial strategy
- [ ] **Engineering Lead**: Approve PostgreSQL-first approach, webhook architecture
- [ ] **Finance/Exec**: Approve budget ($69k dev + $0-80/mo infrastructure for 12 weeks)
- [ ] **Legal**: Review terms of service, GDPR compliance plan
- [ ] **Design Lead**: Approve billing dashboard wireframes
- [ ] **DevOps Lead**: Confirm hosting strategy (Vercel + Railway + Neon)

---

## Conclusion

This comprehensive SaaS Foundation provides everything needed to monetize DProgres CMS:

✅ **Revenue-Focused**: $1,500 MRR by Week 12 validates pricing and packaging
✅ **Cost-Optimized**: $0-5/mo for first 50 customers, scales linearly with revenue
✅ **Market-Competitive**: Price leader vs. Contentful ($300+), Sanity ($99+)
✅ **Technically Sound**: Stripe best practices, PostgreSQL-first, webhook idempotency
✅ **Risk-Managed**: Grace periods, soft limits, data isolation policies
✅ **Scalable**: Supports 1,000+ customers without architecture changes

**Ready to proceed**: Obtain stakeholder approvals and kick off Week 1 (SF-001 to SF-004) 🚀

---

**Document Version**: 1.0
**Last Updated**: 2025-01-21
**Next Review**: After Week 4 milestone (Stripe integration complete)
