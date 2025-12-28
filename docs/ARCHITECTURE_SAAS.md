# SaaS Billing Architecture

This document describes the architecture of the DProgres CMS SaaS billing system, including system components, data flow, and integration patterns.

## System Overview

```
                                    DProgres CMS SaaS Architecture
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                      CLIENTS                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │  Web App    │  │  Admin UI   │  │  API Client │  │  CLI Tool   │                     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                     │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              LOAD BALANCER / CDN                                         │
│                              (Nginx / Cloudflare)                                        │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    │                                          │
                    ▼                                          ▼
┌───────────────────────────────────┐          ┌───────────────────────────────────┐
│         FRONTEND (React)          │          │         BACKEND (Express)          │
│  ┌─────────────────────────────┐  │          │  ┌─────────────────────────────┐  │
│  │  Billing UI Components      │  │          │  │  API Routes                 │  │
│  │  - Plan Selection           │  │          │  │  - /api/billing/*           │  │
│  │  - Usage Dashboard          │  │          │  │  - /api/quotas/*            │  │
│  │  - Invoice History          │  │          │  │  - /api/metrics/*           │  │
│  │  - Payment Methods          │  │          │  │  - /api/webhooks/stripe     │  │
│  └─────────────────────────────┘  │          │  └─────────────────────────────┘  │
│  Port: 5173 (dev) / 80 (prod)     │          │  Port: 5000                       │
└───────────────────────────────────┘          └──────────────┬────────────────────┘
                                                              │
                    ┌─────────────────────────────────────────┼─────────────────────────┐
                    │                                         │                          │
                    ▼                                         ▼                          ▼
┌───────────────────────────────┐  ┌───────────────────────────────────┐  ┌─────────────────────┐
│       PostgreSQL DB           │  │     External Services              │  │   Monitoring        │
│  ┌─────────────────────────┐  │  │  ┌─────────────────────────────┐  │  │  ┌───────────────┐  │
│  │  organizations          │  │  │  │  Stripe                     │  │  │  │  Sentry       │  │
│  │  subscriptions          │  │  │  │  - Checkout Sessions        │  │  │  │  (Errors)     │  │
│  │  invoices               │  │  │  │  - Subscriptions            │  │  │  └───────────────┘  │
│  │  usage_quotas           │  │  │  │  - Invoices                 │  │  │  ┌───────────────┐  │
│  │  subscription_events    │  │  │  │  - Webhooks                 │  │  │  │  Slack        │  │
│  │  payment_methods        │  │  │  └─────────────────────────────┘  │  │  │  (Alerts)     │  │
│  └─────────────────────────┘  │  │  ┌─────────────────────────────┐  │  │  └───────────────┘  │
│  Port: 5432                   │  │  │  SendGrid                   │  │  │                     │
└───────────────────────────────┘  │  │  - Transaction Emails       │  │  └─────────────────────┘
                                   │  │  - Billing Notifications    │  │
                                   │  └─────────────────────────────┘  │
                                   └───────────────────────────────────┘
```

## Component Architecture

