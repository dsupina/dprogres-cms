# SF-002: Stripe Account Setup & Configuration

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 1 (Database & Stripe Foundation)
**Priority**: P0 (Blocker)
**Estimated Effort**: 1 day
**Status**: Not Started
**Dependencies**: None
**Assigned To**: Backend Engineer

---

## Objective

Set up Stripe account (test + production modes), configure webhooks, generate API keys, and create product/price catalog for subscription tiers (Free, Starter $29, Pro $99, Enterprise custom).

---

## Requirements

### Functional Requirements

1. **Stripe Account Setup**:
   - Create Stripe account or use existing account
   - Enable test mode for development
   - Configure business settings (company name, logo, support email)
   - Set up tax settings (Stripe Tax optional in Phase 1)

2. **Product & Price Configuration**:
   - Create 4 products: Free, Starter, Pro, Enterprise
   - Create prices for monthly and annual billing
   - Configure trial periods (optional: 14-day trial for Starter/Pro)
   - Set up metered billing for overage (future consideration)

3. **Webhook Configuration**:
   - Register webhook endpoint URL
   - Select events to listen to (8+ events)
   - Generate webhook signing secret
   - Test webhook delivery

4. **API Keys & Secrets**:
   - Generate test mode API keys (publishable + secret)
   - Store keys in environment variables
   - Document key rotation process
   - Set up restricted keys for production (future)

### Non-Functional Requirements

- **Security**: Store API keys in environment variables, never in code
- **Compliance**: Configure Stripe Tax for automated tax calculation (optional in Phase 1)
- **Monitoring**: Enable Stripe Dashboard email notifications for failed payments
- **Documentation**: Document all Stripe configuration steps for reproducibility

---

## Technical Design

### Stripe Products & Prices

#### Product: Free Tier
```
Name: Free Plan
Description: Perfect for hobbyists and portfolios
Features:
  - 1 site
  - 20 posts per site
  - 2 users
  - 500 MB storage
  - 10k API calls/month
  - 7 days version history
  - Community support
Pricing: $0/month (no Stripe price needed)
```

#### Product: Starter Tier
```
Name: Starter Plan
Description: For freelancers and small teams
Features:
  - 3 sites
  - 100 posts per site
  - 5 users
  - 5 GB storage
  - 100k API calls/month
  - 30 days version history
  - Email support
  - Custom domains
  - Basic AI features
Pricing:
  - Monthly: $29/month
  - Annual: $290/year ($24.17/mo, save 16.7%)
```

#### Product: Pro Tier
```
Name: Pro Plan
Description: For agencies and growing teams
Features:
  - 10 sites
  - 1,000 posts per site
  - 20 users
  - 50 GB storage
  - 1M API calls/month
  - 90 days version history
  - Priority support
  - Custom domains
  - Advanced AI features
  - Webhooks
Pricing:
  - Monthly: $99/month
  - Annual: $990/year ($82.50/mo, save 16.7%)
```

#### Product: Enterprise Tier
```
Name: Enterprise Plan
Description: Custom solutions for large organizations
Features:
  - Unlimited sites
  - Unlimited posts
  - Unlimited users
  - Unlimited storage
  - Custom API limits
  - Unlimited version history
  - Dedicated support
  - Custom SLA
  - SCIM/SSO
  - Custom AI models
Pricing: Custom (contact sales)
```

### Stripe API Configuration

#### Create Products via Stripe Dashboard

**Free Plan** (no price needed):
```bash
# Created manually in Stripe Dashboard
# Product ID: prod_free (not used in Stripe, tracked internally)
```

**Starter Plan**:
```bash
# Product: Starter
stripe products create \
  --name="Starter Plan" \
  --description="For freelancers and small teams" \
  --metadata[tier]="starter"

# Price: Monthly
stripe prices create \
  --product=prod_starter_id \
  --currency=usd \
  --unit_amount=2900 \
  --recurring[interval]=month \
  --nickname="Starter Monthly"

# Price: Annual
stripe prices create \
  --product=prod_starter_id \
  --currency=usd \
  --unit_amount=29000 \
  --recurring[interval]=year \
  --nickname="Starter Annual"
```

