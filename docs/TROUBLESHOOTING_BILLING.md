# Billing Troubleshooting Guide

This guide documents common billing and subscription issues with diagnostic steps and solutions.

## Table of Contents

1. [Webhook Not Processing](#1-webhook-not-processing)
2. [Payment Failure Investigation](#2-payment-failure-investigation)
3. [Subscription State Mismatch](#3-subscription-state-mismatch)
4. [Quota Enforcement Issues](#4-quota-enforcement-issues)
5. [Checkout Session Failures](#5-checkout-session-failures)
6. [Invoice Not Generated](#6-invoice-not-generated)
7. [Customer Portal Not Loading](#7-customer-portal-not-loading)
8. [Duplicate Webhook Processing](#8-duplicate-webhook-processing)
9. [Email Notifications Not Sending](#9-email-notifications-not-sending)
10. [Grace Period Not Working](#10-grace-period-not-working)
11. [Trial Period Issues](#11-trial-period-issues)
12. [Currency Mismatch](#12-currency-mismatch)
13. [Metrics Showing Incorrect Data](#13-metrics-showing-incorrect-data)
14. [Rate Limiting Errors](#14-rate-limiting-errors)

---

## 1. Webhook Not Processing

### Symptoms
- Events show in Stripe dashboard but not in database
- `subscription_events` table has no new records
- Subscription status not updating

### Diagnostic Steps

```sql
-- Check recent webhook events
SELECT stripe_event_id, event_type, processed_at, processing_error
FROM subscription_events
ORDER BY created_at DESC
LIMIT 20;

-- Find unprocessed events
SELECT * FROM subscription_events
WHERE processed_at IS NULL
ORDER BY created_at DESC;
```

```bash
# Check application logs for webhook errors
grep -i "webhook" /var/log/app/app.log | tail -50

# Verify Stripe webhook endpoint in CLI
stripe webhooks list
```

### Common Causes & Solutions

**Cause 1: Invalid webhook signature**
```
Error: Webhook signature verification failed
```
- **Solution**: Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check: Settings > Developers > Webhooks > Signing secret

**Cause 2: Raw body parsing issue**
- Express middleware must preserve raw body for Stripe verification
- **Solution**: Ensure webhook route uses raw body parser:
```javascript
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
```

**Cause 3: Network/firewall blocking**
- **Solution**: Whitelist Stripe IP ranges or verify endpoint is publicly accessible
- Test: `curl -X POST https://your-api.com/api/webhooks/stripe`

---

## 2. Payment Failure Investigation

### Symptoms
- Customer reports card declined
- Subscription stuck in `past_due` status
- Invoice shows `open` status

### Diagnostic Steps

```sql
-- Find failed invoices
SELECT i.*, s.organization_id, s.plan_tier
FROM invoices i
JOIN subscriptions s ON i.subscription_id = s.id
WHERE i.status = 'open'
ORDER BY i.created_at DESC;

-- Check subscription status
SELECT * FROM subscriptions
WHERE status = 'past_due'
ORDER BY updated_at DESC;
```

```bash
# Check Stripe dashboard for decline reason
stripe invoices retrieve inv_xxx --expand default_payment_method
```

### Common Causes & Solutions

**Cause 1: Insufficient funds**
- **Solution**: Customer needs to update payment method or retry payment

**Cause 2: Card expired**
- **Solution**: Direct customer to Stripe Customer Portal to update card:
```sql
-- Get customer portal URL
SELECT stripe_customer_id FROM subscriptions
WHERE organization_id = <org_id>;
```

**Cause 3: Card blocked by bank**
- **Solution**: Customer should contact bank or use different card

**Cause 4: 3D Secure required**
- **Solution**: Send customer invoice link for manual payment:
```sql
SELECT hosted_invoice_url FROM invoices
WHERE stripe_invoice_id = 'inv_xxx';
```

---

## 3. Subscription State Mismatch

### Symptoms
- Database shows different status than Stripe dashboard
- Features not matching plan tier
- Billing page shows incorrect information

### Diagnostic Steps

```sql
-- Compare database with Stripe
SELECT s.stripe_subscription_id, s.status as db_status, s.plan_tier,
       s.current_period_end, s.updated_at
FROM subscriptions s
WHERE s.organization_id = <org_id>;
```

```bash
# Get current Stripe status
stripe subscriptions retrieve sub_xxx
```

### Common Causes & Solutions

**Cause 1: Webhook event missed/failed**
```sql
-- Find failed webhook events for subscription
SELECT * FROM subscription_events
WHERE data::text LIKE '%sub_xxx%'
AND (processed_at IS NULL OR processing_error IS NOT NULL)
ORDER BY created_at DESC;
```
- **Solution**: Replay the event:
```bash
stripe events resend evt_xxx
```

**Cause 2: Race condition during checkout**
- **Solution**: Manually sync subscription state:
```sql
-- Update from Stripe data
UPDATE subscriptions
SET status = 'active',
    current_period_start = '2025-01-01',
    current_period_end = '2025-02-01',
    updated_at = NOW()
WHERE stripe_subscription_id = 'sub_xxx';
```

**Cause 3: Database migration issue**
- **Solution**: Re-run subscription webhook to resync:
```bash
stripe subscriptions update sub_xxx --metadata key=resync
```

---

## 4. Quota Enforcement Issues

### Symptoms
- User can exceed quota limits
- Quota not incrementing/decrementing properly
- Wrong quota limits for plan tier

### Diagnostic Steps

```sql
-- Check current quota status
SELECT * FROM usage_quotas
WHERE organization_id = <org_id>
ORDER BY dimension;

-- Verify plan tier matches subscription
SELECT o.plan_tier as org_tier, s.plan_tier as sub_tier
FROM organizations o
JOIN subscriptions s ON s.organization_id = o.id
WHERE o.id = <org_id>;

-- Check for usage drift
SELECT
  (SELECT COUNT(*) FROM sites WHERE organization_id = <org_id>) as actual_sites,
  (SELECT current_usage FROM usage_quotas WHERE organization_id = <org_id> AND dimension = 'sites') as tracked_sites;
```

### Common Causes & Solutions

**Cause 1: Quota not initialized**
```sql
-- Initialize quotas for organization
INSERT INTO usage_quotas (organization_id, dimension, current_usage, quota_limit)
SELECT <org_id>, dim, 0, limit_val
FROM (VALUES
  ('sites', 3),
  ('posts', 1000),
  ('users', 5),
  ('storage_bytes', 10737418240),
  ('api_calls', 100000)
) AS plan_limits(dim, limit_val)
ON CONFLICT (organization_id, dimension) DO NOTHING;
```

**Cause 2: Usage drift (count mismatch)**
- **Solution**: Recalculate actual usage:
```sql
-- Reset sites quota to actual count
UPDATE usage_quotas
SET current_usage = (SELECT COUNT(*) FROM sites WHERE organization_id = <org_id>)
WHERE organization_id = <org_id> AND dimension = 'sites';
```

**Cause 3: Plan downgrade without quota reset**
- **Solution**: Reset quotas to new tier limits:
```sql
UPDATE usage_quotas
SET quota_limit = 1
WHERE organization_id = <org_id> AND dimension = 'sites';
-- Repeat for other dimensions
```

---

## 5. Checkout Session Failures

### Symptoms
- User redirected back without completing checkout
- Checkout URL expired
- Error creating checkout session

### Diagnostic Steps

```bash
# Check recent checkout sessions in Stripe
stripe checkout sessions list --limit 10

# Get specific session details
stripe checkout sessions retrieve cs_xxx
```

### Common Causes & Solutions

**Cause 1: Missing metadata**
```
Error: Missing organization_id in checkout session metadata
```
- **Solution**: Verify checkout creation includes required metadata:
```javascript
const session = await stripe.checkout.sessions.create({
  metadata: {
    organization_id: orgId.toString(),
    plan_tier: planTier,
    billing_cycle: billingCycle,
  },
  // ...
});
```

**Cause 2: Invalid price ID**
- **Solution**: Verify price IDs in environment variables match Stripe dashboard

**Cause 3: Session expired (24 hours)**
- **Solution**: Create new checkout session - sessions expire after 24 hours

**Cause 4: Customer already has active subscription**
- **Solution**: Direct to Customer Portal for plan changes instead of new checkout

---

## 6. Invoice Not Generated

### Symptoms
- Subscription active but no invoices in database
- `invoice.payment_succeeded` webhook not received

### Diagnostic Steps

```sql
-- Check invoices for organization
SELECT * FROM invoices
WHERE organization_id = <org_id>
ORDER BY created_at DESC;

-- Check subscription events for invoice events
SELECT * FROM subscription_events
WHERE event_type LIKE 'invoice%'
AND data::text LIKE '%sub_xxx%'
ORDER BY created_at DESC;
```

### Common Causes & Solutions

**Cause 1: Webhook event not configured**
- **Solution**: Enable `invoice.payment_succeeded` in Stripe webhook settings

**Cause 2: Subscription not linked**
```sql
-- Find orphan subscription events
SELECT * FROM subscription_events
WHERE subscription_id IS NULL
AND event_type LIKE 'invoice%';
```
- **Solution**: Link event to subscription and reprocess

**Cause 3: Invoice already processed (idempotency)**
- Check if invoice already exists with same `stripe_invoice_id`

---

## 7. Customer Portal Not Loading

### Symptoms
- Portal URL returns error
- "No customer found" error
- Session expired immediately

### Diagnostic Steps

```sql
-- Check Stripe customer ID
SELECT stripe_customer_id FROM subscriptions
WHERE organization_id = <org_id>;
```

```bash
# Verify customer exists in Stripe
stripe customers retrieve cus_xxx
```

### Common Causes & Solutions

**Cause 1: No Stripe customer created**
- Organization never completed checkout
- **Solution**: User must complete initial checkout to create customer

**Cause 2: Customer Portal not configured in Stripe**
- **Solution**: Enable in Stripe Dashboard > Settings > Billing > Customer Portal

**Cause 3: Invalid return URL**
- **Solution**: Verify `return_url` is HTTPS and matches allowed domains

---

## 8. Duplicate Webhook Processing

### Symptoms
- Multiple subscription records created
- Duplicate invoices
- Double-counting in metrics

### Diagnostic Steps

```sql
-- Find duplicate subscription records
SELECT stripe_subscription_id, COUNT(*)
FROM subscriptions
GROUP BY stripe_subscription_id
HAVING COUNT(*) > 1;

-- Check for duplicate event processing
SELECT stripe_event_id, COUNT(*)
FROM subscription_events
GROUP BY stripe_event_id
HAVING COUNT(*) > 1;
```

### Common Causes & Solutions

**Cause 1: Idempotency key collision**
- Should not happen with proper `stripe_event_id` unique constraint
- **Solution**: Add missing unique constraint:
```sql
ALTER TABLE subscription_events
ADD CONSTRAINT unique_stripe_event_id UNIQUE (stripe_event_id);
```

**Cause 2: Race condition on concurrent retries**
- **Solution**: Webhook handler uses `SELECT FOR UPDATE SKIP LOCKED`
- Verify implementation in `webhooks.ts`

**Cause 3: Manual replay without checking**
- **Solution**: Check if event already processed before replaying

---

## 9. Email Notifications Not Sending

### Symptoms
- Trial ending email not received
- Invoice email not sent
- No emails in SendGrid activity

### Diagnostic Steps

```bash
# Check SendGrid API key is valid
curl -s -X GET https://api.sendgrid.com/v3/user/credits \
  -H "Authorization: Bearer $SENDGRID_API_KEY"

# Check application logs
grep -i "email" /var/log/app/app.log | grep -i "error"
```

### Common Causes & Solutions

**Cause 1: Invalid SendGrid API key**
- **Solution**: Verify `SENDGRID_API_KEY` is correct and has Mail Send permissions

**Cause 2: Domain not verified**
- **Solution**: Complete domain verification in SendGrid dashboard

**Cause 3: From address not authorized**
- **Solution**: Add `SENDGRID_FROM_EMAIL` to verified senders

**Cause 4: Email sent to spam**
- **Solution**: Add SPF, DKIM, and DMARC records for domain

---

## 10. Grace Period Not Working

### Symptoms
- Subscription canceled immediately on payment failure
- Grace period timer resetting on each retry
- Downgrade happening before grace period ends

### Diagnostic Steps

```sql
-- Check subscription timeline
SELECT id, status, updated_at,
       current_period_end,
       NOW() - updated_at as time_in_status
FROM subscriptions
WHERE status = 'past_due'
ORDER BY updated_at;

-- Check for multiple payment failure events
SELECT * FROM subscription_events
WHERE event_type = 'invoice.payment_failed'
AND organization_id = <org_id>
ORDER BY created_at DESC;
```

### Common Causes & Solutions

**Cause 1: `updated_at` resetting on each retry**
- Fixed in SF-016: Only update `updated_at` on first transition to `past_due`
- Verify fix is deployed

**Cause 2: Grace period job not running**
- **Solution**: Check cron job for `SubscriptionLifecycleService.processGracePeriods()`

**Cause 3: Grace period too short**
- Default is 7 days (`GRACE_PERIOD_DAYS`)
- **Solution**: Adjust if needed in configuration

---

## 11. Trial Period Issues

### Symptoms
- Trial not starting
- Trial ending early
- No trial ending email sent

### Diagnostic Steps

```sql
-- Check subscription trial status
SELECT id, status, trial_end, created_at
FROM subscriptions
WHERE status = 'trialing'
AND organization_id = <org_id>;
```

```bash
# Check Stripe subscription trial
stripe subscriptions retrieve sub_xxx
```

### Common Causes & Solutions

**Cause 1: Trial not configured in checkout**
- **Solution**: Pass `trial_days` in checkout creation

**Cause 2: `trial_will_end` webhook not enabled**
- **Solution**: Enable in Stripe webhook settings

**Cause 3: Trial ended but status not updated**
- **Solution**: Stripe sends `customer.subscription.updated` when trial ends

---

## 12. Currency Mismatch

### Symptoms
- Invoice amounts displaying incorrectly
- Japanese Yen showing cents
- Currency symbol wrong

### Diagnostic Steps

```sql
-- Check invoice currencies
SELECT currency, amount_cents, amount_paid_cents
FROM invoices
WHERE organization_id = <org_id>
ORDER BY created_at DESC;
```

### Common Causes & Solutions

**Cause 1: Zero-decimal currency handling**
- JPY, KRW, VND are zero-decimal (no cents)
- Stripe returns 1000 for 1000 JPY, not 100000

**Cause 2: Display logic not currency-aware**
- **Solution**: Use currency-aware formatting:
```javascript
const ZERO_DECIMAL = ['JPY', 'KRW', 'VND', ...];
const amount = ZERO_DECIMAL.includes(currency)
  ? cents
  : cents / 100;
```

---

## 13. Metrics Showing Incorrect Data

### Symptoms
- MRR calculation wrong
- Churn rate inflated
- Payment success rate incorrect

### Diagnostic Steps

```sql
-- Verify MRR calculation
SELECT SUM(amount_cents) / 100 as mrr_dollars
FROM subscriptions
WHERE status = 'active'
AND billing_cycle = 'monthly';

-- Check for double-counting
SELECT stripe_subscription_id, COUNT(*)
FROM subscriptions
WHERE status IN ('active', 'trialing')
GROUP BY stripe_subscription_id
HAVING COUNT(*) > 1;
```

### Common Causes & Solutions

**Cause 1: Including wrong statuses in MRR**
- Only count `active` subscriptions (not `trialing` or `past_due`)

**Cause 2: Annual subscriptions not normalized**
- **Solution**: Divide annual by 12:
```sql
SELECT SUM(
  CASE WHEN billing_cycle = 'annual' THEN amount_cents / 12.0
       ELSE amount_cents
  END
) as mrr
FROM subscriptions WHERE status = 'active';
```

**Cause 3: Counting draft invoices as payment attempts**
- Only count `paid` and `uncollectible` for payment metrics

---

## 14. Rate Limiting Errors

### Symptoms
- 429 errors from API
- Checkout creation failing
- Quota check timing out

### Diagnostic Steps

```bash
# Check rate limit headers
curl -I https://api.yourdomain.com/api/billing/subscription

# Monitor rate limit state
grep "rate" /var/log/nginx/access.log | tail -50
```

### Common Causes & Solutions

**Cause 1: Client retrying too aggressively**
- **Solution**: Implement exponential backoff on client

**Cause 2: Rate limit too restrictive**
- **Solution**: Adjust rate limit in configuration:
```javascript
app.use('/api/billing', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // requests per window
}));
```

**Cause 3: Shared rate limit across all users**
- **Solution**: Use per-user rate limiting based on user ID or IP

---

## Quick Reference: Diagnostic Queries

```sql
-- Organization billing summary
SELECT
  o.id, o.name, o.plan_tier,
  s.status as subscription_status,
  s.stripe_subscription_id,
  (SELECT COUNT(*) FROM invoices WHERE organization_id = o.id AND status = 'paid') as paid_invoices,
  (SELECT COUNT(*) FROM invoices WHERE organization_id = o.id AND status = 'open') as open_invoices
FROM organizations o
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE o.id = <org_id>;

-- Recent webhook activity
SELECT event_type, COUNT(*), MAX(created_at) as last_seen
FROM subscription_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY last_seen DESC;

-- Failed webhooks needing attention
SELECT *
FROM subscription_events
WHERE processed_at IS NULL
OR processing_error IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

---

## Related Documentation

- [API Reference](./API_BILLING.md) - Endpoint details
- [Deployment](./DEPLOYMENT_SAAS.md) - Setup guide
- [Runbook](./RUNBOOK_BILLING.md) - Operational procedures
- [Architecture](./ARCHITECTURE_SAAS.md) - System design
