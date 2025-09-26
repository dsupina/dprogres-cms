import { Request, Response, NextFunction } from 'express';
import { pool } from '../utils/database';
import { domainCache } from '../services/domainService';

export interface SiteContext {
  domainId: number;
  siteId: number | null;
  siteName: string;
  basePath: string;
}

// Extend Express Request to include site context
declare global {
  namespace Express {
    interface Request {
      siteContext?: SiteContext;
    }
  }
}

// Simple in-memory cache for site resolution (5 minute TTL)
const siteCache = new Map<string, { site: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves the current site based on the request hostname and path
 * Attaches site context to the request object for downstream use
 */
export async function siteResolver(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip resolution for certain API routes
    if (
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/api/health') ||
      req.path.startsWith('/api/admin/domains') ||
      req.path.startsWith('/api/admin/sites')
    ) {
      return next();
    }

    // Extract hostname from request
    const hostHeader = req.get('host');
    if (!hostHeader) {
      return next();
    }

    const hostname = hostHeader.split(':')[0].toLowerCase();

    // Extract base path from request path
    const pathSegments = req.path.split('/').filter(Boolean);
    const possibleBasePath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';

    // Check cache first
    const cacheKey = `${hostname}:${possibleBasePath}`;
    const cached = siteCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      req.siteContext = cached.site;
      return next();
    }

    // Resolve domain from cache (using existing domain service)
    const domain = await domainCache.get(hostname);

    if (!domain) {
      // Unknown domain - could redirect to default or return 404
      // For now, we'll continue without site context
      return next();
    }

    // Try to find site with specific base path
    let siteResult = await pool.query(
      `SELECT id, name, base_path, is_default
       FROM sites
       WHERE domain_id = $1 AND base_path = $2 AND is_active = true
       LIMIT 1`,
      [domain.id, possibleBasePath]
    );

    // If no site found with specific path, try root path
    if (siteResult.rows.length === 0 && possibleBasePath !== '/') {
      siteResult = await pool.query(
        `SELECT id, name, base_path, is_default
         FROM sites
         WHERE domain_id = $1 AND base_path = '/' AND is_active = true
         LIMIT 1`,
        [domain.id]
      );
    }

    // If still no site found, try default site for domain
    if (siteResult.rows.length === 0) {
      siteResult = await pool.query(
        `SELECT id, name, base_path, is_default
         FROM sites
         WHERE domain_id = $1 AND is_default = true AND is_active = true
         LIMIT 1`,
        [domain.id]
      );
    }

    const site = siteResult.rows[0];

    const siteContext: SiteContext = {
      domainId: domain.id,
      siteId: site?.id || null,
      siteName: site?.name || domain.hostname,
      basePath: site?.base_path || '/'
    };

    // Cache the result
    siteCache.set(cacheKey, { site: siteContext, timestamp: Date.now() });

    // Attach to request
    req.siteContext = siteContext;

    next();
  } catch (error) {
    console.error('Error in site resolver middleware:', error);
    // Continue without site context rather than blocking the request
    next();
  }
}

/**
 * Middleware to require site context
 * Use this for routes that must have a valid site
 */
export function requireSiteContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.siteContext || !req.siteContext.siteId) {
    res.status(404).json({
      error: 'Site not found for this domain'
    });
    return;
  }
  next();
}

/**
 * Clear site cache - call this when sites are modified
 */
export function clearSiteCache(): void {
  siteCache.clear();
}

/**
 * Clear specific site from cache
 */
export function clearSiteCacheEntry(hostname: string, basePath: string): void {
  const cacheKey = `${hostname}:${basePath}`;
  siteCache.delete(cacheKey);
}