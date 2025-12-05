# Billing & Quota API Documentation

This document describes the API endpoints for subscription management and quota enforcement.

## Table of Contents

- [Quota Management](#quota-management)
- [Subscription Management](#subscription-management)
- [Webhook Events](#webhook-events)

---

## Quota Management

### GET /api/quotas/:organizationId

Get quota status for all dimensions for an organization.

**Authentication**: Required (Admin)

**Parameters**:
- `organizationId` (path, integer) - Organization ID

**Response**:
```json
{
  "success": true,
  "data": {
    "sites": {
      "dimension": "sites",
      "current_usage": 5,
      "quota_limit": 10,
      "remaining": 5,
      "percentage_used": 50,
      "period_start": "2025-01-01T00:00:00.000Z",
      "period_end": null,
      "last_reset_at": null
    },
    "posts": {
      "dimension": "posts",
      "current_usage": 100,
      "quota_limit": 1000,
      "remaining": 900,
      "percentage_used": 10,
      "period_start": "2025-01-01T00:00:00.000Z",
      "period_end": null,
      "last_reset_at": null
    },
    "users": {
      "dimension": "users",
      "current_usage": 3,
      "quota_limit": 5,
      "remaining": 2,
      "percentage_used": 60,
      "period_start": "2025-01-01T00:00:00.000Z",
      "period_end": null,
      "last_reset_at": null
    },
    "storage_bytes": {
      "dimension": "storage_bytes",
      "current_usage": 524288000,
      "quota_limit": 1073741824,
      "remaining": 549453824,
      "percentage_used": 48.83,
      "period_start": "2025-01-01T00:00:00.000Z",
      "period_end": null,
      "last_reset_at": null
    },
    "api_calls": {
      "dimension": "api_calls",
      "current_usage": 45000,
      "quota_limit": 100000,
      "remaining": 55000,
      "percentage_used": 45,
      "period_start": "2025-01-01T00:00:00.000Z",
      "period_end": "2025-02-01T00:00:00.000Z",
      "last_reset_at": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

**Error Responses**:
- `400` - Invalid organization ID
- `404` - No quota records found

---

### POST /api/quotas/:organizationId/check

Check if organization can perform action (within quota). **Does NOT increment usage**.

**Authentication**: Required (Admin)

**Parameters**:
- `organizationId` (path, integer) - Organization ID

**Request Body**:
```json
{
  "dimension": "sites",
  "amount": 1
}
```

**Field Descriptions**:
- `dimension` (string, required) - Quota dimension: `sites`, `posts`, `users`, `storage_bytes`, `api_calls`
- `amount` (integer, optional) - Amount to check (default: 1)

**Response**:
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "current": 50,
    "limit": 100,
    "remaining": 50,
    "percentage_used": 50
  }
}
```

**Error Responses**:
- `400` - Invalid organization ID or request body
- `404` - No quota record found

---

### POST /api/quotas/:organizationId/increment

Increment quota usage atomically. Returns error if quota exceeded.

**Authentication**: Required (Admin)

**Parameters**:
- `organizationId` (path, integer) - Organization ID

**Request Body**:
```json
{
  "dimension": "posts",
  "amount": 1
}
```

**Field Descriptions**:
- `dimension` (string, required) - Quota dimension
- `amount` (integer, optional) - Amount to increment (default: 1)

**Response** (Success):
```json
{
  "success": true,
  "data": true
}
```

**Response** (Quota Exceeded):
```json
{
  "success": false,
  "error": "Quota exceeded for dimension: posts"
}
```

**Error Responses**:
- `400` - Invalid organization ID or request body
- `403` - Quota exceeded
- `404` - No quota record found

**Usage Pattern**:
```typescript
// 1. Check quota first
const check = await quotaService.checkQuota({
  organizationId: 1,
  dimension: 'posts',
});

if (!check.data?.allowed) {
  return res.status(403).json({ error: 'Quota exceeded' });
}

// 2. Perform action (create post, etc.)
const post = await createPost(data);

// 3. Increment quota
await quotaService.incrementQuota({
  organizationId: 1,
  dimension: 'posts',
});
```

---

### POST /api/quotas/:organizationId/decrement

Decrement quota usage (when deleting resources).

**Authentication**: Required (Admin)

**Parameters**:
- `organizationId` (path, integer) - Organization ID

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
  "data": true
}
```

**Error Responses**:
- `400` - Invalid organization ID or request body
- `404` - No quota record found

---

### POST /api/quotas/:organizationId/reset

Reset monthly quotas for an organization (resets `api_calls` dimension).

**IMPORTANT Safeguards**:
1. Only resets quotas where `period_end < NOW()` (billing period has expired)
2. Advances `period_end` by 1 month to prevent repeated daily resets
3. Prevents accidental mid-cycle resets that would bypass quota enforcement

**Authentication**: Required (Admin)

**Parameters**:
- `organizationId` (path, integer) - Organization ID

**Response**:
```json
{
  "success": true,
  "data": 1
}
```

**What Happens on Reset**:
- `current_usage` → 0
- `last_reset_at` → NOW()
- `period_start` → NOW()
- `period_end` → period_end + 1 month (advances billing cycle)
- `updated_at` → NOW()

**Field Descriptions**:
- `data` (integer) - Number of quotas reset (0 if no periods have expired, typically 1 for api_calls when period expired)

**Error Responses**:
- `400` - Invalid organization ID
- `404` - No quota records found

**Note**: Returns `data: 0` if the billing period has not yet expired, even if quota records exist. This is expected behavior to prevent premature resets. When a reset occurs, the billing period automatically advances by 1 month.

---

### PUT /api/quotas/:organizationId/:dimension/override

Set quota override for Enterprise customers. Allows manual adjustment of quota limits.

**Authentication**: Required (Admin)

**Parameters**:
- `organizationId` (path, integer) - Organization ID
- `dimension` (path, string) - Quota dimension (`sites`, `posts`, `users`, `storage_bytes`, `api_calls`)

**Request Body**:
```json
{
  "new_limit": 100
}
```

**Field Descriptions**:
- `new_limit` (integer, required) - New quota limit (must be > 0)

**Response**:
```json
{
  "success": true,
  "data": {
    "dimension": "sites",
    "current_usage": 5,
    "quota_limit": 100,
    "remaining": 95,
    "percentage_used": 5,
    "period_start": "2025-01-01T00:00:00.000Z",
    "period_end": null,
    "last_reset_at": null
  }
}
```

**Error Responses**:
- `400` - Invalid organization ID, dimension, or new_limit <= 0
- `404` - No quota record found

---

### POST /api/quotas/reset-all

Reset all monthly quotas across all organizations (admin only, for scheduled jobs).

**Authentication**: Required (Admin)

**Response**:
```json
{
  "success": true,
  "data": 50
}
```

**Field Descriptions**:
- `data` (integer) - Number of quota records reset across all organizations

**Error Responses**:
- `500` - Database error

**Usage**:
This endpoint should be called by a scheduled cron job (e.g., monthly) to reset all `api_calls` quotas.

---

## Quota Dimensions

The system tracks five quota dimensions per organization:

| Dimension | Description | Reset Behavior | Tier Limits |
|-----------|-------------|----------------|-------------|
| `sites` | Number of sites | Never resets | Free: 1, Starter: 5, Pro: 25, Enterprise: Custom |
| `posts` | Number of posts | Never resets | Free: 100, Starter: 1,000, Pro: 10,000, Enterprise: Custom |
| `users` | Number of users/members | Never resets | Free: 1, Starter: 5, Pro: 25, Enterprise: Custom |
| `storage_bytes` | Total storage (bytes) | Never resets | Free: 1GB, Starter: 10GB, Pro: 100GB, Enterprise: Custom |
| `api_calls` | Monthly API calls | Resets monthly | Free: 10,000, Starter: 100,000, Pro: 1,000,000, Enterprise: Custom |

---

## Quota Events

The QuotaService emits events for monitoring and alerting:

### quota:approaching_limit

Fired when usage reaches 80%, 90%, or 95% of quota limit.

**Event Payload**:
```typescript
{
  organizationId: number;
  dimension: QuotaDimension;
  percentage: 80 | 90 | 95;
  current: number;
  limit: number;
  timestamp: Date;
}
```

**Usage**:
```typescript
quotaService.on('quota:approaching_limit', (event) => {
  // Send warning email to organization owner
  emailService.sendQuotaWarning(event.organizationId, event);
});
```

### quota:limit_reached

Fired when usage reaches exactly 100% of quota limit (limit fully consumed).

**Event Payload**:
```typescript
{
  organizationId: number;
  dimension: QuotaDimension;
  current: number;
  limit: number;
  timestamp: Date;
}
```

**Usage**:
```typescript
quotaService.on('quota:limit_reached', (event) => {
  // Alert that quota is fully consumed
  emailService.sendQuotaFullyConsumed(event.organizationId, event);
});
```

**Note**: This event fires when an increment brings usage to exactly 100%. The next increment attempt will fail with `quota:exceeded`.

### quota:exceeded

Fired when an increment attempt is rejected because quota limit would be exceeded.

**Event Payload**:
```typescript
{
  organizationId: number;
  dimension: QuotaDimension;
  timestamp: Date;
}
```

### quota:reset

Fired when monthly quotas are reset.

**Event Payload**:
```typescript
{
  organizationId: number;
  dimensions: QuotaDimension[];
  timestamp: Date;
}
```

### quota:override_set

Fired when quota limit is manually changed (Enterprise).

**Event Payload**:
```typescript
{
  organizationId: number;
  dimension: QuotaDimension;
  newLimit: number;
  timestamp: Date;
}
```

### quota:incremented

Fired when usage is incremented.

**Event Payload**:
```typescript
{
  organizationId: number;
  dimension: QuotaDimension;
  amount: number;
  current: number;
  timestamp: Date;
}
```

### quota:decremented

Fired when usage is decremented.

**Event Payload**:
```typescript
{
  organizationId: number;
  dimension: QuotaDimension;
  amount: number;
  current: number;
  timestamp: Date;
}
```

---

## Implementation Notes

### Atomicity

Quota increments use the PostgreSQL function `check_and_increment_quota()` which performs atomic check-and-increment operations with row-level locking (`SELECT FOR UPDATE`). This prevents race conditions when multiple requests try to increment the same quota simultaneously.

### Performance

- Quota checks: <50ms target (verified in tests)
- Atomic increments: ~85ms average
- Event emission: <5ms overhead

### Best Practices

1. **Always check before incrementing**:
   ```typescript
   const check = await quotaService.checkQuota({...});
   if (!check.data?.allowed) {
     return error('Quota exceeded');
   }
   // Perform action
   await quotaService.incrementQuota({...});
   ```

2. **Decrement on deletion**:
   ```typescript
   await deletePost(postId);
   await quotaService.decrementQuota({
     organizationId,
     dimension: 'posts',
   });
   ```

3. **Listen to events for monitoring**:
   ```typescript
   quotaService.on('quota:approaching_limit', handleWarning);
   quotaService.on('quota:exceeded', handleExceeded);
   ```

---

## Subscription Management

(To be documented: SF-003 SubscriptionService endpoints)

---

## Webhook Events

The webhook endpoint receives events from Stripe and processes them idempotently.

### POST /api/webhooks/stripe

Process Stripe webhook events.

**Authentication**: None (uses Stripe signature verification)

**Headers**:
- `stripe-signature` (required) - Stripe webhook signature for verification

**Request Body**: Raw Stripe event payload

**Response**:
```json
{
  "received": true
}
```

**Error Responses**:
- `400` - Invalid signature or webhook processing error
- `500` - Internal server error

---

### Handled Events

| Event Type | Handler | Description | Added In |
|------------|---------|-------------|----------|
| `checkout.session.completed` | `handleCheckoutCompleted` | Process successful checkout | SF-004 |
| `customer.subscription.created` | `handleSubscriptionCreated` | New subscription created | SF-004 |
| `customer.subscription.updated` | `handleSubscriptionUpdated` | Subscription plan/status changed | SF-004 |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | Subscription canceled | SF-004 |
| `invoice.paid` | `handleInvoicePaid` | Payment successful | SF-004 |
| `invoice.payment_failed` | `handleInvoicePaymentFailed` | Payment failed | SF-004 |
| `customer.updated` | `handleCustomerUpdated` | Sync customer name/email to org | SF-015 |
| `payment_method.attached` | `handlePaymentMethodAttached` | Store payment method details | SF-015 |
| `payment_method.detached` | `handlePaymentMethodDetached` | Soft delete payment method | SF-015 |
| `customer.subscription.trial_will_end` | `handleTrialWillEnd` | Send 3-day trial warning email | SF-015 |
| `invoice.upcoming` | `handleInvoiceUpcoming` | Send 7-day renewal notice email | SF-015 |

---

### Event Processing Details

#### customer.updated (SF-015)

Syncs customer data from Stripe to the local organization table.

**Fields Synced**:
- `name` → `organizations.name`
- `email` → `organizations.billing_email`

**Example Stripe Event**:
```json
{
  "type": "customer.updated",
  "data": {
    "object": {
      "id": "cus_123",
      "name": "Acme Corp Updated",
      "email": "billing@acme.com"
    }
  }
}
```

---

#### payment_method.attached (SF-015)

Stores payment method details when attached to a customer.

**Stored Fields**:
- `stripe_payment_method_id` - Stripe PM ID
- `type` - Payment method type (card, bank_account, etc.)
- `last_four` - Last 4 digits of card
- `exp_month` / `exp_year` - Card expiration
- `brand` - Card brand (visa, mastercard, etc.)
- `is_default` - First method becomes default automatically

**Database Table**: `payment_methods`

**Example Stripe Event**:
```json
{
  "type": "payment_method.attached",
  "data": {
    "object": {
      "id": "pm_123",
      "customer": "cus_123",
      "type": "card",
      "card": {
        "last4": "4242",
        "exp_month": 12,
        "exp_year": 2025,
        "brand": "visa"
      }
    }
  }
}
```

---

#### payment_method.detached (SF-015)

Soft deletes payment method when detached from customer.

**Behavior**:
- Sets `deleted_at` timestamp (soft delete for audit trail)
- Sets `is_default = false`
- Promotes next most recent method to default if this was default

---

#### customer.subscription.trial_will_end (SF-015)

Sends email notification 3 days before trial ends.

**Email Template**: `trial_ending`

**Template Variables**:
```typescript
{
  plan_tier: string;        // "Pro", "Enterprise"
  trial_end_date: string;   // "January 15, 2025"
  days_remaining: 3;
  features_at_risk?: string[]; // ["Priority Support", "Advanced Analytics"]
}
```

**Recipients**: Organization admin emails (via OrganizationService.getAdminEmails)

---

#### invoice.upcoming (SF-015)

Sends email notification 7 days before invoice is generated.

**Email Template**: `invoice_upcoming`

**Template Variables**:
```typescript
{
  plan_tier: string;        // "Pro Plan"
  amount: string;           // "99.00"
  currency?: string;        // "USD"
  billing_date: string;     // "January 22, 2025"
  billing_period?: string;  // "January 15, 2025 - February 14, 2025"
}
```

**Recipients**: Organization admin emails

---

### Idempotency

All webhook events are processed idempotently:

1. **Event ID Check**: Before processing, the handler checks `webhook_events` table for existing `stripe_event_id`
2. **Skip if Processed**: If event was already processed, returns `{ received: true }` without re-processing
3. **Status Tracking**: Events are tracked with status: `processing` → `processed` or `failed`

**Database Table**: `webhook_events`

```sql
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);
```

---

### Transaction Safety

All webhook handlers run within a database transaction:

1. **BEGIN**: Transaction starts
2. **Record Event**: Insert into `webhook_events` with status `processing`
3. **Process Handler**: Execute specific event handler
4. **Update Status**: Mark event as `processed`
5. **COMMIT**: Commit transaction

If any step fails:
- **ROLLBACK**: Transaction rolled back
- **Status**: Event marked as `failed` with error message
- **Retry**: Failed events can be retried via admin endpoint

**Email Notifications**: Sent AFTER successful transaction commit (outside transaction) to prevent email delivery issues from rolling back database changes

---

## Deployment & Migration Notes

### Migration 003: Quota Backfill

When deploying migration `003_create_usage_quotas.sql`, the following happens automatically:

1. **Table Creation**: Creates `usage_quotas` table with constraints and indexes
2. **Function Creation**: Creates PostgreSQL functions for atomic quota operations
3. **Automatic Backfill**: Seeds default Free tier quotas for ALL existing organizations

**Backfill Behavior**:
- Uses `INSERT ... ON CONFLICT DO NOTHING` for idempotency (safe to re-run)
- Assigns Free tier limits to all existing organizations:
  - `sites`: 1 site
  - `posts`: 100 posts
  - `users`: 1 user
  - `storage_bytes`: 1GB (1,073,741,824 bytes)
  - `api_calls`: 10,000 calls/month
- Sets `period_end` to NOW() + 1 month for `api_calls` dimension
- Sets `current_usage` to 0 for all dimensions

**New Organizations**:
- Quota records are created during signup in the SubscriptionService
- Same Free tier defaults applied

**Upgrading Organizations**:
- Use `PUT /api/quotas/:organizationId/:dimension/override` to adjust limits
- Enterprise customers can have custom quota limits

---

**Last Updated**: December 2025
**Version**: 1.1
**Related Tickets**: SF-009 (Quota System Implementation), SF-015 (Complete Webhook Event Handling)
