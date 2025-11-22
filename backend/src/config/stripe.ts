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
  apiVersion: '2025-11-17.clover', // Latest Stripe API version (Clover release)
  typescript: true,
  // Timeout for Stripe API calls (milliseconds)
  // Important for webhook handlers: Stripe expects webhook responses within 5 seconds
  // This 10-second timeout allows for network latency while preventing indefinite hangs
  // Individual API calls typically complete in <500ms, but network issues can cause delays
  timeout: 10000, // 10 seconds
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
