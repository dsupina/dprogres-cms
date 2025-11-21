# Stripe Account Setup Guide

## Prerequisites
- Stripe account (sign up at https://stripe.com)
- Access to Stripe Dashboard
- Stripe CLI installed (optional but recommended)

## Step 1: Create Stripe Account
1. Sign up at https://stripe.com
2. Complete business verification (optional for test mode)
3. Enable test mode toggle in Dashboard

## Step 2: Create Products

### Starter Plan
- Name: Starter Plan
- Description: For freelancers and small teams
- Pricing:
  - Monthly: $29/month
  - Annual: $290/year

### Pro Plan
- Name: Pro Plan
- Description: For agencies and growing teams
- Pricing:
  - Monthly: $99/month
  - Annual: $990/year

### Enterprise Plan
- Name: Enterprise Plan
- Description: Custom solutions
- Pricing: Custom (contact sales)

## Step 3: Configure Webhooks
1. Go to Developers → Webhooks
2. Click "Add endpoint"
3. Enter endpoint URL: `https://your-backend.com/api/webhooks/stripe`
4. Select events (see list in SF-002 ticket)
5. Copy webhook signing secret

## Step 4: Generate API Keys
1. Go to Developers → API keys
2. Copy "Publishable key" (pk_test_...)
3. Click "Reveal test key" and copy "Secret key" (sk_test_...)
4. Store in `.env` file

## Step 5: Test Configuration
```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

## Troubleshooting
- If webhooks not receiving events, check firewall/ngrok
- If API keys not working, verify correct mode (test vs live)
- If prices not found, verify environment variables loaded
