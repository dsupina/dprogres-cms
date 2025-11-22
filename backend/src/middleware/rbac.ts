import { Request, Response, NextFunction } from 'express';
import { Permission, hasPermission, OrganizationRole } from '../config/permissions';
import { organizationService } from '../services/OrganizationService';

/**
 * RBAC Middleware for Organization-Based Permission Enforcement
 *
 * Provides role-based access control for organization-scoped resources.
 * Integrates with MemberService to fetch user roles and validate permissions.
 *
 * Features:
 * - In-memory permission caching (5-minute TTL)
 * - Organization context validation
 * - Performance target: <20ms per check
 * - Migration path to Redis documented
 *
 * Ticket: SF-007
 */

// Extend Express Request to include organizationId
declare global {
  namespace Express {
    interface Request {
      organizationId?: number;
    }
  }
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  role: OrganizationRole;
  timestamp: number;
}

/**
 * Permission cache with TTL
 *
 * TODO: Migrate to Redis for distributed caching when scaling beyond single instance
 * Redis key format: `rbac:${organizationId}:${userId}` => role (TTL: 300s)
 *
 * Current implementation: In-memory Map with manual TTL cleanup
 * Limitations:
 * - Single instance only (not shared across processes)
 * - Memory grows with unique org-user combinations
 * - No LRU eviction policy
 */
class PermissionCache {
  private cache: Map<string, CacheEntry>;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.cache = new Map();
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(organizationId: number, userId: number): string {
    return `${organizationId}:${userId}`;
  }

  /**
   * Get cached role if not expired
   */
  get(organizationId: number, userId: number): OrganizationRole | null {
    const key = this.getCacheKey(organizationId, userId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.role;
  }

  /**
   * Set cached role
   */
  set(organizationId: number, userId: number, role: OrganizationRole): void {
    const key = this.getCacheKey(organizationId, userId);
    this.cache.set(key, {
      role,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache for specific user-org combination
   */
  invalidate(organizationId: number, userId: number): void {
    const key = this.getCacheKey(organizationId, userId);
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries for an organization
   * (useful when roles change in bulk)
   */
  invalidateOrganization(organizationId: number): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${organizationId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache stats (for monitoring)
   */
  getStats(): { size: number; ttl: number } {
    return {
      size: this.cache.size,
      ttl: this.TTL_MS,
    };
  }

  /**
   * Clear all cache (for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton cache instance
export const permissionCache = new PermissionCache();

/**
 * Get user's role in organization (with caching)
 *
 * @param organizationId - Organization ID
 * @param userId - User ID
 * @returns Organization role or null if not a member
 */
async function getUserRole(
  organizationId: number,
  userId: number
): Promise<OrganizationRole | null> {
  // Check cache first
  const cachedRole = permissionCache.get(organizationId, userId);
  if (cachedRole) {
    return cachedRole;
  }

  // Fetch from database via OrganizationService
  const roleResult = await organizationService.getMemberRole(organizationId, userId);

  if (!roleResult.success || !roleResult.data) {
    return null;
  }

  const role = roleResult.data as OrganizationRole;

  // Cache the result
  permissionCache.set(organizationId, userId, role);

  return role;
}

/**
 * Check if user has permission in organization
 *
 * @param organizationId - Organization ID
 * @param userId - User ID
 * @param permission - Required permission
 * @returns true if user has permission, false otherwise
 */
export async function checkPermission(
  organizationId: number,
  userId: number,
  permission: Permission
): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Get user's role (cached or from DB)
    const role = await getUserRole(organizationId, userId);

    if (!role) {
      return false;
    }

    // Check if role has permission
    const hasAccess = hasPermission(role, permission);

    // Log performance (target: <20ms)
    const duration = Date.now() - startTime;
    if (duration > 20) {
      console.warn(
        `[RBAC] Slow permission check: ${duration}ms (orgId: ${organizationId}, userId: ${userId}, permission: ${permission})`
      );
    }

    return hasAccess;
  } catch (error) {
    console.error('[RBAC] Error checking permission:', error);
    return false;
  }
}

/**
 * Express middleware to require specific permission
 *
 * Usage:
 * ```typescript
 * router.post('/sites',
 *   authenticateToken,
 *   requirePermission(Permission.CREATE_SITES),
 *   createSiteHandler
 * );
 * ```
 *
 * @param permission - Required permission
 * @returns Express middleware function
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get organization ID from request
      // Priority: req.organizationId > req.params.organizationId > req.body.organizationId
      const organizationId =
        req.organizationId ||
        parseInt(req.params.organizationId) ||
        parseInt(req.body.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      // Check permission
      const hasAccess = await checkPermission(organizationId, req.user.userId, permission);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Permission denied',
          required: permission,
        });
      }

      // Attach organizationId to request for downstream handlers
      req.organizationId = organizationId;

      next();
    } catch (error) {
      console.error('[RBAC] Middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Middleware to require ANY of multiple permissions (OR logic)
 *
 * Usage:
 * ```typescript
 * router.get('/content',
 *   authenticateToken,
 *   requireAnyPermission([Permission.EDIT_POSTS, Permission.VIEW_POSTS]),
 *   getContentHandler
 * );
 * ```
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const organizationId =
        req.organizationId ||
        parseInt(req.params.organizationId) ||
        parseInt(req.body.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      // Check if user has ANY of the permissions
      const hasAnyAccess = await Promise.all(
        permissions.map((p) => checkPermission(organizationId, req.user!.userId, p))
      ).then((results) => results.some((result) => result === true));

      if (!hasAnyAccess) {
        return res.status(403).json({
          error: 'Permission denied',
          required_any: permissions,
        });
      }

      req.organizationId = organizationId;
      next();
    } catch (error) {
      console.error('[RBAC] Middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Middleware to require ALL of multiple permissions (AND logic)
 *
 * Usage:
 * ```typescript
 * router.delete('/organization',
 *   authenticateToken,
 *   requireAllPermissions([Permission.MANAGE_ORGANIZATION, Permission.MANAGE_BILLING]),
 *   deleteOrgHandler
 * );
 * ```
 */
export function requireAllPermissions(permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const organizationId =
        req.organizationId ||
        parseInt(req.params.organizationId) ||
        parseInt(req.body.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      // Check if user has ALL of the permissions
      const hasAllAccess = await Promise.all(
        permissions.map((p) => checkPermission(organizationId, req.user!.userId, p))
      ).then((results) => results.every((result) => result === true));

      if (!hasAllAccess) {
        return res.status(403).json({
          error: 'Permission denied',
          required_all: permissions,
        });
      }

      req.organizationId = organizationId;
      next();
    } catch (error) {
      console.error('[RBAC] Middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