### Backend Services

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  EXPRESS APPLICATION                                     │
│                                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │  Auth          │  │  Validation    │  │  Rate Limit    │  │  Quota         │        │
│  │  Middleware    │  │  Middleware    │  │  Middleware    │  │  Middleware    │        │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘        │
│          │                   │                   │                   │                  │
│          └───────────────────┴───────────────────┴───────────────────┘                  │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              ROUTE HANDLERS                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │   │
│  │  │  billing.ts │  │  quotas.ts  │  │  metrics.ts │  │ webhooks.ts │            │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │   │
│  └─────────┼────────────────┼────────────────┼────────────────┼────────────────────┘   │
│            │                │                │                │                         │
│            ▼                ▼                ▼                ▼                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              SERVICE LAYER                                       │   │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐            │   │
│  │  │ SubscriptionSvc   │  │   QuotaService    │  │  MonitoringService│            │   │
│  │  │ - createCheckout  │  │ - checkQuota      │  │ - recordWebhook   │            │   │
│  │  │ - updateSub       │  │ - incrementQuota  │  │ - getBillingMetrics│           │   │
│  │  │ - cancelSub       │  │ - decrementQuota  │  │ - getHealthStatus │            │   │
│  │  │ - getPortalUrl    │  │ - getQuotaStatus  │  │ - triggerAlert    │            │   │
│  │  └───────────────────┘  └───────────────────┘  └───────────────────┘            │   │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐            │   │
│  │  │ LifecycleService  │  │   EmailService    │  │ OrganizationSvc   │            │   │
│  │  │ - processGrace    │  │ - sendTrialEnd    │  │ - getAdminEmails  │            │   │
│  │  │ - downgradeOrg    │  │ - sendInvoice     │  │ - updatePlanTier  │            │   │
│  │  │ - emitEvents      │  │ - sendCanceled    │  │ - getMembers      │            │   │
│  │  └───────────────────┘  └───────────────────┘  └───────────────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              DATA ACCESS LAYER                                   │   │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                         PostgreSQL (pg library)                            │  │   │
│  │  │  - Connection Pool                                                         │  │   │
│  │  │  - Parameterized Queries                                                   │  │   │
│  │  │  - Transaction Support                                                     │  │   │
│  │  └───────────────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  DATABASE SCHEMA                                         │
│                                                                                          │
│  ┌─────────────────────────┐          ┌─────────────────────────┐                       │
│  │     organizations       │          │      subscriptions       │                       │
│  ├─────────────────────────┤          ├─────────────────────────┤                       │
│  │ id (PK)                 │◄─────────│ organization_id (FK)    │                       │
│  │ name                    │          │ id (PK)                 │                       │
│  │ plan_tier               │          │ stripe_subscription_id  │──────┐                │
│  │ billing_email           │          │ stripe_customer_id      │      │                │
│  │ created_at              │          │ stripe_price_id         │      │                │
│  │ updated_at              │          │ plan_tier               │      │                │
│  │ deleted_at              │          │ billing_cycle           │      │                │
│  └──────────┬──────────────┘          │ status                  │      │                │
│             │                         │ amount_cents            │      │                │
│             │                         │ currency                │      │                │
│             │                         │ current_period_start    │      │                │
│             │                         │ current_period_end      │      │                │
│             │                         │ cancel_at_period_end    │      │                │
│             │                         │ canceled_at             │      │                │
│             │                         │ trial_end               │      │                │
│             │                         └──────────┬──────────────┘      │                │
│             │                                    │                     │                │
│             ▼                                    ▼                     │                │
│  ┌─────────────────────────┐          ┌─────────────────────────┐     │                │
│  │      usage_quotas       │          │        invoices          │     │                │
│  ├─────────────────────────┤          ├─────────────────────────┤     │                │
│  │ organization_id (FK)    │          │ organization_id (FK)    │     │                │
│  │ dimension               │          │ subscription_id (FK)    │     │                │
│  │ current_usage           │          │ id (PK)                 │     │                │
│  │ quota_limit             │          │ stripe_invoice_id       │     │                │
│  │ period_start            │          │ amount_cents            │     │                │
│  │ period_end              │          │ amount_paid_cents       │     │                │
│  │ last_reset_at           │          │ currency                │     │                │
│  └─────────────────────────┘          │ status                  │     │                │
│                                       │ invoice_pdf_url         │     │                │
│  Dimensions:                          │ hosted_invoice_url      │     │                │
│  - sites                              │ billing_reason          │     │                │
│  - posts                              │ period_start            │     │                │
│  - users                              │ period_end              │     │                │
│  - storage_bytes                      │ paid_at                 │     │                │
│  - api_calls                          └─────────────────────────┘     │                │
│                                                                       │                │
│  ┌─────────────────────────┐          ┌─────────────────────────┐     │                │
│  │   subscription_events   │          │     payment_methods      │     │                │
│  ├─────────────────────────┤          ├─────────────────────────┤     │                │
│  │ id (PK)                 │          │ organization_id (FK)    │     │                │
│  │ stripe_event_id (UQ)    │◄─────────│ id (PK)                 │     │                │
│  │ event_type              │          │ stripe_payment_method_id│─────┘                │
│  │ organization_id (FK)    │          │ type                    │                       │
│  │ subscription_id (FK)    │          │ card_brand              │                       │
│  │ data (JSONB)            │          │ card_last4              │                       │
│  │ processed_at            │          │ card_exp_month          │                       │
│  │ processing_error        │          │ card_exp_year           │                       │
│  │ created_at              │          │ is_default              │                       │
│  └─────────────────────────┘          │ deleted_at              │                       │
│                                       └─────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Stripe Integration Flow

