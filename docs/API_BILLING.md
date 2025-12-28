# Billing API Documentation

This document provides comprehensive documentation for all billing-related API endpoints in DProgres CMS.

## Base URL

All endpoints are prefixed with `/api/billing` unless otherwise noted.

## Authentication

All billing endpoints (except `/plans`) require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <access_token>
```

## Endpoints

### Subscription Management

#### GET /api/billing/subscription

Get the current subscription for the authenticated user's organization.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "has_subscription": true,
    "plan_tier": "pro",
    "plan_name": "Pro",
    "billing_cycle": "monthly",
    "status": "active",
    "current_period_start": "2025-01-01T00:00:00.000Z",
    "current_period_end": "2025-02-01T00:00:00.000Z",
    "cancel_at_period_end": false,
    "canceled_at": null,
    "amount_cents": 9900,
    "price_display": "$99/month",
    "organization_name": "Acme Corp"
  }
}
```

**Subscription Statuses**:
- `active` - Subscription is current and paid
- `trialing` - In trial period
- `past_due` - Payment failed, in grace period (7 days)
- `canceled` - Subscription has been canceled
- `incomplete` - Initial payment failed
- `unpaid` - Multiple payment failures

---

#### POST /api/billing/checkout

Create a Stripe Checkout session for plan upgrade.

**Authentication**: Required (owner only)

**Request Body**:
```json
{
  "plan_tier": "pro",
  "billing_cycle": "monthly",
  "trial_days": 14
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan_tier` | string | Yes | Target plan: `starter` or `pro` |
| `billing_cycle` | string | Yes | `monthly` or `annual` |
| `trial_days` | number | No | Optional trial period (0-30 days) |

**Response**:
```json
{
  "success": true,
  "data": {
    "session_id": "cs_test_...",
    "checkout_url": "https://checkout.stripe.com/..."
  }
}
```

**Error Responses**:
- `400 Bad Request` - Invalid plan_tier or billing_cycle
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not organization owner

---

#### POST /api/billing/portal

Generate a Stripe Customer Portal URL for self-service billing management.

**Authentication**: Required (owner only)

**Request Body**:
```json
{
  "return_url": "https://app.example.com/admin/billing"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "portal_url": "https://billing.stripe.com/p/session/..."
  }
}
```

The Customer Portal allows users to:
- Update payment methods
- View invoice history
- Cancel subscription
- Change billing details

---

### Plans & Pricing

#### GET /api/billing/plans

Get available subscription plans and pricing. **No authentication required.**

