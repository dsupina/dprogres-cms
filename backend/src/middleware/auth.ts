import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { checkOrganizationStatus } from './organizationStatus';
import { query } from '../utils/database';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Cache for super admin status verification
 * Key: userId, Value: { isSuperAdmin, timestamp }
 */
interface SuperAdminCacheEntry {
  isSuperAdmin: boolean;
  timestamp: number;
}

class SuperAdminCache {
  private cache: Map<number, SuperAdminCacheEntry>;
  private readonly TTL_MS = 60 * 1000; // 60 seconds - short for security-critical checks

  constructor() {
    this.cache = new Map();
  }

  get(userId: number): boolean | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(userId);
      return null;
    }

    return entry.isSuperAdmin;
  }

  set(userId: number, isSuperAdmin: boolean): void {
    this.cache.set(userId, { isSuperAdmin, timestamp: Date.now() });
  }

  invalidate(userId: number): void {
    this.cache.delete(userId);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const superAdminCache = new SuperAdminCache();

/**
 * Verify super admin status against database
 * Used to prevent demoted super admins from retaining elevated access
 */
async function verifySuperAdminStatus(userId: number): Promise<boolean> {
  // Check cache first
  const cached = superAdminCache.get(userId);
  if (cached !== null) {
    return cached;
  }

  try {
    const result = await query(
      'SELECT is_super_admin FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    const isSuperAdmin = result.rows.length > 0 && result.rows[0].is_super_admin === true;
    superAdminCache.set(userId, isSuperAdmin);
    return isSuperAdmin;
  } catch (error) {
    console.error('[Auth] Error verifying super admin status:', error);
    // Fail closed - if we can't verify, don't grant super admin access
    return false;
  }
}

/**
 * Routes that suspended organizations can still access.
 * These are essential for account recovery (billing, auth).
 */
const SUSPENDED_ORG_ALLOWED_ROUTES = [
  '/api/billing',      // Billing routes for payment recovery
  '/api/auth',         // Auth routes (logout, token refresh)
  '/api/organizations', // Org settings (to see status, update billing info)
];

/**
 * Check if the request path is allowed for suspended organizations.
 */
function isAllowedForSuspendedOrg(path: string): boolean {
  return SUSPENDED_ORG_ALLOWED_ROUTES.some(route => path.startsWith(route));
}

/**
 * Authenticate token and check organization status.
 * This middleware:
 * 1. Validates the JWT token
 * 2. Populates req.user
 * 3. Revalidates super admin status against DB (prevents demoted users from retaining access)
 * 4. Checks if user's organization is suspended/pending_deletion
 *
 * Super admins bypass org status checks.
 * Suspended orgs can still access billing/auth routes to resolve their suspension.
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);

    // Revalidate super admin status against database
    // This prevents demoted super admins from retaining elevated access
    if (decoded.isSuperAdmin) {
      const isStillSuperAdmin = await verifySuperAdminStatus(decoded.userId);
      if (!isStillSuperAdmin) {
        // Update the decoded payload to reflect current status
        decoded.isSuperAdmin = false;
      }
    }

    req.user = decoded;

    // Check organization status for authenticated users
    // Super admins (verified against DB) bypass this check
    // Suspended orgs can still access billing/auth routes to resolve their suspension
    if (!decoded.isSuperAdmin && decoded.organizationId) {
      const statusCheck = await checkOrganizationStatus(decoded.organizationId);
      if (!statusCheck.allowed) {
        // Allow certain routes for suspended orgs (billing, auth, org settings)
        if (!isAllowedForSuspendedOrg(req.path)) {
          return res.status(403).json({
            error: statusCheck.error,
            code: statusCheck.code,
          });
        }
      }
    }

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireEditor = requireRole(['admin', 'editor']);
export const requireAuthor = requireRole(['admin', 'editor', 'author']); 