### Checkout Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │  Backend │     │  Stripe  │     │  Backend │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ POST /checkout │                │                │                │
     │───────────────►│                │                │                │
     │                │                │                │                │
     │                │ Create Session │                │                │
     │                │───────────────►│                │                │
     │                │                │                │                │
     │                │◄───────────────│                │                │
     │                │  Session URL   │                │                │
     │◄───────────────│                │                │                │
     │  Redirect URL  │                │                │                │
     │                │                │                │                │
     │═══════════════════════════════►│                │                │
     │         Customer Payment        │                │                │
     │◄═══════════════════════════════│                │                │
     │        Success Redirect         │                │                │
     │                │                │                │                │
     │                │                │  Webhook       │                │
     │                │                │───────────────►│                │
     │                │                │ checkout.      │                │
     │                │                │ completed      │                │
     │                │                │                │                │
     │                │                │                │ INSERT         │
     │                │                │                │ subscription   │
     │                │                │                │───────────────►│
     │                │                │                │                │
     │                │                │                │◄───────────────│
     │                │                │◄───────────────│                │
     │                │                │  200 OK        │                │
     │                │                │                │                │
```

### Webhook Processing Flow

```
┌──────────┐     ┌──────────────────────────────────────────┐     ┌──────────┐
│  Stripe  │     │                Backend                    │     │ Database │
└────┬─────┘     │  ┌─────────┐  ┌──────────┐  ┌─────────┐  │     └────┬─────┘
     │           │  │Signature│  │  Event   │  │ Handler │  │          │
     │           │  │ Verify  │  │  Router  │  │ Service │  │          │
     │           │  └────┬────┘  └────┬─────┘  └────┬────┘  │          │
     │           └───────┼───────────┼────────────┼────────┘          │
     │                   │           │            │                    │
     │ POST /webhooks    │           │            │                    │
     │──────────────────►│           │            │                    │
     │ stripe-signature  │           │            │                    │
     │                   │           │            │                    │
     │                   │ Verify    │            │                    │
     │                   │ Signature │            │                    │
     │                   │           │            │                    │
     │                   │ ──────────┤            │                    │
     │                   │  Valid    │            │                    │
     │                   │           │            │                    │
     │                   │           │ Check      │                    │
     │                   │           │ Idempotency│                    │
     │                   │           │────────────┼───────────────────►│
     │                   │           │            │                    │
     │                   │           │◄───────────┼────────────────────│
     │                   │           │  Not seen  │                    │
     │                   │           │            │                    │
     │                   │           │ Route to   │                    │
     │                   │           │ Handler    │                    │
     │                   │           │───────────►│                    │
     │                   │           │            │                    │
     │                   │           │            │ Process Event      │
     │                   │           │            │───────────────────►│
     │                   │           │            │                    │
     │                   │           │            │◄───────────────────│
     │                   │           │            │                    │
     │                   │           │            │ Mark Processed     │
     │                   │           │            │───────────────────►│
     │                   │           │            │                    │
     │◄──────────────────┼───────────┼────────────│                    │
     │    200 OK         │           │            │                    │
     │                   │           │            │                    │
```

## Subscription Lifecycle

```
                            Subscription State Machine

                                    ┌─────────┐
                                    │ CREATED │
                                    └────┬────┘
                                         │
                                         │ checkout.session.completed
                                         ▼
          ┌──────────────────────────────────────────────────────────┐
          │                                                          │
          │  ┌──────────┐          ┌──────────┐                     │
          │  │ TRIALING │─────────►│  ACTIVE  │◄────────────────────┤
          │  └──────────┘          └────┬─────┘                     │
          │       │ trial_end           │                            │
          │       │                     │ invoice.payment_failed     │
          │       └─────────────────────┘                            │
          │                             │                            │
          │                             ▼                            │
          │                      ┌──────────┐                        │
          │                      │ PAST_DUE │                        │
          │                      └────┬─────┘                        │
          │                           │                              │
          │         ┌─────────────────┼─────────────────┐            │
          │         │                 │                 │            │
          │         ▼                 ▼                 ▼            │
          │  ┌─────────────┐   ┌──────────┐    ┌────────────┐       │
          │  │payment_retry│   │grace_end │    │user_cancel │       │
          │  │  success    │   │(7 days)  │    │            │       │
          │  └──────┬──────┘   └────┬─────┘    └─────┬──────┘       │
          │         │               │                │               │
          │         │               ▼                │               │
          │         │        ┌──────────┐            │               │
          │         └───────►│ CANCELED │◄───────────┘               │
          │                  └────┬─────┘                            │
          │                       │                                  │
          │                       │ Downgrade to FREE                │
          │                       ▼                                  │
          │                  ┌──────────┐                            │
          └─────────────────►│   FREE   │                            │
                             └──────────┘