**Response**:
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "tier": "free",
        "name": "Free",
        "description": "Perfect for getting started",
        "price_monthly": 0,
        "price_annual": 0,
        "features": [
          "1 Site",
          "100 Posts",
          "1 Team Member",
          "1 GB Storage",
          "10,000 API Calls/month"
        ],
        "quotas": {
          "sites": 1,
          "posts": 100,
          "users": 1,
          "storage_bytes": 1073741824,
          "api_calls": 10000
        },
        "is_popular": false
      },
      {
        "tier": "starter",
        "name": "Starter",
        "description": "For small teams and growing sites",
        "price_monthly": 29,
        "price_annual": 290,
        "features": [
          "3 Sites",
          "1,000 Posts",
          "5 Team Members",
          "10 GB Storage",
          "100,000 API Calls/month",
          "Priority Support"
        ],
        "quotas": {
          "sites": 3,
          "posts": 1000,
          "users": 5,
          "storage_bytes": 10737418240,
          "api_calls": 100000
        },
        "is_popular": true
      },
      {
        "tier": "pro",
        "name": "Pro",
        "description": "For larger teams with advanced needs",
        "price_monthly": 99,
        "price_annual": 990,
        "features": [
          "10 Sites",
          "10,000 Posts",
          "25 Team Members",
          "100 GB Storage",
          "1,000,000 API Calls/month",
          "Priority Support",
          "Advanced Analytics",
          "Custom Domains"
        ],
        "quotas": {
          "sites": 10,
          "posts": 10000,
          "users": 25,
          "storage_bytes": 107374182400,
          "api_calls": 1000000
        },
        "is_popular": false
      },
      {
        "tier": "enterprise",
        "name": "Enterprise",
        "description": "For organizations with custom requirements",
        "price_monthly": null,
        "price_annual": null,
        "features": [
          "Unlimited Sites",
          "Unlimited Posts",
          "Unlimited Team Members",
          "Unlimited Storage",
          "Unlimited API Calls",
          "Dedicated Support",
          "SLA Agreement",
          "Custom Integrations",
          "On-premise Option"
        ],
        "quotas": {
          "sites": -1,
          "posts": -1,
          "users": -1,
          "storage_bytes": -1,
          "api_calls": -1
        },
        "is_popular": false,
        "contact_sales": true
      }
    ]
  }
}
```

---

### Usage & Quotas

#### GET /api/billing/usage

Get quota usage for the authenticated user's organization.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "plan_tier": "pro",
    "usage": [
      {
        "dimension": "sites",
        "label": "Sites",
        "current": 5,
        "limit": 10,
        "remaining": 5,
        "percentage": 50,
        "current_display": "5",
        "limit_display": "10",
        "is_unlimited": false,
        "is_warning": false,
        "is_critical": false
      },
      {
        "dimension": "posts",
        "label": "Posts",
        "current": 2500,
        "limit": 10000,
        "remaining": 7500,
        "percentage": 25,
        "current_display": "2.5K",
        "limit_display": "10K",
        "is_unlimited": false,
        "is_warning": false,
        "is_critical": false
      },
      {
        "dimension": "storage_bytes",
        "label": "Storage",
        "current": 5368709120,
        "limit": 107374182400,
        "remaining": 102005473280,
        "percentage": 5,
        "current_display": "5 GB",
        "limit_display": "100 GB",
        "is_unlimited": false,
        "is_warning": false,
        "is_critical": false
      }
    ]
  }
}
```

**Usage Thresholds**:
- `is_warning`: true when usage >= 80%
- `is_critical`: true when usage >= 95%
- `is_unlimited`: true for enterprise tier (-1 limits)

---

### Invoices

#### GET /api/billing/invoices

Get invoice history for the organization.

**Authentication**: Required

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Results per page (max: 100) |
| `page` | number | 1 | Page number |

**Response**:
```json
{
  "success": true,
  "data": {
    "invoices": [
      {
        "id": 1,
        "invoice_number": "in_1ABC123...",
        "amount": "$99.00",
        "amount_cents": 9900,
        "currency": "USD",
        "status": "paid",
        "status_display": "Paid",
        "pdf_url": "https://pay.stripe.com/invoice/...",
        "hosted_url": "https://invoice.stripe.com/...",
        "billing_reason": "subscription_cycle",
        "period_start": "2025-01-01T00:00:00.000Z",
        "period_end": "2025-02-01T00:00:00.000Z",
        "created_at": "2025-01-01T00:00:00.000Z",
        "paid_at": "2025-01-01T00:01:23.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 12,
      "total_pages": 2,
      "has_more": true
    }
  }
}
```

**Invoice Statuses**:
- `paid` - Successfully paid
- `open` - Awaiting payment
- `draft` - Not yet finalized
- `void` - Canceled
- `uncollectible` - Payment failed permanently

---

## Quota Management API

### GET /api/quotas/:organizationId

Get quota status for all dimensions.

**Authentication**: Required (admin)

**Response**:
```json
{
  "success": true,
  "data": {
    "sites": {
      "current_usage": 5,
      "quota_limit": 10,
      "remaining": 5,
      "percentage_used": 50
    },
    "posts": {
      "current_usage": 250,
      "quota_limit": 10000,
      "remaining": 9750,
      "percentage_used": 2.5
    }
  }
}
```

---

