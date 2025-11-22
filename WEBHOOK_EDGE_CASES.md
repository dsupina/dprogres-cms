# Webhook Handler Edge Cases & Bugs

Comprehensive edge case analysis of `backend/src/routes/webhooks.ts`

## Critical Bugs (P1)

### 1. **Unreachable Code** (Line 114)
**Location**: webhooks.ts:114
```typescript
await client.query('COMMIT');
return res.status(200).json({ received: true, retried: isRetry }); // Line 105
// ... finally block ...
return res.status(200).json({ received: true }); // Line 114 - UNREACHABLE
```
**Impact**: Dead code that can never execute
**Fix**: Remove line 114

### 2. **Array Bounds Not Checked** (Lines 219, 307, 315)
**Location**: Multiple handlers
```typescript
subscription.items.data[0].price.id  // What if items.data is empty?
subscription.items.data[0].price.unit_amount || 0
```
**Impact**: Crashes if subscription has no items
**Scenario**: Subscription created in Stripe without line items (rare but possible)
**Fix**: Add bounds check:
```typescript
if (!subscription.items?.data?.[0]?.price) {
  throw new Error(`Subscription ${subscription.id} has no price information`);
}
```

### 3. **NaN Not Validated** (Lines 193, 276)
**Location**: handleCheckoutCompleted, handleSubscriptionUpdated
```typescript
const organizationId = parseInt(session.metadata?.organization_id || '0');
if (!organizationId || !planTier || !billingCycle) {  // Doesn't catch NaN!
```
**Impact**: NaN passes validation, causes database constraint violations
**Scenario**: metadata.organization_id = "abc" → parseInt returns NaN → NaN is truthy
**Fix**:
```typescript
const organizationId = parseInt(session.metadata?.organization_id || '0');
if (!organizationId || isNaN(organizationId) || !planTier || !billingCycle) {
```

### 4. **Null Customer Violation** (Line 217)
**Location**: handleCheckoutCompleted
```typescript
session.customer,  // Could be null, violates NOT NULL constraint
```
**Impact**: Database constraint violation if customer is null
**Scenario**: Checkout session created without customer ID
**Fix**: Validate before insert:
```typescript
if (!session.customer) {
  throw new Error(`Checkout session ${session.id} missing customer ID`);
}
```

### 5. **Missing Subscription ID Validation** (Lines 189)
**Location**: handleCheckoutCompleted
```typescript
const subscriptionId = session.subscription as string; // No null check!
const subscription = await stripe.subscriptions.retrieve(subscriptionId);
```
**Impact**: Stripe API call with null/undefined fails
**Scenario**: Checkout session completed but subscription not yet created
**Fix**:
```typescript
if (!session.subscription) {
  throw new Error(`Checkout session ${session.id} missing subscription ID`);
}
const subscriptionId = session.subscription as string;
```

### 6. **Empty String Subscription ID** (Lines 457, 554)
**Location**: Invoice handlers
```typescript
const stripeSubId = typeof (invoice as any).subscription === 'string' ? ...;
if (!stripeSubId) { ... }  // Empty string passes this check!
```
**Impact**: Query for empty string returns no results, but treated as missing subscription
**Fix**:
```typescript
if (!stripeSubId || stripeSubId.trim() === '') {
  throw new Error(`No valid subscription ID for invoice ${invoice.id}`);
}
```

### 7. **Integer Overflow Risk** (Lines 226, 315, 494, 496, 599)
**Location**: All handlers
```typescript
amount_cents: subscription.items.data[0].price.unit_amount || 0,
```
**Impact**: PostgreSQL INTEGER max is 2,147,483,647 (~$21M). Overflow causes error.
**Scenario**: Enterprise plan > $21M/month, large one-time invoices
**Fix**: Change column type to BIGINT or add validation:
```typescript
const amount = subscription.items.data[0].price.unit_amount || 0;
if (amount > 2147483647) {
  throw new Error(`Amount ${amount} exceeds max integer value`);
}
```

### 8. **Timestamp Falsy Value Bug** (Lines 502-503, 606-607)
**Location**: Invoice handlers
```typescript
period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : new Date(),
```
**Impact**: Unix epoch (0) is falsy, would fallback to current date incorrectly
**Scenario**: Invoice with period_start = 0 (Jan 1, 1970)
**Fix**:
```typescript
period_start: invoice.period_start !== null && invoice.period_start !== undefined
  ? new Date(invoice.period_start * 1000)
  : new Date(),
```