```

## Quota Enforcement Flow

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              Quota Enforcement Pipeline                               │
│                                                                                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │   Request   │     │    Check    │     │  Increment  │     │   Execute   │        │
│  │  (Create)   │────►│    Quota    │────►│    Quota    │────►│  Operation  │        │
│  └─────────────┘     └──────┬──────┘     └─────────────┘     └─────────────┘        │
│                             │                                                        │
│                             │ Quota Exceeded                                         │
│                             ▼                                                        │
│                      ┌─────────────┐                                                 │
│                      │   403       │                                                 │
│                      │   Error     │                                                 │
│                      └─────────────┘                                                 │
│                                                                                       │
│  Dimensions & Limits by Tier:                                                        │
│  ┌────────────────┬───────────┬───────────┬───────────┬─────────────┐               │
│  │   Dimension    │   Free    │  Starter  │    Pro    │ Enterprise  │               │
│  ├────────────────┼───────────┼───────────┼───────────┼─────────────┤               │
│  │ sites          │     1     │     3     │    10     │  Unlimited  │               │
│  │ posts          │   100     │  1,000    │  10,000   │  Unlimited  │               │
│  │ users          │     1     │     5     │    25     │  Unlimited  │               │
│  │ storage_bytes  │    1GB    │   10GB    │   100GB   │  Unlimited  │               │
│  │ api_calls/mo   │   10K     │   100K    │    1M     │  Unlimited  │               │
│  └────────────────┴───────────┴───────────┴───────────┴─────────────┘               │
│                                                                                       │
│  Reset Schedule:                                                                     │
│  - api_calls: Monthly (1st of month at 00:00 UTC)                                   │
│  - Other dimensions: Not reset (cumulative)                                         │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Monitoring & Alerting Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              Monitoring Architecture                                  │
│                                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                           Data Collection Layer                                  │ │
│  │                                                                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │   Webhook    │  │   Payment    │  │   Database   │  │     API      │        │ │
│  │  │   Metrics    │  │   Metrics    │  │   Metrics    │  │   Metrics    │        │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │ │
│  └─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┘ │
│            │                 │                 │                 │                    │
│            └─────────────────┴─────────────────┴─────────────────┘                    │
│                                        │                                              │
│                                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                           MonitoringService                                      │ │
│  │                                                                                  │ │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐        │ │
│  │  │  In-Memory Store   │  │   Alert Manager    │  │   Health Checker   │        │ │
│  │  │  - Webhook stats   │  │  - Threshold check │  │  - Database ping   │        │ │
│  │  │  - Error counts    │  │  - Cooldown mgmt   │  │  - Stripe check    │        │ │
│  │  │  - Response times  │  │  - Channel routing │  │  - Email check     │        │ │
│  │  └────────────────────┘  └─────────┬──────────┘  └────────────────────┘        │ │
│  └────────────────────────────────────┼─────────────────────────────────────────────┘ │
│                                       │                                               │
│                    ┌──────────────────┼──────────────────┐                           │
│                    │                  │                  │                           │
│                    ▼                  ▼                  ▼                           │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │       Email         │  │       Slack         │  │       Sentry        │          │
│  │   (SendGrid)        │  │    (Webhook)        │  │   (captureEx)       │          │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘          │
│                                                                                       │
│  Default Alerts:                                                                      │
│  ┌───────────────────────┬───────────┬──────────┬──────────┬────────────────────┐   │
│  │        Alert          │ Threshold │  Window  │ Cooldown │     Channels       │   │
│  ├───────────────────────┼───────────┼──────────┼──────────┼────────────────────┤   │
│  │ webhook_failure_rate  │    5%     │  60 min  │  30 min  │ email,slack,sentry │   │
│  │ payment_failure_rate  │     3     │  60 min  │  60 min  │ email,slack,sentry │   │
│  │ api_response_time     │  300ms    │   5 min  │  15 min  │ email,sentry       │   │
│  │ database_errors       │     3     │   5 min  │  15 min  │ email,slack,sentry │   │
│  │ email_failures        │     5     │  60 min  │  60 min  │ email,sentry       │   │
│  └───────────────────────┴───────────┴──────────┴──────────┴────────────────────┘   │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              Security Layers                                          │
│                                                                                       │
│  Layer 1: Network                                                                    │
│  ┌───────────────────────────────────────────────────────────────────────────────┐   │
│  │  - TLS 1.3 encryption                                                         │   │
│  │  - HTTPS enforced (HSTS)                                                      │   │
│  │  - Cloudflare WAF (optional)                                                  │   │
│  │  - Rate limiting at load balancer                                             │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│  Layer 2: Application                                                                │
│  ┌───────────────────────────────────────────────────────────────────────────────┐   │
│  │  - JWT authentication (access + refresh tokens)                               │   │
│  │  - Helmet security headers (CSP, X-Frame-Options, etc.)                      │   │
│  │  - CORS configured for production domains                                     │   │
│  │  - Input validation via Joi schemas                                           │   │
│  │  - express-rate-limit per endpoint                                            │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│  Layer 3: Data                                                                       │
│  ┌───────────────────────────────────────────────────────────────────────────────┐   │
│  │  - Parameterized SQL queries (prevent injection)                              │   │
│  │  - Organization isolation (all queries scoped by org_id)                      │   │
│  │  - Passwords hashed with bcrypt                                               │   │
│  │  - Sensitive data encrypted at rest                                           │   │
│  │  - PCI compliance via Stripe (no card data stored)                           │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│  Layer 4: Stripe Integration                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────┐   │
│  │  - Webhook signature verification (HMAC-SHA256)                               │   │
│  │  - API keys rotated regularly                                                 │   │
│  │  - Test mode for development                                                  │   │
│  │  - Idempotency keys for critical operations                                   │   │
│  │  - Event logging for audit trail                                              │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              Production Deployment                                    │
│                                                                                       │
│                              ┌─────────────────┐                                     │
│                              │   Cloudflare    │                                     │
│                              │   (CDN/WAF)     │                                     │
│                              └────────┬────────┘                                     │
│                                       │                                              │
│                                       ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                           Docker Swarm / Kubernetes                              │ │
│  │                                                                                  │ │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  │ │
│  │  │                         Load Balancer (Nginx)                              │  │ │
│  │  │  - SSL termination                                                         │  │ │
│  │  │  - Static file serving                                                     │  │ │
│  │  │  - Proxy to backend                                                        │  │ │
│  │  └──────────────────────────────────┬────────────────────────────────────────┘  │ │
│  │                                     │                                           │ │
│  │                    ┌────────────────┴────────────────┐                          │ │
│  │                    │                                  │                          │ │
│  │                    ▼                                  ▼                          │ │
│  │  ┌───────────────────────────────┐  ┌───────────────────────────────┐          │ │
│  │  │    Frontend Container (x2)    │  │    Backend Container (x2)     │          │ │
│  │  │    - React SPA                │  │    - Express API              │          │ │
│  │  │    - Nginx for static         │  │    - Node.js runtime          │          │ │
│  │  └───────────────────────────────┘  └───────────────┬───────────────┘          │ │
│  │                                                      │                          │ │
│  └──────────────────────────────────────────────────────┼──────────────────────────┘ │
│                                                         │                            │
│                    ┌────────────────────────────────────┴────────────────┐           │
│                    │                                                      │           │
│                    ▼                                                      ▼           │
│  ┌───────────────────────────────┐                  ┌───────────────────────────────┐│
│  │     PostgreSQL (Primary)      │                  │      PostgreSQL (Replica)     ││
│  │  - RDS / Cloud SQL            │◄────Replication──│    - Read replicas            ││
│  │  - Automated backups          │                  │    - Analytics queries        ││
│  │  - Point-in-time recovery     │                  │                               ││
│  └───────────────────────────────┘                  └───────────────────────────────┘│
│                                                                                       │
│  Environment Variables:                                                              │
│  - Injected via secrets manager (AWS Secrets Manager / Vault)                       │
│  - Never committed to repository                                                     │
│  - Rotated on schedule                                                              │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Key Files Reference

| Component | File Path | Description |
|-----------|-----------|-------------|
| Billing Routes | `backend/src/routes/billing.ts` | Subscription, invoice, usage endpoints |
| Webhook Handler | `backend/src/routes/webhooks.ts` | Stripe webhook processing |
| Quota Routes | `backend/src/routes/quotas.ts` | Quota management endpoints |
| Metrics Routes | `backend/src/routes/metrics.ts` | Monitoring dashboard endpoints |
| Subscription Service | `backend/src/services/SubscriptionService.ts` | Stripe integration logic |
| Quota Service | `backend/src/services/QuotaService.ts` | Quota enforcement logic |
| Monitoring Service | `backend/src/services/MonitoringService.ts` | Metrics collection & alerts |
| Email Service | `backend/src/services/EmailService.ts` | SendGrid email templates |
| Lifecycle Service | `backend/src/services/SubscriptionLifecycleService.ts` | Grace period processing |

---

## Related Documentation

- [API Reference](./API_BILLING.md) - Endpoint details
- [Deployment](./DEPLOYMENT_SAAS.md) - Setup guide
- [Troubleshooting](./TROUBLESHOOTING_BILLING.md) - Common issues
- [Runbook](./RUNBOOK_BILLING.md) - Operational procedures