### POST /api/quotas/:organizationId/check

Check if an action is within quota limits (does not increment).

**Authentication**: Required (admin)

**Request Body**:
```json
{
  "dimension": "sites",
  "amount": 1
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "current_usage": 5,
    "quota_limit": 10,
    "remaining": 5
  }
}
```

---

### POST /api/quotas/:organizationId/increment

Atomically increment quota usage after creating a resource.

**Authentication**: Required (admin)

**Request Body**:
```json
{
  "dimension": "posts",
  "amount": 1
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "incremented": true,
    "new_usage": 251
  }
}
```

**Error Response** (quota exceeded):
```json
{
  "success": false,
  "error": "Quota exceeded for posts",
  "errorCode": "QUOTA_EXCEEDED"
}
```

---

### POST /api/quotas/:organizationId/decrement

Decrement quota usage when deleting a resource.

**Authentication**: Required (admin)

**Request Body**:
```json
{
  "dimension": "posts",
  "amount": 1
}
```

---

### PUT /api/quotas/:organizationId/:dimension/override

Set custom quota limit (Enterprise customers).

**Authentication**: Required (admin)

**Request Body**:
```json
{
  "new_limit": 50000
}
```

---

### POST /api/quotas/reset-all

Reset all monthly quotas across all organizations (scheduled job).

**Authentication**: Required (admin)

---

## Metrics API (SF-026)

All metrics endpoints require admin authentication.

### GET /api/metrics/billing

Get billing metrics for dashboard.

**Response**:
```json
{
  "success": true,
  "data": {
    "mrr": 49500,
    "arr": 594000,
    "subscriptionCount": 50,
    "subscriptionsByTier": {
      "free": 20,
      "starter": 20,
      "pro": 10
    },
    "subscriptionsByStatus": {
      "active": 45,
      "trialing": 3,
      "past_due": 2
    },
    "churnRate": 2.5,
    "trialCount": 3,
    "conversionRate": 60.0,
    "avgRevenuePerUser": 1100,
    "mrr_display": "$495.00",
    "arr_display": "$5,940.00",
    "arpu_display": "$11.00",
    "churn_rate_display": "2.5%",
    "conversion_rate_display": "60.0%"
  }
}
```

---

### GET /api/metrics/webhooks

Get webhook processing statistics.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `window` | number | 60 | Time window in minutes (5-1440) |

**Response**:
```json
{
  "success": true,
  "data": {
    "totalProcessed": 150,
    "successCount": 148,
    "failureCount": 2,
    "failureRate": 1.3,
    "avgProcessingTimeMs": 85,
    "p95ProcessingTimeMs": 150,
    "eventTypeBreakdown": {
      "invoice.payment_succeeded": { "count": 50, "avgMs": 90 },
      "customer.subscription.updated": { "count": 40, "avgMs": 80 }
    },
    "recentFailures": [],
    "failure_rate_display": "1.3%",
    "avg_time_display": "85ms",
    "p95_time_display": "150ms",
    "window_minutes": 60
  }
}
```

---

### GET /api/metrics/payments

Get payment metrics.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 30 | Lookback period (1-365) |

**Response**:
```json
{
  "success": true,
  "data": {
    "totalPayments": 100,
    "successfulPayments": 97,
    "failedPayments": 3,
    "successRate": 97.0,
    "totalRevenue": 495000,
    "avgPaymentAmount": 5103,
    "success_rate_display": "97.0%",
    "total_revenue_display": "$4,950.00",
    "avg_payment_display": "$51.03",
    "days": 30
  }
}
```

---

### GET /api/metrics/health

Get system health status.

**Response**:
```json
{
  "success": true,
  "data": {
    "overall": "healthy",
    "components": {
      "database": { "status": "healthy", "latencyMs": 5 },
      "stripe": { "status": "healthy", "lastCheck": "2025-01-01T00:00:00.000Z" },
      "email": { "status": "healthy" },
      "webhooks": { "status": "healthy", "failureRate": 1.3 }
    }
  }
}
```

