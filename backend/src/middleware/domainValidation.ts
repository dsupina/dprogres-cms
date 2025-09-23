import { Request, Response, NextFunction } from 'express';
import { pool } from '../utils/database';

// Cache for allowed domains to avoid database hits on every request
interface DomainCache {
  domains: Set<string>;
  lastUpdated: number;
}

let domainCache: DomainCache = {
  domains: new Set(),
  lastUpdated: 0
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Refreshes the domain cache from database
 */
async function refreshDomainCache(): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT hostname FROM domains WHERE is_active = true',
      []
    );

    domainCache.domains = new Set(result.rows.map((row: any) => row.hostname.toLowerCase()));
    domainCache.lastUpdated = Date.now();

    // Always include localhost for development
    domainCache.domains.add('localhost');
    if (process.env.NODE_ENV === 'development') {
      domainCache.domains.add('localhost:5173');
      domainCache.domains.add('localhost:3000');
      domainCache.domains.add('localhost:5000');
    }
  } catch (error) {
    console.error('Failed to refresh domain cache:', error);
    // Don't clear cache on error - use stale data
  }
}

/**
 * Validates the Host header against allowed domains
 */
export async function validateDomain(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check if cache needs refresh
    const now = Date.now();
    if (now - domainCache.lastUpdated > CACHE_TTL || domainCache.domains.size === 0) {
      await refreshDomainCache();
    }

    // Extract hostname from Host header
    const hostHeader = req.get('host');
    if (!hostHeader) {
      res.status(400).json({ error: 'Missing Host header' });
      return;
    }

    // Remove port from hostname for comparison
    const hostname = hostHeader.split(':')[0].toLowerCase();

    // Check if hostname is in allowed list
    if (!domainCache.domains.has(hostname) && !domainCache.domains.has(hostHeader.toLowerCase())) {
      console.warn(`Rejected request from unauthorized host: ${hostHeader}`);
      res.status(400).json({ error: 'Invalid host' });
      return;
    }

    // Attach validated domain to request for downstream use
    (req as any).validatedDomain = hostname;

    next();
  } catch (error) {
    console.error('Domain validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware to resolve domain context for the request
 */
export async function resolveDomain(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const hostname = (req as any).validatedDomain || 'localhost';

    // Query domain details from database
    const result = await pool.query(
      'SELECT id, hostname, is_default, settings FROM domains WHERE hostname = $1 AND is_active = true',
      [hostname]
    );

    if (result.rows.length > 0) {
      (req as any).domain = result.rows[0];
    } else {
      // Fall back to default domain
      const defaultResult = await pool.query(
        'SELECT id, hostname, is_default, settings FROM domains WHERE is_default = true AND is_active = true',
        []
      );

      if (defaultResult.rows.length > 0) {
        (req as any).domain = defaultResult.rows[0];
      } else {
        // No default domain configured - use null to indicate global content
        (req as any).domain = null;
      }
    }

    next();
  } catch (error) {
    console.error('Domain resolution error:', error);
    // Continue without domain context rather than failing the request
    (req as any).domain = null;
    next();
  }
}

/**
 * Clears the domain cache (useful for testing or manual refresh)
 */
export function clearDomainCache(): void {
  domainCache = {
    domains: new Set(),
    lastUpdated: 0
  };
}