### 9. **Missing Price Null Check** (Lines 219, 307, 315)
**Location**: All subscription handlers
```typescript
subscription.items.data[0].price.id  // What if price is null?
```
**Impact**: Null reference error
**Fix**: Add null check:
```typescript
const priceId = subscription.items.data[0]?.price?.id;
if (!priceId) {
  throw new Error(`Subscription ${subscription.id} missing price ID`);
}
```

### 10. **Event Ordering Dependency** (Lines 469-474, 566-571)
**Location**: Invoice handlers
```typescript
if (subRows.length === 0) {
  throw new Error(`Subscription ${stripeSubId} not found...Event will be retried.`);
}
```
**Impact**: If checkout.session.completed never arrives, event retries forever
**Scenario**: Stripe sends invoice.payment_succeeded but checkout webhook fails/lost
**Fix**: Implement retry limit with exponential backoff or fetch subscription from Stripe:
```typescript
if (subRows.length === 0) {
  // Try fetching subscription from Stripe to create it
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  // Create subscription record from Stripe data
  // ...or implement retry limit check
}
```

## High Priority Bugs (P2)

### 11. **Stripe API Call Inside Transaction** (Line 190)
**Location**: handleCheckoutCompleted
```typescript
await client.query('BEGIN');
const subscription = await stripe.subscriptions.retrieve(subscriptionId); // SLOW!
```
**Impact**: Transaction held open during external API call (could be 500ms+)
**Risk**: Lock contention, connection pool exhaustion
**Fix**: Fetch from Stripe before starting transaction:
```typescript
const subscription = await stripe.subscriptions.retrieve(subscriptionId);
// Now start transaction
await client.query('BEGIN');
```

### 12. **No Stripe API Timeout** (Line 190)
**Location**: handleCheckoutCompleted
```typescript
const subscription = await stripe.subscriptions.retrieve(subscriptionId);
```
**Impact**: Could exceed 5 second Stripe webhook timeout requirement
**Scenario**: Stripe API slow/degraded
**Fix**: Add timeout wrapper or configure Stripe client with timeout

### 13. **Error Logging Race Condition** (Lines 119-128)
**Location**: Main error handler
```typescript
try {
  await pool.query(
    `UPDATE subscription_events SET processing_error = $1 WHERE stripe_event_id = $2`,
    [error.message, event.id]
  );
}
```
**Impact**: If INSERT failed (line 44), event record doesn't exist, UPDATE does nothing
**Scenario**: Database connection failure before INSERT
**Fix**: Use INSERT ... ON CONFLICT for error logging

### 14. **Connection Pool Exhaustion Risk** (Lines 54, 180, 267, etc.)
**Location**: All handlers
```typescript
const client = await pool.connect();
```
**Impact**: Webhook spike could exhaust pool (default 10-20 connections)
**Scenario**: 100 concurrent webhooks → all clients waiting → timeout
**Fix**: Implement semaphore/queue or increase pool size with monitoring

### 15. **Multiple Items Not Supported** (Lines 219, 307, 315)
**Location**: All subscription handlers
```typescript
subscription.items.data[0]  // Only first item used
```
**Impact**: Loses data for subscriptions with add-ons, metered billing
**Scenario**: Customer subscribes to Pro + AI Add-on ($99 + $50)
**Fix**: Store all items or aggregate amounts:
```typescript
const totalAmount = subscription.items.data.reduce(
  (sum, item) => sum + (item.price.unit_amount || 0), 0
);
```

### 16. **Missing Metadata in Update Path** (Lines 320-349)
**Location**: handleSubscriptionUpdated (UPDATE path)
```typescript
// Missing metadata, try UPDATE only
const result = await client.query(
  `UPDATE subscriptions
   SET status = $1, ... // stripe_price_id NOT updated!
```
**Impact**: If customer upgrades in Stripe portal, price_id/tier/cycle not updated
**Scenario**: Customer changes from Starter Monthly to Pro Annual in portal
**Fix**: Fetch missing data from Stripe:
```typescript
if (!organizationId && !planTier && !billingCycle) {
  // Fetch full subscription from Stripe to get price details
  const fullSub = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ['items.data.price']
  });
  // Derive tier and cycle from price.id lookup
}
```

### 17. **Canceled_at Fallback Incorrect** (Line 406)
**Location**: handleSubscriptionDeleted
```typescript
canceled_at: subscription.canceled_at ? new Date(...) : new Date(),
```
**Impact**: Uses current time if Stripe doesn't provide canceled_at, could be inaccurate
**Scenario**: Subscription canceled weeks ago but webhook delayed
**Fix**: Make canceled_at required or use deletion time:
```typescript
canceled_at: subscription.canceled_at
  ? new Date(subscription.canceled_at * 1000)
  : (subscription as any).ended_at
    ? new Date((subscription as any).ended_at * 1000)
    : new Date(),
