# Deployment Checklist

This document provides step-by-step checklists for deploying DProgres CMS to production.

## Table of Contents

- [Pre-Deployment](#pre-deployment)
- [Stripe Production Setup](#stripe-production-setup)
- [Environment Variables](#environment-variables)
- [Database Migration](#database-migration)
- [Application Deployment](#application-deployment)
- [Post-Deployment Validation](#post-deployment-validation)
- [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment

### Code Quality Checks

- [ ] All unit tests passing (`cd backend && npm test`)
- [ ] All frontend tests passing (`cd frontend && npm test`)
- [ ] E2E tests passing (`cd frontend && npm run test:e2e`)
- [ ] TypeScript compilation successful (`cd backend && npx tsc --noEmit`)
- [ ] ESLint checks passing (`npm run lint` in both directories)
- [ ] No console.log or debug code in production code
- [ ] No hardcoded secrets or API keys in codebase

### Code Review

- [ ] Pull request approved by at least one reviewer
- [ ] Security review completed for sensitive changes
- [ ] Database migration reviewed if applicable
- [ ] API changes documented

### Documentation

- [ ] CHANGELOG updated with new features/fixes
- [ ] API documentation updated for new endpoints
- [ ] Environment variables documented in `.env.example`

---

## Stripe Production Setup

See `docs/STRIPE_SETUP.md` for detailed instructions.

### Stripe Dashboard Configuration

- [ ] Business verification completed
- [ ] Bank account configured for payouts
- [ ] Switch to Live mode (toggle off Test mode)

### API Keys

- [ ] Live publishable key generated (`pk_live_...`)
- [ ] Live secret key generated (`sk_live_...`)
- [ ] Keys stored securely (never in code)

### Products & Prices

- [ ] Starter Plan product created (live mode)
  - [ ] Monthly price: $29.00 USD
  - [ ] Annual price: $290.00 USD
  - [ ] Price IDs copied
- [ ] Pro Plan product created (live mode)
  - [ ] Monthly price: $99.00 USD
  - [ ] Annual price: $990.00 USD
  - [ ] Price IDs copied

### Webhook Endpoint

- [ ] Production webhook endpoint added: `https://api.dprogres.com/api/webhooks/stripe`
- [ ] All 11 required events selected:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.created`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_succeeded`
  - [ ] `invoice.payment_failed`
  - [ ] `customer.updated`
  - [ ] `payment_method.attached`
  - [ ] `payment_method.detached`
  - [ ] `customer.subscription.trial_will_end`
  - [ ] `invoice.upcoming`
- [ ] Webhook signing secret copied (`whsec_...`)

### Optional Features

- [ ] Stripe Tax enabled (if applicable)
- [ ] Domain authentication configured for emails
- [ ] Customer Portal branding configured

---

## Environment Variables

### Required Variables

Configure these in your hosting platform:

```env
# Application
NODE_ENV=production
PORT=5000
APP_URL=https://app.dprogres.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/cms_db

# JWT Authentication
JWT_SECRET=<generate-secure-secret>
JWT_REFRESH_SECRET=<generate-secure-secret>

# Stripe (Production)
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...

# Stripe Price IDs (Production)
STRIPE_PRICE_STARTER_MONTHLY_LIVE=price_...
STRIPE_PRICE_STARTER_ANNUAL_LIVE=price_...
STRIPE_PRICE_PRO_MONTHLY_LIVE=price_...
STRIPE_PRICE_PRO_ANNUAL_LIVE=price_...

# Email (SendGrid)
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@dprogres.com
SENDGRID_FROM_NAME=DProgres CMS
```

### Checklist

- [ ] All required environment variables configured
- [ ] Secrets are unique per environment
- [ ] No test/dev values in production
- [ ] Variables verified before deployment

---

## Database Migration

### Pre-Migration

- [ ] Database backup created
- [ ] Migration scripts reviewed
- [ ] Rollback script prepared

### Migration Steps

1. Create backup:
   ```bash
   pg_dump -U postgres cms_db > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. Run migrations:
   ```bash
   # Apply new migrations
   psql -U postgres -d cms_db -f migrations/XXX_migration_name.sql
   ```

3. Verify:
   ```bash
   # Check tables exist
   psql -U postgres -d cms_db -c "\dt"

   # Check indexes
   psql -U postgres -d cms_db -c "\di"
   ```

### Post-Migration

- [ ] All tables created successfully
- [ ] Indexes created successfully
- [ ] Data integrity verified
- [ ] Application can connect to database

---

## Application Deployment

### Docker Deployment

```bash
# Build images
docker-compose build

# Start services in production mode
docker-compose up -d

# Check logs
docker-compose logs -f app
```

**Note**: For production, ensure environment variables are set before running docker-compose. You may create a `docker-compose.override.yml` for production-specific settings or use environment-specific `.env` files.

### Deployment Verification

- [ ] Application starts without errors
- [ ] Health check endpoint responds (`GET /api/health`)
- [ ] Database connection established
- [ ] Redis connection established (if applicable)

---

## Post-Deployment Validation

### API Endpoints

- [ ] `GET /api/health` returns 200
- [ ] `POST /api/auth/login` works with valid credentials
- [ ] `GET /api/billing/plans` returns plan data

### Stripe Integration

- [ ] Webhook endpoint accessible from Stripe
- [ ] Test webhook delivery:
  ```bash
  stripe trigger checkout.session.completed --live
  ```
- [ ] Webhook logs show successful delivery (Stripe Dashboard)
- [ ] Checkout flow works with real card (small amount, refund after)
- [ ] Customer portal accessible

### Email Notifications

- [ ] Welcome email sends on signup
- [ ] Trial ending email template working
- [ ] Invoice upcoming email template working

### Monitoring

- [ ] Application logs flowing to monitoring system
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Uptime monitoring enabled
- [ ] Alert thresholds configured

---

## Rollback Procedures

### Application Rollback

```bash
# Docker rollback to previous image
docker-compose down
docker-compose up -d --build

# Or revert to specific tag
docker pull dprogres/cms:v1.2.3
docker-compose up -d
```

### Database Rollback

```bash
# Restore from backup
psql -U postgres -d cms_db < backup_YYYYMMDD_HHMMSS.sql
```

### Stripe Rollback

If Stripe configuration issues:
1. Disable webhook endpoint in Stripe Dashboard
2. Revert environment variables to test mode
3. Investigate and fix issues
4. Re-enable production configuration

---

## Contact Information

### On-Call Rotation

- Primary: [Team Lead]
- Secondary: [Senior Developer]
- Escalation: [Engineering Manager]

### External Support

- Stripe Support: https://support.stripe.com
- SendGrid Support: https://support.sendgrid.com
- Hosting Provider: [Contact details]

---

**Last Updated**: December 2025
**Version**: 1.0
**Related Documents**: `STRIPE_SETUP.md`, `TROUBLESHOOTING.md`
