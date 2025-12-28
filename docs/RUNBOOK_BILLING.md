# Billing Operations Runbook

This runbook provides step-by-step procedures for common billing operations and incident response.

## Table of Contents

- [Routine Operations](#routine-operations)
  - [Monthly Quota Reset](#monthly-quota-reset)
  - [Process Grace Period Expirations](#process-grace-period-expirations)
  - [Generate Billing Reports](#generate-billing-reports)
- [Customer Support Operations](#customer-support-operations)
  - [Upgrade Customer Plan](#upgrade-customer-plan)
  - [Downgrade Customer Plan](#downgrade-customer-plan)
  - [Apply Coupon/Discount](#apply-coupondiscount)
  - [Issue Refund](#issue-refund)
  - [Cancel Subscription](#cancel-subscription)
  - [Reactivate Canceled Subscription](#reactivate-canceled-subscription)
- [Incident Response](#incident-response)
  - [Webhook Processing Failure](#webhook-processing-failure)
  - [Mass Payment Failure](#mass-payment-failure)
  - [Subscription State Mismatch](#subscription-state-mismatch)
  - [Database Migration Rollback](#database-migration-rollback)
- [Monitoring Procedures](#monitoring-procedures)
  - [Daily Health Check](#daily-health-check)
  - [Alert Response](#alert-response)

---

## Routine Operations

### Monthly Quota Reset

**Frequency**: 1st of each month at 00:00 UTC

**Purpose**: Reset monthly API call quotas for all organizations

**Procedure**:

1. **Verify scheduled job is enabled**
   ```bash
   # Check cron configuration
   crontab -l | grep quota
   ```

2. **Manual execution (if needed)**
   ```bash
   # API method
   curl -X POST https://api.yourdomain.com/api/quotas/reset-all \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **Verify reset completed**
   ```sql
   -- Check reset timestamp
   SELECT dimension, last_reset_at
   FROM usage_quotas
   WHERE dimension = 'api_calls'
   LIMIT 10;
   ```

4. **Expected outcome**
   - All `api_calls` quotas reset to 0
   - `last_reset_at` updated to current timestamp
   - Other dimensions (sites, posts, users) remain unchanged

---

### Process Grace Period Expirations

**Frequency**: Daily at 02:00 UTC

**Purpose**: Cancel subscriptions that have exceeded the 7-day grace period

**Procedure**:

1. **Check pending expirations**
   ```sql
   SELECT s.id, s.organization_id, o.name, s.updated_at,
          NOW() - s.updated_at as time_in_grace
   FROM subscriptions s
   JOIN organizations o ON o.id = s.organization_id
   WHERE s.status = 'past_due'
   AND s.updated_at < NOW() - INTERVAL '7 days'
   ORDER BY s.updated_at;
   ```

2. **Manual processing (if job failed)**
   ```bash
   # Trigger via API
   curl -X POST https://api.yourdomain.com/api/admin/process-grace-periods \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **Verify cancellations**
   ```sql
   SELECT * FROM subscriptions
   WHERE status = 'canceled'
   AND canceled_at > NOW() - INTERVAL '1 day'
   ORDER BY canceled_at DESC;
   ```

4. **Expected outcome**
   - Subscriptions past grace period canceled in Stripe
   - Organizations downgraded to free tier
   - Quotas reset to free tier limits
   - Cancellation emails sent to admins

---

### Generate Billing Reports

**Frequency**: Weekly/Monthly as needed

**Purpose**: Generate MRR, churn, and revenue reports

**Procedure**:

1. **MRR Report**
   ```sql
   SELECT
     DATE_TRUNC('month', created_at) as month,
     plan_tier,
     COUNT(*) as subscriptions,
     SUM(CASE WHEN billing_cycle = 'annual' THEN amount_cents/12 ELSE amount_cents END) as mrr_cents
   FROM subscriptions
   WHERE status = 'active'
   GROUP BY DATE_TRUNC('month', created_at), plan_tier
   ORDER BY month DESC, plan_tier;
   ```

2. **Churn Report**
   ```sql
   SELECT
     DATE_TRUNC('month', canceled_at) as month,
     COUNT(*) as churned_subscriptions,
     SUM(amount_cents) as churned_revenue_cents
   FROM subscriptions
   WHERE status = 'canceled'
   AND canceled_at IS NOT NULL
   GROUP BY DATE_TRUNC('month', canceled_at)
   ORDER BY month DESC;
   ```

3. **Revenue Report**
   ```sql
   SELECT
     DATE_TRUNC('month', paid_at) as month,
     COUNT(*) as invoices,
     SUM(amount_paid_cents) as revenue_cents
   FROM invoices
   WHERE status = 'paid'
   GROUP BY DATE_TRUNC('month', paid_at)
   ORDER BY month DESC;
   ```

4. **Export via API**
   ```bash
   curl https://api.yourdomain.com/api/metrics/billing \
     -H "Authorization: Bearer $ADMIN_TOKEN" > billing_report.json
   ```

---

## Customer Support Operations

### Upgrade Customer Plan

**When**: Customer requests upgrade or completes checkout

**Procedure**:

1. **Verify current subscription**
   ```sql
   SELECT s.*, o.name
   FROM subscriptions s
   JOIN organizations o ON o.id = s.organization_id
   WHERE s.organization_id = <org_id>;
   ```

2. **Direct customer to checkout**
   - Navigate to Billing page in admin
   - Select new plan and click Upgrade
   - Customer completes Stripe Checkout

3. **If webhook-based upgrade fails, manual update**
   ```bash
   # Update subscription in Stripe
   stripe subscriptions update sub_xxx \
     --items[0][price]=price_new_plan_id
   ```

4. **Update quotas to new tier**
   ```sql
   UPDATE usage_quotas
   SET quota_limit = CASE dimension
     WHEN 'sites' THEN 10
     WHEN 'posts' THEN 10000
     WHEN 'users' THEN 25
     WHEN 'storage_bytes' THEN 107374182400
     WHEN 'api_calls' THEN 1000000
   END
   WHERE organization_id = <org_id>;

   UPDATE organizations
   SET plan_tier = 'pro'
   WHERE id = <org_id>;
   ```

5. **Verify upgrade completed**
   ```sql
   SELECT * FROM subscriptions WHERE organization_id = <org_id>;
   SELECT * FROM usage_quotas WHERE organization_id = <org_id>;
   ```

---

### Downgrade Customer Plan

**When**: Customer requests downgrade or subscription canceled

**Procedure**:

1. **Check current usage**
   ```sql
   SELECT uq.dimension, uq.current_usage, uq.quota_limit,
          CASE WHEN uq.current_usage > new_limits.limit_val THEN 'OVER_LIMIT' ELSE 'OK' END as status
   FROM usage_quotas uq
   CROSS JOIN (VALUES
     ('sites', 3), ('posts', 1000), ('users', 5),
     ('storage_bytes', 10737418240), ('api_calls', 100000)
   ) as new_limits(dim, limit_val)
   WHERE uq.organization_id = <org_id>
   AND uq.dimension = new_limits.dim;
   ```

2. **Warn customer if over new limits**
   - Sites/users over limit will be soft-blocked
   - Posts remain accessible but new creation blocked

3. **Process downgrade**
   - Direct customer to Customer Portal
   - Or handle via Stripe dashboard

4. **Update quotas after downgrade**
   ```sql
   UPDATE usage_quotas
   SET quota_limit = CASE dimension
     WHEN 'sites' THEN 3
     WHEN 'posts' THEN 1000
     WHEN 'users' THEN 5
     WHEN 'storage_bytes' THEN 10737418240
     WHEN 'api_calls' THEN 100000
   END
   WHERE organization_id = <org_id>;

   UPDATE organizations
   SET plan_tier = 'starter'
   WHERE id = <org_id>;
   ```

---

### Apply Coupon/Discount

**When**: Customer has valid coupon code

**Procedure**:

1. **Create coupon in Stripe (if not exists)**
   ```bash
   stripe coupons create \
     --percent_off=20 \
     --duration=once \
     --id=LAUNCH20
   ```

2. **Apply to subscription**
   ```bash
   stripe subscriptions update sub_xxx \
     --coupon=LAUNCH20
   ```

3. **Verify discount applied**
   ```bash
   stripe subscriptions retrieve sub_xxx | jq '.discount'
   ```

---

### Issue Refund

**When**: Customer requests refund (within policy)

**Procedure**:

1. **Find invoice to refund**
   ```sql
   SELECT i.stripe_invoice_id, i.amount_paid_cents, i.paid_at
   FROM invoices i
   WHERE i.organization_id = <org_id>
   AND i.status = 'paid'
   ORDER BY i.paid_at DESC;
   ```

2. **Get charge ID from invoice**
   ```bash
   stripe invoices retrieve inv_xxx | jq '.charge'
   ```

3. **Issue refund**
   ```bash
   # Full refund
   stripe refunds create --charge=ch_xxx

   # Partial refund
   stripe refunds create --charge=ch_xxx --amount=5000
   ```

4. **Document in support system**
   - Record refund reason
   - Update customer notes

---

### Cancel Subscription

**When**: Customer requests immediate cancellation

**Procedure**:

1. **Determine cancellation type**
   - End of period (recommended): `cancel_at_period_end=true`
   - Immediate: Cancel now with optional proration

2. **Cancel at period end (preferred)**
   ```bash
   stripe subscriptions update sub_xxx \
     --cancel_at_period_end=true
   ```

3. **Immediate cancellation**
   ```bash
   stripe subscriptions cancel sub_xxx
   ```

4. **Verify webhook processed**
   ```sql
   SELECT * FROM subscription_events
   WHERE event_type = 'customer.subscription.deleted'
   AND data::text LIKE '%sub_xxx%'
   ORDER BY created_at DESC LIMIT 1;
   ```

5. **Verify organization downgraded**
   ```sql
   SELECT o.plan_tier, s.status
   FROM organizations o
   JOIN subscriptions s ON s.organization_id = o.id
   WHERE o.id = <org_id>;
   ```

---

### Reactivate Canceled Subscription

**When**: Customer wants to resume canceled subscription

**Procedure**:

1. **Check if within reactivation window**
   ```sql
   SELECT * FROM subscriptions
   WHERE organization_id = <org_id>
   AND status = 'canceled';
   ```

2. **If cancel_at_period_end was set (not yet canceled)**
   ```bash
   stripe subscriptions update sub_xxx \
     --cancel_at_period_end=false
   ```

3. **If fully canceled, create new subscription**
   - Direct customer to checkout flow
   - Or create via Stripe dashboard

4. **Restore quotas to previous tier**
   ```sql
   UPDATE usage_quotas
   SET quota_limit = CASE dimension
     WHEN 'sites' THEN 10
     -- ... previous tier limits
   END
   WHERE organization_id = <org_id>;

   UPDATE organizations
   SET plan_tier = 'pro'
   WHERE id = <org_id>;
   ```

---

## Incident Response

### Webhook Processing Failure

**Severity**: High

**Symptoms**:
- Events in Stripe not reflected in database
- Alert: "Webhook failure rate > 5%"

**Procedure**:

1. **Assess impact**
   ```sql
   SELECT event_type, COUNT(*), MAX(created_at)
   FROM subscription_events
   WHERE processed_at IS NULL
   OR processing_error IS NOT NULL
   GROUP BY event_type;
   ```

2. **Check application logs**
   ```bash
   grep -i "webhook" /var/log/app/app.log | tail -100
   ```

3. **Identify root cause**
   - Signature verification failure → Check WEBHOOK_SECRET
   - Database connection → Check pool status
   - Application crash → Check process status

4. **Replay failed events**
   ```bash
   # Get list of failed events
   stripe events list --type=customer.subscription.updated --limit=20

   # Replay specific event
   stripe events resend evt_xxx
   ```

5. **Monitor recovery**
   ```bash
   curl https://api.yourdomain.com/api/metrics/webhooks \
     -H "Authorization: Bearer $TOKEN" | jq '.data.failureRate'
   ```

6. **Update status page** if customer-facing impact

---

### Mass Payment Failure

**Severity**: Critical

**Symptoms**:
- Multiple `invoice.payment_failed` events
- Alert: "Payment failure rate > threshold"

**Procedure**:

1. **Assess scope**
   ```sql
   SELECT COUNT(*), MIN(created_at), MAX(created_at)
   FROM subscription_events
   WHERE event_type = 'invoice.payment_failed'
   AND created_at > NOW() - INTERVAL '1 hour';
   ```

2. **Check Stripe status**
   - Visit status.stripe.com
   - Check for outage notifications

3. **Check payment processor connectivity**
   ```bash
   stripe balance retrieve
   ```

4. **If Stripe outage**
   - Wait for Stripe resolution
   - Stripe auto-retries failed payments
   - Communicate to affected customers

5. **If our infrastructure issue**
   - Check database connectivity
   - Check application health
   - Scale resources if needed

6. **Post-incident**
   - Review affected subscriptions
   - Manually retry if needed
   - Update customers on status

---

### Subscription State Mismatch

**Severity**: Medium

**Symptoms**:
- Customer reports wrong plan features
- Database status differs from Stripe

**Procedure**:

1. **Compare states**
   ```bash
   # Get Stripe state
   stripe subscriptions retrieve sub_xxx
   ```

   ```sql
   -- Get database state
   SELECT * FROM subscriptions
   WHERE stripe_subscription_id = 'sub_xxx';
   ```

2. **Identify missing events**
   ```sql
   SELECT stripe_event_id, event_type, processed_at, processing_error
   FROM subscription_events
   WHERE data::text LIKE '%sub_xxx%'
   ORDER BY created_at;
   ```

3. **Resync from Stripe**
   ```sql
   UPDATE subscriptions
   SET status = 'active',
       plan_tier = 'pro',
       current_period_end = '2025-02-01',
       updated_at = NOW()
   WHERE stripe_subscription_id = 'sub_xxx';
   ```

4. **Update quotas**
   ```sql
   UPDATE usage_quotas
   SET quota_limit = <correct_limit>
   WHERE organization_id = <org_id>
   AND dimension = '<dimension>';
   ```

5. **Invalidate cache**
   ```bash
   # Subscription cache is invalidated automatically on update
   # But can force via API if needed
   ```

---

### Database Migration Rollback

**Severity**: Critical

**When**: Migration caused data corruption or service degradation

**Procedure**:

1. **Assess impact**
   - Check error logs
   - Identify affected tables/data

2. **Stop application** (if severe)
   ```bash
   docker-compose stop app
   ```

3. **Restore from backup**
   ```bash
   # List available backups
   pg_restore --list /backups/latest.dump

   # Restore specific tables
   pg_restore -d cms_db -t subscriptions /backups/latest.dump
   ```

4. **Or manually rollback migration**
   ```sql
   -- Example: Rollback migration 010
   DROP INDEX IF EXISTS idx_subscriptions_cancel_pending;
   ALTER TABLE subscriptions
   DROP COLUMN IF EXISTS cancel_at_period_end_pending;
   ```

5. **Restart application**
   ```bash
   docker-compose start app
   ```

6. **Verify service restored**
   ```bash
   curl https://api.yourdomain.com/api/health
   ```

7. **Post-incident review**
   - Document what went wrong
   - Update migration testing procedures

---

## Monitoring Procedures

### Daily Health Check

**Frequency**: Daily at 09:00 local time

**Procedure**:

1. **Check system health**
   ```bash
   curl https://api.yourdomain.com/api/metrics/health \
     -H "Authorization: Bearer $TOKEN" | jq
   ```

2. **Review metrics summary**
   ```bash
   curl https://api.yourdomain.com/api/metrics/summary \
     -H "Authorization: Bearer $TOKEN" | jq
   ```

3. **Check webhook stats**
   ```bash
   curl "https://api.yourdomain.com/api/metrics/webhooks?window=1440" \
     -H "Authorization: Bearer $TOKEN" | jq
   ```

4. **Review failed events**
   ```sql
   SELECT COUNT(*) as failed_events
   FROM subscription_events
   WHERE processed_at IS NULL
   OR processing_error IS NOT NULL;
   ```

5. **Action items** if issues found:
   - Escalate to on-call if critical
   - Create tickets for non-critical issues
   - Document in daily standup notes

---

### Alert Response

**Alert: webhook_failure_rate**

1. Check `/api/metrics/webhooks` for failure details
2. Review recent failures in `subscription_events`
3. Check application logs for errors
4. Follow [Webhook Processing Failure](#webhook-processing-failure) runbook

**Alert: payment_failure_rate**

1. Check `/api/metrics/payments` for failure rate
2. Check Stripe dashboard for decline reasons
3. Verify Stripe connectivity
4. Follow [Mass Payment Failure](#mass-payment-failure) runbook

**Alert: api_response_time**

1. Check API latency metrics
2. Review database query performance
3. Check for resource constraints
4. Scale if needed

**Alert: database_errors**

1. Check database connection pool status
2. Review slow query logs
3. Check disk space and connections
4. Escalate to DBA if needed

---

## Contact Information

**On-Call Rotation**: Check PagerDuty schedule

**Escalation Path**:
1. L1: On-call engineer
2. L2: Backend team lead
3. L3: Platform engineering

**External Contacts**:
- Stripe Support: support.stripe.com
- SendGrid Support: support.sendgrid.com

---

## Related Documentation

- [API Reference](./API_BILLING.md) - Endpoint details
- [Deployment](./DEPLOYMENT_SAAS.md) - Setup guide
- [Troubleshooting](./TROUBLESHOOTING_BILLING.md) - Common issues
- [Architecture](./ARCHITECTURE_SAAS.md) - System design
