/**
 * Organization Status Enforcement Middleware
 *
 * Blocks access for users from suspended or pending_deletion organizations.
 * Super admins bypass this check to manage suspended organizations.
 *
 * This middleware should be applied after authenticateToken to ensure
 * req.user is populated.
 *
 * Security: Prevents suspended/deleted org users from accessing APIs
 * Performance: In-memory cache with 60-second TTL to minimize DB queries
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../utils/database';
import { OrganizationStatus } from '../types';

/**
 * Cache for organization status checks
 * Key: organizationId, Value: { status, timestamp }
 */
interface StatusCacheEntry {
  status: OrganizationStatus;
  timestamp: number;
}

class OrganizationStatusCache {
  private cache: Map<number, StatusCacheEntry>;
  private readonly TTL_MS = 60 * 1000; // 60 seconds - shorter TTL for security-critical checks
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.cache = new Map();
    // Cleanup expired entries every 30 seconds
    this.cleanupTimer = setInterval(() => this.cleanup(), 30 * 1000);
    this.cleanupTimer.unref(); // Don't prevent process exit
  }

  get(organizationId: number): OrganizationStatus | null {
    const entry = this.cache.get(organizationId);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(organizationId);
      return null;
    }

    return entry.status;
  }

  set(organizationId: number, status: OrganizationStatus): void {
    this.cache.set(organizationId, {
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache for an organization (call when status changes)
   */
  invalidate(organizationId: number): void {
    this.cache.delete(organizationId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries (for testing)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Stop cleanup timer and clear cache
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }
}

// Singleton cache instance
export const organizationStatusCache = new OrganizationStatusCache();

/**
 * Get organization status from cache or database
 */
async function getOrganizationStatus(organizationId: number): Promise<OrganizationStatus | null> {
  // Check cache first
  const cachedStatus = organizationStatusCache.get(organizationId);
  if (cachedStatus) {
    return cachedStatus;
  }

  // Query database
  try {
    const result = await query(
      'SELECT status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
      [organizationId]
    );

    if (result.rows.length === 0) {
      return null; // Organization not found or deleted
    }

    const status = result.rows[0].status as OrganizationStatus;
    organizationStatusCache.set(organizationId, status);
    return status;
  } catch (error) {
    console.error('[OrgStatus] Error fetching organization status:', error);
    return null;
  }
}

/**
 * Middleware to enforce organization status
 *
 * Blocks access if organization is 'suspended' or 'pending_deletion'.
 * Super admins bypass this check.
 *
 * Usage:
 * ```typescript
 * router.use(authenticateToken, enforceOrganizationStatus);
 * ```
 *
 * Or for specific routes:
 * ```typescript
 * router.get('/resource', authenticateToken, enforceOrganizationStatus, handler);
 * ```
 */
export const enforceOrganizationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Must be authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Super admins bypass organization status checks
    // They need access to manage suspended organizations
    if (req.user.isSuperAdmin) {
      return next();
    }

    // Get organization ID from JWT or request
    const organizationId =
      req.user.organizationId ||
      (req as any).organizationId ||
      parseInt(req.params.organizationId) ||
      parseInt(req.body?.organizationId);

    // If no organization context, allow (public endpoints, etc.)
    if (!organizationId || isNaN(organizationId)) {
      return next();
    }

    // Check organization status
    const status = await getOrganizationStatus(organizationId);

    if (!status) {
      // Organization not found or deleted
      return res.status(403).json({
        error: 'Organization not found or has been deleted',
        code: 'ORG_NOT_FOUND',
      });
    }

    if (status === 'suspended') {
      return res.status(403).json({
        error: 'Organization is suspended. Please contact support.',
        code: 'ORG_SUSPENDED',
      });
    }

    if (status === 'pending_deletion') {
      return res.status(403).json({
        error: 'Organization is pending deletion and access is restricted.',
        code: 'ORG_PENDING_DELETION',
      });
    }

    // Organization is active, proceed
    next();
  } catch (error) {
    console.error('[OrgStatus] Middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware factory for custom status handling
 *
 * Allows specific statuses to pass through (e.g., allow 'suspended' for billing pages)
 *
 * Usage:
 * ```typescript
 * // Allow suspended orgs to access billing (to reactivate)
 * router.get('/billing', authenticateToken, enforceOrganizationStatusExcept(['suspended']), handler);
 * ```
 */
export function enforceOrganizationStatusExcept(allowedStatuses: OrganizationStatus[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin) {
        return next();
      }

      const organizationId =
        req.user.organizationId ||
        (req as any).organizationId ||
        parseInt(req.params.organizationId) ||
        parseInt(req.body?.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        return next();
      }

      const status = await getOrganizationStatus(organizationId);

      if (!status) {
        return res.status(403).json({
          error: 'Organization not found or has been deleted',
          code: 'ORG_NOT_FOUND',
        });
      }

      // Allow if status is in the allowed list
      if (status === 'active' || allowedStatuses.includes(status)) {
        return next();
      }

      if (status === 'suspended') {
        return res.status(403).json({
          error: 'Organization is suspended. Please contact support.',
          code: 'ORG_SUSPENDED',
        });
      }

      if (status === 'pending_deletion') {
        return res.status(403).json({
          error: 'Organization is pending deletion and access is restricted.',
          code: 'ORG_PENDING_DELETION',
        });
      }

      next();
    } catch (error) {
      console.error('[OrgStatus] Middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