**Pro Plan**:
```bash
# Product: Pro
stripe products create \
  --name="Pro Plan" \
  --description="For agencies and growing teams" \
  --metadata[tier]="pro"

# Price: Monthly
stripe prices create \
  --product=prod_pro_id \
  --currency=usd \
  --unit_amount=9900 \
  --recurring[interval]=month \
  --nickname="Pro Monthly"

# Price: Annual
stripe prices create \
  --product=prod_pro_id \
  --currency=usd \
  --unit_amount=99000 \
  --recurring[interval]=year \
  --nickname="Pro Annual"
```

**Enterprise Plan**:
```bash
# Product: Enterprise (pricing handled via custom invoices)
stripe products create \
  --name="Enterprise Plan" \
  --description="Custom solutions for large organizations" \
  --metadata[tier]="enterprise"
```

### Webhook Configuration

#### Webhook Endpoint
```
Test Mode URL: https://your-dev-backend.com/api/webhooks/stripe
Production URL: https://api.dprogres.com/api/webhooks/stripe
```

#### Events to Listen To

**Subscription Events**:
- `checkout.session.completed` - New subscription created
- `customer.subscription.created` - Subscription created
- `customer.subscription.updated` - Plan changed, status updated
- `customer.subscription.deleted` - Subscription canceled

**Payment Events**:
- `invoice.payment_succeeded` - Successful payment
- `invoice.payment_failed` - Failed payment (retry needed)
- `invoice.finalized` - Invoice ready for payment

**Payment Method Events**:
- `payment_method.attached` - Card added to customer
- `payment_method.detached` - Card removed
- `customer.updated` - Customer details changed

#### Webhook Signing Secret

Store in environment variables:
```env
STRIPE_WEBHOOK_SECRET_TEST=whsec_test_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_live_...
```

### Environment Variables

Add to `backend/.env`:

```env
# Stripe API Keys (Test Mode)
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_test_...

# Stripe API Keys (Production - add later)
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_live_...

# Stripe Price IDs (Test Mode)
STRIPE_PRICE_STARTER_MONTHLY=price_test_starter_monthly
STRIPE_PRICE_STARTER_ANNUAL=price_test_starter_annual
STRIPE_PRICE_PRO_MONTHLY=price_test_pro_monthly
STRIPE_PRICE_PRO_ANNUAL=price_test_pro_annual

# Stripe Price IDs (Production - add later)
STRIPE_PRICE_STARTER_MONTHLY_LIVE=price_live_starter_monthly
STRIPE_PRICE_STARTER_ANNUAL_LIVE=price_live_starter_annual
STRIPE_PRICE_PRO_MONTHLY_LIVE=price_live_pro_monthly
STRIPE_PRICE_PRO_ANNUAL_LIVE=price_live_pro_annual

# Stripe Configuration
STRIPE_API_VERSION=2023-10-16
STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
STRIPE_CANCEL_URL=http://localhost:5173/billing
```

### Stripe Configuration File

Create `backend/src/config/stripe.ts`:

