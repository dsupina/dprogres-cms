# SaaS Deployment Guide

This guide provides comprehensive deployment instructions for DProgres CMS SaaS infrastructure.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Stripe Configuration](#stripe-configuration)
- [Email Configuration](#email-configuration)
- [Monitoring Setup](#monitoring-setup)
- [Deployment Checklist](#deployment-checklist)
- [Post-Deployment Verification](#post-deployment-verification)

---

## Prerequisites

### Required Services
- **PostgreSQL 14+** - Primary database
- **Node.js 18+** - Runtime environment
- **Redis** (optional) - Caching layer (planned)
- **Docker** (optional) - Container deployment

### External Services
- **Stripe Account** - Payment processing
- **SendGrid Account** - Transactional emails
- **Sentry Account** (optional) - Error tracking
- **Slack Workspace** (optional) - Alert notifications

---

## Environment Configuration

### Backend Environment Variables

Create `.env` file in `backend/` directory:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/cms_db

# JWT Authentication
JWT_SECRET=<32+ character random string>
JWT_REFRESH_SECRET=<32+ character random string>
JWT_INVITE_SECRET=<32+ character random string>

# Server Configuration
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://app.yourdomain.com
APP_URL=https://app.yourdomain.com

# File Uploads
UPLOAD_DIR=uploads
MAX_FILE_SIZE=52428800

# Stripe Configuration (Production)
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...

# Stripe Price IDs (Production)
STRIPE_PRICE_STARTER_MONTHLY_LIVE=price_...
STRIPE_PRICE_STARTER_ANNUAL_LIVE=price_...
STRIPE_PRICE_PRO_MONTHLY_LIVE=price_...
STRIPE_PRICE_PRO_ANNUAL_LIVE=price_...

# SendGrid Email
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Your App Name

# Monitoring & Alerting (Optional)
SENTRY_DSN=https://xxx@sentry.io/123
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL=alerts@yourdomain.com
```

### Secret Generation

Generate secure secrets:

```bash
# Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate AES key for preview tokens
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## Database Setup

### 1. Create Database

```sql
CREATE DATABASE cms_db;
CREATE USER cms_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE cms_db TO cms_user;
```

### 2. Run Migrations

Execute migrations in order:

```bash
cd backend

# Run all migrations
for file in migrations/0*.sql; do
  psql $DATABASE_URL -f "$file"
done
```

Migration Order:
1. `001_create_organizations.sql` - Organizations table
2. `002_create_subscriptions.sql` - Subscriptions & invoices
3. `003_create_usage_quotas.sql` - Quota tracking
4. `004_create_organization_members.sql` - RBAC tables
5. `005_add_organization_id_to_content.sql` - Multi-tenant isolation
6. `006_add_soft_delete_to_organizations.sql` - Soft delete
7. `007_add_soft_delete_to_organization_members.sql` - Member soft delete
8. `008_fix_organization_members_unique_constraint.sql` - Unique constraints
9. `009_fix_organization_invites_unique_constraint.sql` - Invite constraints
10. `010_add_stripe_cancel_pending.sql` - Cancel pending support

### 3. Verify Migration

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify indexes
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public';
```

---

## Stripe Configuration

### 1. Create Products in Stripe Dashboard

Create subscription products:

| Product | Monthly Price | Annual Price |
|---------|---------------|--------------|
| Starter | $29/month | $290/year |
| Pro | $99/month | $990/year |

### 2. Configure Webhook Endpoint

In Stripe Dashboard > Developers > Webhooks:

1. Add endpoint: `https://api.yourdomain.com/api/webhooks/stripe`
2. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `invoice.upcoming`
   - `customer.updated`
   - `payment_method.attached`
   - `payment_method.detached`

3. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET_LIVE`

### 3. Configure Customer Portal

In Stripe Dashboard > Settings > Billing > Customer Portal:

1. Enable self-service portal
2. Configure allowed actions:
   - Cancel subscription
   - Update payment method
   - View invoices
3. Set return URL: `https://app.yourdomain.com/admin/billing`

### 4. Test Webhook Connection

```bash
# Trigger test event from Stripe CLI
stripe trigger checkout.session.completed

# Check webhook logs
stripe logs tail --filter "status:failed"
```

---

## Email Configuration

### 1. Verify SendGrid Domain

1. Add domain to SendGrid > Settings > Sender Authentication
2. Add DNS records (CNAME, TXT)
3. Wait for verification (up to 48 hours)

### 2. Create API Key

1. SendGrid > Settings > API Keys > Create API Key
2. Select "Restricted Access"
3. Enable: Mail Send (Full Access)
4. Copy key to `SENDGRID_API_KEY`

### 3. Test Email Delivery

```bash
# Test via API
curl --request POST \
  --url https://api.sendgrid.com/v3/mail/send \
  --header "Authorization: Bearer $SENDGRID_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"personalizations":[{"to":[{"email":"test@example.com"}]}],"from":{"email":"noreply@yourdomain.com"},"subject":"Test","content":[{"type":"text/plain","value":"Test email"}]}'
```

---

## Monitoring Setup

### 1. Sentry Configuration

1. Create Sentry project for Node.js
2. Copy DSN to `SENTRY_DSN`
3. Configure source maps (optional):

```bash
# Upload source maps during build
sentry-cli releases new $VERSION
sentry-cli releases files $VERSION upload-sourcemaps dist/
sentry-cli releases finalize $VERSION
```

### 2. Slack Alerts

1. Create Slack app at api.slack.com
2. Add Incoming Webhooks integration
3. Copy webhook URL to `SLACK_WEBHOOK_URL`
4. Configure channel for alerts

### 3. Alert Configuration

Default alerts (configurable via API):

| Alert | Threshold | Window | Severity |
|-------|-----------|--------|----------|
| Webhook failures | >5 failures | 60 min | Critical |
| Payment failures | >3 failures | 60 min | Critical |
| API response time | >300ms p95 | 5 min | Warning |
| Database errors | >3 errors | 5 min | Critical |
| Email failures | >5 failures | 60 min | Warning |

---

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database migrations executed
- [ ] Stripe webhook configured and verified
- [ ] SendGrid domain verified
- [ ] SSL certificates installed
- [ ] DNS records configured

### Build & Deploy

```bash
# Backend
cd backend
npm ci --production
npm run build

# Frontend
cd frontend
npm ci
npm run build

# Start application
NODE_ENV=production npm start
```

### Docker Deployment

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f app
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
# Check API health
curl https://api.yourdomain.com/api/health

# Check metrics endpoint
curl -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/api/metrics/health
```

### 2. Verify Stripe Integration

```bash
# Create test checkout (use test mode first)
curl -X POST https://api.yourdomain.com/api/billing/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan_tier":"starter","billing_cycle":"monthly"}'
```

### 3. Test Webhook Processing

1. Complete a test checkout in Stripe test mode
2. Check subscription_events table for processed events
3. Verify subscription created in database

```sql
SELECT * FROM subscription_events
ORDER BY created_at DESC LIMIT 10;

SELECT * FROM subscriptions
ORDER BY created_at DESC LIMIT 10;
```

### 4. Verify Email Delivery

1. Trigger a quota warning (increment to 80%+)
2. Check email delivery in SendGrid Activity

### 5. Monitor Initial Traffic

```bash
# Watch webhook metrics
watch -n 10 "curl -s -H 'Authorization: Bearer $TOKEN' \
  https://api.yourdomain.com/api/metrics/webhooks | jq"
```

---

## Rollback Procedures

### Database Rollback

```sql
-- Reverse each migration in order
-- Example: Rollback migration 010
DROP INDEX IF EXISTS idx_subscriptions_cancel_pending;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancel_at_period_end_pending;
```

### Application Rollback

```bash
# Revert to previous version
git checkout v1.x.x
npm ci
npm run build
npm start
```

---

## Security Checklist

- [ ] All secrets rotated from development
- [ ] Database credentials unique per environment
- [ ] Stripe webhook signature verification enabled
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled
- [ ] CSP headers configured
- [ ] HTTPS enforced (HSTS enabled)

---

## Related Documentation

- [API Reference](./API_BILLING.md) - Billing endpoints
- [Architecture](./ARCHITECTURE_SAAS.md) - System design
- [Troubleshooting](./TROUBLESHOOTING_BILLING.md) - Common issues
- [Runbook](./RUNBOOK_BILLING.md) - Operational procedures
