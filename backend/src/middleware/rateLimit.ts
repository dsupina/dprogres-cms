/**
 * Rate limiting middleware to prevent abuse and DDoS attacks
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Max requests per window
  message?: string; // Error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  keyGenerator?: (req: Request) => string; // Custom key generator
  handler?: (req: Request, res: Response) => void; // Custom handler
}

interface RateLimitStore {
  requests: number;
  resetTime: number;
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitStore>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Default key generator - uses user ID or IP address
 */
const defaultKeyGenerator = (req: Request): string => {
  // Try to use authenticated user ID first
  if ((req as any).user?.id) {
    return `user:${(req as any).user.id}`;
  }

  // Fall back to IP address
  const ip = req.ip ||
             req.headers['x-forwarded-for'] ||
             req.connection.remoteAddress ||
             'unknown';

  return `ip:${ip}`;
};

/**
 * Create rate limiting middleware
 * @param options - Rate limiting options
 * @returns Express middleware
 */
export const createRateLimiter = (options: RateLimitOptions = {}) => {
  const config = {
    windowMs: options.windowMs || 60000, // 1 minute default
    maxRequests: options.maxRequests || 60, // 60 requests per minute default
    message: options.message || 'Too many requests, please try again later.',
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    keyGenerator: options.keyGenerator || defaultKeyGenerator,
    handler: options.handler
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator(req);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create rate limit record
    let record = rateLimitStore.get(key);

    if (!record || record.resetTime < now) {
      // Create new record
      record = {
        requests: 0,
        resetTime: now + config.windowMs
      };
      rateLimitStore.set(key, record);
    }

    // Increment request count
    record.requests++;

    // Calculate remaining requests
    const remaining = Math.max(0, config.maxRequests - record.requests);
    const resetTime = new Date(record.resetTime).toISOString();

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetTime);

    // Check if limit exceeded
    if (record.requests > config.maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000).toString());

      if (config.handler) {
        return config.handler(req, res);
      }

      return res.status(429).json({
        error: config.message,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    // Track response to optionally skip counting
    if (config.skipSuccessfulRequests || config.skipFailedRequests) {
      const originalSend = res.send;
      res.send = function(data: any) {
        const statusCode = res.statusCode;

        // Decrement count based on response status
        if ((config.skipSuccessfulRequests && statusCode < 400) ||
            (config.skipFailedRequests && statusCode >= 400)) {
          if (record && record.requests > 0) {
            record.requests--;
          }
        }

        return originalSend.call(this, data);
      };
    }

    next();
  };
};

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Only count failed attempts
});

/**
 * General API rate limiter
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  message: 'API rate limit exceeded, please slow down.'
});

/**
 * Strict rate limiter for write operations
 */
export const writeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 write operations per minute
  message: 'Too many write operations, please try again later.'
});

/**
 * Menu operations rate limiter
 */
export const menuRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 menu updates per minute per user
  message: 'Too many menu operations, please try again later.',
  keyGenerator: (req: Request) => {
    // Rate limit per user per domain
    const userId = (req as any).user?.id || 'anonymous';
    const domainId = req.params.domainId || req.body?.domain_id || 'unknown';
    return `menu:${userId}:${domainId}`;
  }
});

/**
 * Upload rate limiter
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 uploads per minute
  message: 'Too many uploads, please try again later.'
});

/**
 * Reset rate limit for a specific key (useful for testing or admin override)
 * @param key - Rate limit key to reset
 */
export const resetRateLimit = (key: string): void => {
  rateLimitStore.delete(key);
};

/**
 * Get current rate limit status for a key
 * @param key - Rate limit key
 * @returns Current rate limit status or null
 */
export const getRateLimitStatus = (key: string): RateLimitStore | null => {
  return rateLimitStore.get(key) || null;
};

/**
 * Clear all rate limits (useful for testing)
 */
export const clearAllRateLimits = (): void => {
  rateLimitStore.clear();
};

// Middleware to disable rate limiting in development (optional)
export const conditionalRateLimiter = (
  rateLimiter: ReturnType<typeof createRateLimiter>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in development if configured
    if (process.env.NODE_ENV === 'development' &&
        process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    return rateLimiter(req, res, next);
  };
};

export default {
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  writeRateLimiter,
  menuRateLimiter,
  uploadRateLimiter,
  resetRateLimit,
  getRateLimitStatus,
  clearAllRateLimits,
  conditionalRateLimiter
};