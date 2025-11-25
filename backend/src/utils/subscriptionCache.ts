/**
 * SubscriptionCache - In-memory cache for subscription tier lookups
 *
 * Caches frequently accessed vendor data to reduce database load:
 * - Subscription tiers (TTL: 5 minutes)
 * - Stripe pricing data (TTL: 1 hour)
 * - VAT/tax rates (TTL: 24 hours)
 *
 * Related: SF-010 Quota Enforcement Middleware
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface SubscriptionTier {
  planTier: 'free' | 'starter' | 'pro' | 'enterprise';
  status: string;
}

class SubscriptionCache {
  private tierCache: Map<number, CacheEntry<SubscriptionTier>>;
  private pricingCache: Map<string, CacheEntry<any>>;
  private taxRateCache: Map<string, CacheEntry<any>>;

  // Cache TTLs in milliseconds
  private readonly TIER_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly PRICING_TTL = 60 * 60 * 1000; // 1 hour
  private readonly TAX_RATE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.tierCache = new Map();
    this.pricingCache = new Map();
    this.taxRateCache = new Map();

    // Start cleanup interval (every 5 minutes)
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get subscription tier for organization
   */
  getTier(organizationId: number): SubscriptionTier | null {
    const entry = this.tierCache.get(organizationId);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.tierCache.delete(organizationId);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache subscription tier for organization
   */
  setTier(organizationId: number, tier: SubscriptionTier): void {
    this.tierCache.set(organizationId, {
      data: tier,
      expiresAt: Date.now() + this.TIER_TTL,
    });
  }

  /**
   * Get pricing data
   */
  getPricing(priceId: string): any | null {
    const entry = this.pricingCache.get(priceId);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.pricingCache.delete(priceId);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache pricing data
   */
  setPricing(priceId: string, data: any): void {
    this.pricingCache.set(priceId, {
      data,
      expiresAt: Date.now() + this.PRICING_TTL,
    });
  }

  /**
   * Get tax rate
   */
  getTaxRate(countryCode: string): any | null {
    const entry = this.taxRateCache.get(countryCode);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.taxRateCache.delete(countryCode);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache tax rate
   */
  setTaxRate(countryCode: string, data: any): void {
    this.taxRateCache.set(countryCode, {
      data,
      expiresAt: Date.now() + this.TAX_RATE_TTL,
    });
  }

  /**
   * Invalidate tier cache for organization (e.g., after subscription change)
   */
  invalidateTier(organizationId: number): void {
    this.tierCache.delete(organizationId);
  }

  /**
   * Invalidate all caches
   */
  invalidateAll(): void {
    this.tierCache.clear();
    this.pricingCache.clear();
    this.taxRateCache.clear();
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    // Cleanup tier cache
    for (const [key, entry] of this.tierCache.entries()) {
      if (now > entry.expiresAt) {
        this.tierCache.delete(key);
      }
    }

    // Cleanup pricing cache
    for (const [key, entry] of this.pricingCache.entries()) {
      if (now > entry.expiresAt) {
        this.pricingCache.delete(key);
      }
    }

    // Cleanup tax rate cache
    for (const [key, entry] of this.taxRateCache.entries()) {
      if (now > entry.expiresAt) {
        this.taxRateCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      tierCacheSize: this.tierCache.size,
      pricingCacheSize: this.pricingCache.size,
      taxRateCacheSize: this.taxRateCache.size,
    };
  }
}

// Export singleton instance
export const subscriptionCache = new SubscriptionCache();
export type { SubscriptionTier };
