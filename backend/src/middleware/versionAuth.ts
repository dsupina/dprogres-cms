import { Request, Response, NextFunction } from 'express';
import pool from '../utils/database';
import { JWTPayload } from '../utils/jwt';

// Middleware to check version ownership and permissions
export const checkVersionAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { versionId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admins and editors can access all versions
    if (userRole === 'admin' || userRole === 'editor') {
      return next();
    }

    // For other users, check version ownership
    const versionQuery = `
      SELECT created_by, version_type
      FROM content_versions
      WHERE id = $1
    `;

    const result = await pool.query(versionQuery, [versionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const version = result.rows[0];

    // Authors can only modify their own draft versions
    if (version.created_by !== userId && req.method !== 'GET') {
      return res.status(403).json({
        error: 'You do not have permission to modify this version'
      });
    }

    // For published versions, only allow GET requests for authors
    if (version.version_type === 'published' && req.method !== 'GET' && userRole === 'author') {
      return res.status(403).json({
        error: 'Authors cannot modify published versions'
      });
    }

    next();
  } catch (error) {
    console.error('Error checking version access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check if user can publish content
export const checkPublishPermission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userRole = req.user?.role;

  // Only admins and editors can publish
  if (userRole !== 'admin' && userRole !== 'editor') {
    return res.status(403).json({
      error: 'You do not have permission to publish content'
    });
  }

  next();
};

// Middleware to check content ownership for creating versions
export const checkContentAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { contentType, contentId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admins and editors can create versions for any content
    if (userRole === 'admin' || userRole === 'editor') {
      return next();
    }

    // Check content ownership for authors
    const tableName = contentType === 'post' ? 'posts' : 'pages';
    const contentQuery = `
      SELECT author_id
      FROM ${tableName}
      WHERE id = $1
    `;

    const result = await pool.query(contentQuery, [contentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `${contentType} not found` });
    }

    const content = result.rows[0];

    // Authors can only create versions for their own content
    if (content.author_id !== userId) {
      return res.status(403).json({
        error: `You do not have permission to create versions for this ${contentType}`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking content access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};