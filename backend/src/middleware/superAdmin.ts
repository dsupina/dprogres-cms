import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to require super admin access for platform-level operations.
 * Super admin is orthogonal to organization roles - a user can be both
 * a super admin AND an organization owner/admin.
 *
 * Must be used after authenticateToken middleware.
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};