```

### 18. **Currency Mismatch** (Lines 226, 315, 494, 497, 600)
**Location**: All handlers
```typescript
currency: invoice.currency || 'usd',
```
**Impact**: Assumes all amounts are cents, but JPY has no decimal places (¥100 = 100, not 10000)
**Scenario**: Japanese customer invoiced ¥10,000 → stored as 10000 cents = ¥100
**Fix**: Implement zero-decimal currency handling:
```typescript
const isZeroDecimal = ['jpy', 'krw'].includes(invoice.currency?.toLowerCase());
const amount = isZeroDecimal ? invoice.amount_due : invoice.amount_due;
```

### 19. **Status Transition Not Validated** (Lines 310, 324, 400, 578)
**Location**: All subscription updates
```typescript
status = EXCLUDED.status  // No validation of valid transitions
```
**Impact**: Could have invalid state transitions (canceled → active)
**Scenario**: Out-of-order webhook events
**Fix**: Add status transition validation:
```typescript
const validTransitions = {
  'trialing': ['active', 'canceled'],
  'active': ['past_due', 'canceled', 'unpaid'],
  'past_due': ['active', 'canceled', 'unpaid'],
  'canceled': [], // Terminal state
};
```

### 20. **SKIP LOCKED + Crash = Partial Processing** (Lines 60-65)
**Location**: Main handler
```typescript
SELECT id, processed_at FROM subscription_events
WHERE stripe_event_id = $1
FOR UPDATE SKIP LOCKED
```
**Impact**: If process crashes after handlers complete but before COMMIT, lock released, data partially written
**Scenario**: Node process killed (OOM, SIGKILL) after subscription created but before processed_at set
**Fix**: Add cleanup job to find events with processed_at = NULL but data exists

## Medium Priority Issues (P3)

### 21. **Timezone Assumption** (Lines 223-224, 311-312, etc.)
**Location**: All date conversions
```typescript
new Date((subscription as any).current_period_start * 1000)
```
**Impact**: Creates dates in system timezone, should be explicit UTC
**Fix**: Use explicit UTC or document timezone requirements

### 22. **Type Safety Bypassed** (Lines 223-225, 311-314, etc.)
**Location**: All handlers
```typescript
(subscription as any).current_period_start
```
**Impact**: Bypasses TypeScript type checking, could break if Stripe API changes
**Fix**: Use proper Stripe types or create type guards:
```typescript
type SubscriptionWithPeriod = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
};
```

### 23. **Retry Storm** (Lines 460, 469-473, 557, 566-570)
**Location**: Invoice handlers
```typescript
throw new Error(`...Event will be retried.`);
```
**Impact**: Consistently failing events retry for 3 days (Stripe default), creating load
**Scenario**: Invalid data, schema mismatch
**Fix**: Implement exponential backoff or dead letter queue after N attempts

### 24. **Missing Stripe Customer Validation** (Line 217)
**Location**: handleCheckoutCompleted
```typescript
session.customer,  // No format validation
```
**Impact**: Could insert malformed customer ID
**Fix**: Validate Stripe ID format (cus_* pattern):
```typescript
if (!session.customer || !/^cus_/.test(session.customer)) {
  throw new Error(`Invalid customer ID: ${session.customer}`);
}
```

### 25. **subscription.deleted After Subscription Missing** (Lines 398-409)
**Location**: handleSubscriptionDeleted
```typescript
const { rows } = await client.query(
  `UPDATE subscriptions ... WHERE stripe_subscription_id = $2`,
  [...]
);
// No check if rows.length === 0
```
**Impact**: Silent failure if subscription doesn't exist
**Scenario**: subscription.deleted arrives before subscription.created
**Fix**: Throw error to retry:
```typescript
if (rows.length === 0) {
  throw new Error(`Subscription ${subscription.id} not found for deletion. Event will be retried.`);
}
```

### 26. **Metadata Organization ID = 0** (Lines 193, 276)
**Location**: Checkout and subscription handlers
```typescript
const organizationId = parseInt(session.metadata?.organization_id || '0');
if (!organizationId) { ... }  // 0 is falsy but could be valid!
```
**Impact**: Rejects valid organization_id = 0 (if used)
**Fix**: Use explicit null check:
```typescript
const orgIdStr = session.metadata?.organization_id;
if (!orgIdStr) throw new Error('Missing organization_id');
const organizationId = parseInt(orgIdStr);
if (isNaN(organizationId) || organizationId < 1) throw new Error('Invalid organization_id');
```

### 27. **Partial Index Violation Risk** (Lines 202-214)
**Location**: handleCheckoutCompleted
```typescript
ON CONFLICT (stripe_subscription_id) DO UPDATE ...
```
**Impact**: Partial unique index (idx_subscriptions_org_active_unique) not considered
**Scenario**: Organization has active subscription, new checkout creates duplicate active → violates unique index
**Fix**: Check for existing active subscription:
```typescript
const { rows: existing } = await client.query(
  `SELECT id FROM subscriptions
   WHERE organization_id = $1 AND status NOT IN ('canceled', 'incomplete_expired')`,
  [organizationId]
);
if (existing.length > 0) {
  throw new Error(`Organization ${organizationId} already has active subscription`);
}
```

### 28. **Network Failure During COMMIT** (Lines 103, 241, etc.)
**Location**: All handlers
```typescript
await client.query('COMMIT');
```
**Impact**: If network fails during COMMIT, Stripe API calls already made but transaction rolled back
**Scenario**: DB network partition during COMMIT
**Fix**: Make all external calls idempotent or log intent before API calls

### 29. **Missing Billing Reason Validation** (Lines 500, 605)
**Location**: Invoice handlers
```typescript
billing_reason: invoice.billing_reason,  // No validation
```
**Impact**: Could insert unexpected values
**Fix**: Validate against known billing reasons or truncate:
```typescript
billing_reason: invoice.billing_reason?.substring(0, 100),
```

### 30. **No Webhook Signature Verification Logging** (Lines 30-40)
**Location**: Signature verification
```typescript
} catch (err: any) {
  console.error('Webhook signature verification failed:', err.message);
  return res.status(400).json({ error: `Webhook Error: ${err.message}` });
}
```
**Impact**: Security issue if signature verification fails are not monitored
**Fix**: Add security logging/alerting:
```typescript
} catch (err: any) {
  // Log potential security incident
  await logSecurityEvent('webhook_signature_failed', {
    ip: req.ip,
    error: err.message,
    timestamp: new Date()
  });
  return res.status(400).json({ error: 'Invalid signature' });
}
```

### 31. **UPSERT on subscription.created Missing Amount** (Lines 284-318)
**Location**: handleSubscriptionUpdated
```typescript
ON CONFLICT (stripe_subscription_id) DO UPDATE
SET stripe_price_id = EXCLUDED.stripe_price_id,
    ...
    amount_cents = EXCLUDED.amount_cents,  // Only updated if metadata present