```typescript
import Stripe from 'stripe';

// Determine environment (test vs production)
const isProduction = process.env.NODE_ENV === 'production';

// Select appropriate keys based on environment
const stripeSecretKey = isProduction
  ? process.env.STRIPE_SECRET_KEY_LIVE
  : process.env.STRIPE_SECRET_KEY_TEST;

if (!stripeSecretKey) {
  throw new Error('Stripe secret key not configured');
}

// Initialize Stripe client
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16', // Pin API version for stability
  typescript: true,
  appInfo: {
    name: 'DProgres CMS',
    version: '1.0.0',
    url: 'https://dprogres.com',
  },
});

// Price ID mapping
export const STRIPE_PRICES = {
  starter: {
    monthly: isProduction
      ? process.env.STRIPE_PRICE_STARTER_MONTHLY_LIVE
      : process.env.STRIPE_PRICE_STARTER_MONTHLY,
    annual: isProduction
      ? process.env.STRIPE_PRICE_STARTER_ANNUAL_LIVE
      : process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  pro: {
    monthly: isProduction
      ? process.env.STRIPE_PRICE_PRO_MONTHLY_LIVE
      : process.env.STRIPE_PRICE_PRO_MONTHLY,
    annual: isProduction
      ? process.env.STRIPE_PRICE_PRO_ANNUAL_LIVE
      : process.env.STRIPE_PRICE_PRO_ANNUAL,
  },
};

// Webhook secret
export const STRIPE_WEBHOOK_SECRET = isProduction
  ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
  : process.env.STRIPE_WEBHOOK_SECRET_TEST;

if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error('Stripe webhook secret not configured');
}

// Helper function to get price ID
export function getStripePriceId(
  tier: 'starter' | 'pro',
  billingCycle: 'monthly' | 'annual'
): string {
  const priceId = STRIPE_PRICES[tier][billingCycle];

  if (!priceId) {
    throw new Error(`Stripe price not configured for ${tier} ${billingCycle}`);
  }

  return priceId;
}

// Export Stripe types for convenience
export type StripeCustomer = Stripe.Customer;
export type StripeSubscription = Stripe.Subscription;
export type StripeInvoice = Stripe.Invoice;
export type StripeCheckoutSession = Stripe.Checkout.Session;
export type StripeEvent = Stripe.Event;
```

---

## Acceptance Criteria

- [ ] Stripe account created and verified
- [ ] Test mode enabled and configured
- [ ] 4 products created (Free, Starter, Pro, Enterprise)
- [ ] 4 prices created (Starter monthly/annual, Pro monthly/annual)
- [ ] Webhook endpoint registered in Stripe Dashboard
- [ ] 10 webhook events selected and active
- [ ] Webhook signing secret generated
- [ ] Test mode API keys (publishable + secret) generated
- [ ] All keys stored in `backend/.env` file
- [ ] `backend/src/config/stripe.ts` configuration file created
- [ ] Stripe Dashboard accessible and configured
- [ ] Test webhook delivery successful (use Stripe CLI or Dashboard test feature)
- [ ] Documentation created for future onboarding

---

## Testing

### Manual Testing Checklist

```bash
# 1. Verify Stripe CLI installed
stripe --version

# 2. Login to Stripe account
stripe login

# 3. Test webhook forwarding
stripe listen --forward-to localhost:5000/api/webhooks/stripe

# 4. Trigger test webhook event
stripe trigger checkout.session.completed

# 5. Verify environment variables loaded
node -e "require('dotenv').config(); console.log('Stripe Secret Key:', process.env.STRIPE_SECRET_KEY_TEST?.substring(0, 10) + '...');"

# 6. Test Stripe configuration file
cd backend
npx ts-node -e "import('./src/config/stripe.ts').then(m => console.log('Stripe initialized:', !!m.stripe))"
```

### Stripe Dashboard Verification

1. Navigate to https://dashboard.stripe.com/test/products
2. Verify 3 products are listed (Starter, Pro, Enterprise)
3. Click each product and verify prices are attached
4. Navigate to https://dashboard.stripe.com/test/webhooks
5. Verify webhook endpoint is registered
6. Verify 10 events are selected
7. Click "Send test webhook" to verify delivery

### Integration Test

Create `backend/src/__tests__/config/stripe.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { stripe, getStripePriceId, STRIPE_PRICES } from '../../config/stripe';

describe('Stripe Configuration', () => {
  it('should initialize Stripe client', () => {
    expect(stripe).toBeDefined();
    expect(stripe.customers).toBeDefined();
  });

  it('should have all price IDs configured', () => {
    expect(STRIPE_PRICES.starter.monthly).toBeDefined();
    expect(STRIPE_PRICES.starter.annual).toBeDefined();
    expect(STRIPE_PRICES.pro.monthly).toBeDefined();
    expect(STRIPE_PRICES.pro.annual).toBeDefined();
  });

  it('should retrieve price ID correctly', () => {
    const priceId = getStripePriceId('starter', 'monthly');
    expect(priceId).toMatch(/^price_(test_)?/);
  });

  it('should throw error for invalid tier', () => {
    expect(() => getStripePriceId('invalid' as any, 'monthly')).toThrow();
  });
});
```

