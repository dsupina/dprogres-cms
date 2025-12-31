import { Request, Response, NextFunction } from 'express';
import { query } from '../utils/database';

/**
 * Middleware to require super admin access for platform-level operations.
 * Super admin is orthogonal to organization roles - a user can be both
 * a super admin AND an organization owner/admin.
 *
 * SECURITY: This middleware validates super admin status against the database
 * on each request, not just the JWT claim. This ensures that demoted super admins
 * lose access immediately rather than waiting for token expiry (up to 7 days).
 *
 * Must be used after authenticateToken middleware.
 */
export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Quick check: if JWT doesn't claim super admin, reject immediately
  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  // SECURITY: Validate against database to handle demoted super admins
  // whose tokens haven't expired yet
  try {
    const result = await query(
      'SELECT is_super_admin FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_super_admin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    next();
  } catch (error) {
    console.error('Super admin validation error:', error);
    return res.status(500).json({ error: 'Failed to validate super admin access' });
  }
};