**Health Statuses**:
- `healthy` - All systems operational
- `degraded` - Some components experiencing issues
- `unhealthy` - Critical failure

---

### GET /api/metrics/alerts

Get configured alerts and cooldown status.

**Response**:
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "webhook_failure_rate",
        "name": "Webhook Failure Rate",
        "category": "webhook",
        "threshold": 5,
        "windowMinutes": 60,
        "cooldownMinutes": 30,
        "severity": "critical",
        "enabled": true,
        "channels": ["email", "slack", "sentry"]
      }
    ],
    "cooldowns": {
      "webhook_failure_rate": {
        "lastTriggeredAt": "2025-01-01T12:00:00.000Z",
        "count": 1
      }
    }
  }
}
```

---

### PATCH /api/metrics/alerts/:alertId

Update alert configuration.

**Request Body**:
```json
{
  "enabled": false,
  "threshold": 10,
  "windowMinutes": 30,
  "cooldownMinutes": 60,
  "channels": ["email", "sentry"]
}
```

---

### POST /api/metrics/alerts/:alertId/reset

Reset alert cooldown for testing or manual intervention.

---

### GET /api/metrics/summary

Get combined dashboard overview.

**Response**:
```json
{
  "success": true,
  "data": {
    "billing": {
      "mrr": 49500,
      "mrr_display": "$495",
      "subscriptions": 50,
      "churn_rate": 2.5
    },
    "payments": {
      "success_rate": 97.0,
      "revenue_30d": 495000,
      "revenue_display": "$4,950"
    },
    "health": {
      "overall": "healthy",
      "components": {
        "database": "healthy",
        "stripe": "healthy",
        "email": "healthy",
        "webhooks": "healthy"
      }
    },
    "webhooks": {
      "processed_1h": 150,
      "failure_rate": 1.3,
      "avg_time_ms": 85
    },
    "generated_at": "2025-01-01T00:00:00.000Z"
  }
}
```

---

## Webhook Endpoint

### POST /api/webhooks/stripe

Stripe webhook endpoint for event processing.

**Authentication**: Stripe signature verification (not JWT)

**Headers**:
```
stripe-signature: t=...,v1=...
```

**Handled Events**:
| Event | Description |
|-------|-------------|
| `checkout.session.completed` | New subscription created via checkout |
| `customer.subscription.created` | Subscription created |
| `customer.subscription.updated` | Subscription modified |
| `customer.subscription.deleted` | Subscription canceled |
| `customer.subscription.trial_will_end` | Trial ending in 3 days |
| `invoice.payment_succeeded` | Payment successful |
| `invoice.payment_failed` | Payment failed |
| `invoice.upcoming` | Invoice coming up in 7 days |
| `customer.updated` | Customer details changed |
| `payment_method.attached` | New payment method added |
| `payment_method.detached` | Payment method removed |

**Response**:
- `200 OK` - Event processed successfully
- `400 Bad Request` - Invalid signature
- `500 Internal Server Error` - Transient error (Stripe will retry)

**Idempotency**: Events are tracked by `stripe_event_id` to prevent duplicate processing.

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message describing the issue",
  "errorCode": "ERROR_CODE"
}
```

**Common Error Codes**:
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `QUOTA_EXCEEDED` | 403 | Usage quota exceeded |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

The billing API has the following rate limits:
- Standard endpoints: 100 requests per minute per user
- Webhook endpoint: No limit (Stripe controls delivery rate)
- Checkout creation: 10 requests per minute per organization

---

## Related Documentation

- [Architecture](./ARCHITECTURE_SAAS.md) - System architecture
- [Deployment](./DEPLOYMENT_SAAS.md) - Deployment guide
- [Troubleshooting](./TROUBLESHOOTING_BILLING.md) - Common issues
- [Runbook](./RUNBOOK_BILLING.md) - Operational procedures