```
**Impact**: If subscription.created event has metadata but subscription.updated doesn't, amount not updated on price change
**Fix**: Always fetch current amount from Stripe subscription object in UPDATE path

### 32. **Undefined Plan Tier Passes CHECK** (Lines 277-278)
**Location**: handleSubscriptionUpdated
```typescript
const planTier = (subscription as any).metadata?.plan_tier as 'free' | 'starter' | 'pro' | 'enterprise' | undefined;
```
**Impact**: If plan_tier is undefined but organizationId present, INSERT will fail on CHECK constraint
**Scenario**: Metadata has organization_id but missing plan_tier
**Fix**: Validate all metadata together:
```typescript
const hasCompleteMetadata = organizationId && planTier && billingCycle;
```

## Summary

**Critical (P1)**: 10 bugs that could cause crashes, data corruption, or constraint violations
**High (P2)**: 9 bugs affecting reliability, performance, or data accuracy
**Medium (P3)**: 13 issues affecting robustness, security logging, or edge case handling

**Total**: 32 edge cases identified

**Recommended Priority for Fixes**:
1. Array bounds checks (#2)
2. NaN validation (#3)
3. Null customer/subscription validation (#4, #5)
4. Integer overflow for enterprise plans (#7)
5. Event ordering dependency (#10)
6. Stripe API in transaction (#11)
