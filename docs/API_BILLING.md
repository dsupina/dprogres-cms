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

### quota:exceeded

Fired when usage reaches 100% of quota limit.

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

(To be documented: SF-004 Stripe webhook handling)

---

**Last Updated**: January 2025
**Version**: 1.0
**Related Tickets**: SF-009 (Quota System Implementation)
