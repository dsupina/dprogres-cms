# Stripe Setup Guide

This document provides comprehensive instructions for setting up Stripe integration in both development (test mode) and production (live mode) environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup (Test Mode)](#development-setup-test-mode)
- [Production Setup (Live Mode)](#production-setup-live-mode)
- [Environment Variables](#environment-variables)
- [Webhook Configuration](#webhook-configuration)
- [Product & Price Setup](#product--price-setup)
- [Validation Checklist](#validation-checklist)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Stripe account (sign up at https://stripe.com)
- Access to Stripe Dashboard
- Stripe CLI installed (recommended for development)
- Backend application deployed (for production webhooks)

---

## Development Setup (Test Mode)

### Step 1: Create Stripe Account

1. Sign up at https://stripe.com
2. Complete email verification
3. Enable **test mode** toggle in Dashboard (top-right)
4. Note: Business verification is optional for test mode

### Step 2: Get Test API Keys

1. Go to **Developers** → **API keys**
2. Copy the **Publishable key** (starts with `pk_test_`)
3. Click "Reveal test key" and copy the **Secret key** (starts with `sk_test_`)

### Step 3: Create Test Products & Prices

See [Product & Price Setup](#product--price-setup) section below.

### Step 4: Configure Test Webhooks

For local development, use Stripe CLI:

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: Download from https://github.com/stripe/stripe-cli/releases

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/webhooks/stripe

# In a separate terminal, trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

The CLI will display the webhook signing secret (starts with `whsec_`). Save this for your `.env` file.

### Step 5: Configure Environment Variables

Add to your `.env` file:

```env
# Stripe API Keys (Test Mode)
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...

# Stripe Price IDs (Test Mode)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
```

---

## Production Setup (Live Mode)

**IMPORTANT**: Complete all test mode validation before switching to production.

### Step 1: Complete Business Verification

1. Go to **Settings** → **Business settings**
2. Complete all required fields:
   - Legal business name
   - Business address
   - Tax identification number
   - Bank account for payouts
3. Submit for verification (may take 1-2 business days)

### Step 2: Switch to Live Mode

1. Toggle **"Test mode"** to OFF in Dashboard (top-right)
2. You'll see the orange "Test mode" banner disappear

### Step 3: Get Live API Keys

1. Go to **Developers** → **API keys** (in live mode)
2. Copy the **Publishable key** (starts with `pk_live_`)
3. Click "Reveal live key" and copy the **Secret key** (starts with `sk_live_`)
4. **IMPORTANT**: Store these securely - they provide access to real payments

### Step 4: Create Live Products & Prices

1. Ensure you're in **live mode** (no orange test banner)
2. Follow [Product & Price Setup](#product--price-setup) section
3. Copy the new price IDs (will be different from test)

### Step 5: Configure Production Webhook

1. Go to **Developers** → **Webhooks** (in live mode)
2. Click **"Add endpoint"**
3. Enter your production URL: `https://api.dprogres.com/api/webhooks/stripe`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.updated`
   - `payment_method.attached`
   - `payment_method.detached`
   - `customer.subscription.trial_will_end`
   - `invoice.upcoming`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_`)

### Step 6: Configure Production Environment Variables

In your hosting platform (Vercel, Heroku, AWS, etc.), set:

```env
# Application Mode
NODE_ENV=production

# Stripe API Keys (Production)
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...

# Stripe Price IDs (Production)
STRIPE_PRICE_STARTER_MONTHLY_LIVE=price_...
STRIPE_PRICE_STARTER_ANNUAL_LIVE=price_...
STRIPE_PRICE_PRO_MONTHLY_LIVE=price_...
STRIPE_PRICE_PRO_ANNUAL_LIVE=price_...
```

### Step 7: Validate Webhook Delivery

```bash
# Using Stripe CLI in live mode
stripe trigger checkout.session.completed --live

# Check webhook delivery in Dashboard
# Go to Developers → Webhooks → Select endpoint → View attempts
```

### Step 8: Enable Optional Features (Recommended)

1. **Stripe Tax** (automatic tax calculation)
   - Settings → Tax → Enable Stripe Tax
   - Configure tax registrations for applicable jurisdictions

2. **Domain Authentication for Emails**
   - Settings → Branding → Domains
   - Add and verify your domain for branded receipts

3. **Customer Portal Configuration**
   - Settings → Customer portal
   - Enable invoice history, payment method management
   - Set branding colors and logo

---

## Environment Variables

### Complete Environment Variable Reference

```env
# ==============================================
# STRIPE CONFIGURATION
# ==============================================

# API Keys - Test Mode (development)
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_test_...

# API Keys - Live Mode (production)
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_live_...

# Price IDs - Test Mode
STRIPE_PRICE_STARTER_MONTHLY=price_test_starter_monthly_...
STRIPE_PRICE_STARTER_ANNUAL=price_test_starter_annual_...
STRIPE_PRICE_PRO_MONTHLY=price_test_pro_monthly_...
STRIPE_PRICE_PRO_ANNUAL=price_test_pro_annual_...

# Price IDs - Live Mode
STRIPE_PRICE_STARTER_MONTHLY_LIVE=price_live_starter_monthly_...
STRIPE_PRICE_STARTER_ANNUAL_LIVE=price_live_starter_annual_...
STRIPE_PRICE_PRO_MONTHLY_LIVE=price_live_pro_monthly_...
STRIPE_PRICE_PRO_ANNUAL_LIVE=price_live_pro_annual_...
```

### Environment-Based Key Selection

The application automatically selects keys based on `NODE_ENV`:

| NODE_ENV    | Keys Used        | Webhook Secret               |
|-------------|------------------|------------------------------|
| development | `*_TEST`         | `STRIPE_WEBHOOK_SECRET_TEST` |
| test        | `*_TEST` (dummy) | Not required                 |
| production  | `*_LIVE`         | `STRIPE_WEBHOOK_SECRET_LIVE` |

---

## Webhook Configuration

### Required Webhook Events

Configure your webhook endpoint to receive these events:

| Event                                 | Purpose                                    |
|---------------------------------------|--------------------------------------------|
| `checkout.session.completed`          | New subscription created via checkout      |
| `customer.subscription.created`       | Subscription record created in Stripe      |
| `customer.subscription.updated`       | Plan change, status change, renewal        |
| `customer.subscription.deleted`       | Subscription canceled/expired              |
| `invoice.payment_succeeded`           | Successful payment, update status          |
| `invoice.payment_failed`              | Failed payment, start grace period         |
| `customer.updated`                    | Sync customer name/email to organization   |
| `payment_method.attached`             | Store payment method details               |
| `payment_method.detached`             | Soft delete payment method                 |
| `customer.subscription.trial_will_end`| Send trial ending warning (3 days before)  |
| `invoice.upcoming`                    | Send renewal notice (7 days before)        |

### Webhook Security

The webhook handler verifies:
1. **Signature verification** using `stripe.webhooks.constructEvent()`
2. **Idempotency** via `subscription_events` table
3. **Transaction safety** with database transactions

---

## Product & Price Setup

### Create Products in Stripe Dashboard

#### Starter Plan

1. Go to **Products** → **Add product**
2. Configure:
   - **Name**: Starter Plan
   - **Description**: For freelancers and small teams - 3 sites, 1,000 posts, 5 team members
   - **Image**: Optional product image
3. Add pricing:
   - **Monthly**: $29.00 USD, Recurring, Monthly
   - **Annual**: $290.00 USD, Recurring, Yearly (2 months free)
4. Save and copy both price IDs

#### Pro Plan

1. Go to **Products** → **Add product**
2. Configure:
   - **Name**: Pro Plan
   - **Description**: For agencies and growing teams - 10 sites, 10,000 posts, 25 team members
   - **Image**: Optional product image
3. Add pricing:
   - **Monthly**: $99.00 USD, Recurring, Monthly
   - **Annual**: $990.00 USD, Recurring, Yearly (2 months free)
4. Save and copy both price IDs

#### Enterprise Plan

Enterprise plans are handled via custom contracts ("Contact Sales"). No Stripe product required.

### Price ID Naming Convention

Use consistent naming in Stripe metadata:

```
Test:  price_1AbCdEfGhIjKlMnOp (Starter Monthly Test)
Live:  price_1XyZaBcDeFgHiJkLm (Starter Monthly Live)
```

---

## Validation Checklist

### Pre-Production Checklist

- [ ] Business verification completed in Stripe Dashboard
- [ ] Bank account configured for payouts
- [ ] Live API keys generated and stored securely
- [ ] Production webhook endpoint added in Stripe Dashboard
- [ ] All 11 webhook events selected
- [ ] Webhook signing secret copied
- [ ] Production products and prices created
- [ ] Environment variables configured in hosting platform
- [ ] SSL certificate valid on webhook endpoint

### Production Go-Live Checklist

- [ ] Webhook endpoint responding to Stripe events
- [ ] Test checkout flow with real card (use small amount, refund immediately)
- [ ] Verify subscription created in database after checkout
- [ ] Verify invoice created after payment
- [ ] Test customer portal access
- [ ] Verify email notifications working
- [ ] Monitor webhook delivery logs for errors
- [ ] First real transaction processed successfully

### Testing Commands

```bash
# Validate webhook endpoint (live mode)
stripe trigger checkout.session.completed --live
stripe trigger invoice.payment_succeeded --live
stripe trigger customer.subscription.updated --live

# Check webhook logs
# Dashboard → Developers → Webhooks → [endpoint] → Attempts

# View recent events
stripe events list --limit 10 --live
```

---

## Security Best Practices

### API Key Security

1. **Never commit API keys** to version control
2. **Use environment variables** for all keys
3. **Restrict key access** to production servers only
4. **Rotate keys** if compromised (Dashboard → API keys → Roll key)
5. **Use restricted keys** for specific operations if needed

### Webhook Security

1. **Always verify signatures** - Never skip signature verification
2. **Use HTTPS only** - Stripe requires TLS 1.2+
3. **Respond quickly** - Return 200 within 5 seconds
4. **Handle retries** - Stripe retries failed webhooks
5. **Log security events** - Track signature failures

### PCI Compliance

DProgres CMS uses Stripe Checkout (hosted payment page), which:
- Handles all card data on Stripe's servers
- Reduces PCI scope to SAQ A
- Never sends card numbers to your backend

---

## Troubleshooting

### Common Issues

#### Webhooks Not Receiving Events

1. Check endpoint URL is correct and accessible
2. Verify SSL certificate is valid
3. Check firewall/CDN allows Stripe IPs
4. Confirm webhook signing secret matches
5. Check application logs for errors

#### Signature Verification Failing

1. Ensure raw request body is passed (not parsed JSON)
2. Verify `STRIPE_WEBHOOK_SECRET_*` is correct
3. Check for middleware modifying request body

#### Prices Not Found

1. Verify price IDs are correct for environment (test vs live)
2. Check environment variables are loaded
3. Confirm products exist in correct mode (test vs live)

#### Customer Portal Not Working

1. Verify customer has active subscription
2. Check `stripe_customer_id` stored correctly
3. Confirm portal is configured in Stripe Dashboard

### Webhook Retry Behavior

Stripe retries failed webhooks:
- Up to 3 days for production events
- Exponential backoff between retries
- Dashboard shows delivery attempts and errors

### Support Resources

- Stripe Documentation: https://stripe.com/docs
- Stripe CLI Reference: https://stripe.com/docs/stripe-cli
- API Reference: https://stripe.com/docs/api
- Support: https://support.stripe.com

---

**Last Updated**: December 2025
**Related Tickets**: SF-025 (Production Stripe Setup), SF-003 (Stripe Integration), SF-004 (Webhook Handling)
