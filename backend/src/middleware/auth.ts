import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { checkOrganizationStatus } from './organizationStatus';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Authenticate token and check organization status.
 * This middleware:
 * 1. Validates the JWT token
 * 2. Populates req.user
 * 3. Checks if user's organization is suspended/pending_deletion
 *
 * Super admins bypass org status checks.
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;

    // Check organization status for authenticated users
    // Super admins bypass this check
    if (!decoded.isSuperAdmin && decoded.organizationId) {
      const statusCheck = await checkOrganizationStatus(decoded.organizationId);
      if (!statusCheck.allowed) {
        return res.status(403).json({
          error: statusCheck.error,
          code: statusCheck.code,
        });
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