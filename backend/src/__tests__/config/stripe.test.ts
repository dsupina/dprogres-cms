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