Run test:
```bash
cd backend
npm test -- stripe.test.ts
```

---

## Documentation

### Stripe Setup Guide

Create `docs/STRIPE_SETUP.md`:

```markdown
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
```

### Key Rotation Process

Add to `docs/SECURITY.md`:

```markdown
## Stripe API Key Rotation

**When to rotate**:
- Every 90 days (best practice)
- When key is compromised
- When team member leaves

**How to rotate**:
1. Generate new API key in Stripe Dashboard
2. Update `backend/.env` with new key
3. Deploy updated environment variables to production
4. Verify new key works
5. Delete old key in Stripe Dashboard

**Rollback plan**:
- Keep old key active for 24 hours after rotation
- If issues arise, revert to old key
- Investigate issue before retrying rotation
```

---

## Deployment Notes

### Local Development Setup

```bash
# 1. Install Stripe CLI
# macOS:
brew install stripe/stripe-cli/stripe

# Windows:
scoop install stripe

# Linux:
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe

# 2. Login to Stripe
stripe login

# 3. Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env and add Stripe keys

# 4. Start webhook forwarding (in separate terminal)
stripe listen --forward-to localhost:5000/api/webhooks/stripe

# 5. Trigger test webhook
stripe trigger checkout.session.completed
```

### Staging/Production Setup

```bash
# 1. Switch to production mode in Stripe Dashboard
# 2. Create production products and prices (same as test mode)
# 3. Generate production API keys
# 4. Add production webhook endpoint (https://api.dprogres.com/api/webhooks/stripe)
# 5. Update production environment variables in hosting platform (Railway, Vercel, etc.)
# 6. Verify webhook delivery using Stripe Dashboard "Send test webhook" feature
```

### Environment Variable Checklist

Before deploying, verify all variables are set:

```bash
# Check required variables
node -e "
const required = [
  'STRIPE_SECRET_KEY_TEST',
  'STRIPE_PUBLISHABLE_KEY_TEST',
  'STRIPE_WEBHOOK_SECRET_TEST',
  'STRIPE_PRICE_STARTER_MONTHLY',
  'STRIPE_PRICE_STARTER_ANNUAL',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL'
];
require('dotenv').config();
const missing = required.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error('Missing variables:', missing);
  process.exit(1);
}
console.log('All required Stripe variables configured ✓');
"
```

---

## Risk Mitigation

### Risk 1: API Key Exposure
**Risk**: API keys committed to Git repository

**Mitigation**:
- Add `.env` to `.gitignore`
- Use `.env.example` template without real keys
- Run git-secrets or similar tool to detect accidental commits
- Rotate keys immediately if exposed

### Risk 2: Webhook Endpoint Unreachable
**Risk**: Stripe cannot deliver webhooks to backend

**Mitigation**:
- Use ngrok or similar tunneling tool in development
- Ensure production URL is publicly accessible
- Configure firewall to allow Stripe IP ranges
- Test webhook delivery using Stripe Dashboard

### Risk 3: Price ID Mismatch
**Risk**: Wrong price ID used, customers charged incorrect amount

**Mitigation**:
- Verify price IDs in Stripe Dashboard before deployment
- Create integration test to validate price IDs
- Use descriptive price nicknames in Stripe ("Starter Monthly", "Pro Annual")
- Log price ID used in checkout session for debugging

---

## Next Steps

After completing SF-002:
1. Proceed to **SF-003: SubscriptionService Foundation**
2. Use `stripe` instance from `config/stripe.ts` in service
3. Use `getStripePriceId()` helper to retrieve price IDs
4. Test Stripe Checkout session creation

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
