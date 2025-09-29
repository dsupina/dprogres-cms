"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.siteResolver = siteResolver;
exports.requireSiteContext = requireSiteContext;
exports.clearSiteCache = clearSiteCache;
exports.clearSiteCacheEntry = clearSiteCacheEntry;
const database_1 = require("../utils/database");
const domainService_1 = require("../services/domainService");
const siteCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
async function siteResolver(req, res, next) {
    try {
        if (req.path.startsWith('/api/auth') ||
            req.path.startsWith('/api/health') ||
            req.path.startsWith('/api/admin/domains') ||
            req.path.startsWith('/api/admin/sites')) {
            return next();
        }
        const hostHeader = req.get('host');
        if (!hostHeader) {
            return next();
        }
        const hostname = hostHeader.split(':')[0].toLowerCase();
        const pathSegments = req.path.split('/').filter(Boolean);
        const possibleBasePath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';
        const cacheKey = `${hostname}:${possibleBasePath}`;
        const cached = siteCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            req.siteContext = cached.site;
            return next();
        }
        const domain = await domainService_1.domainCache.get(hostname);
        if (!domain) {
            return next();
        }
        let siteResult = await database_1.pool.query(`SELECT id, name, base_path, is_default
       FROM sites
       WHERE domain_id = $1 AND base_path = $2 AND is_active = true
       LIMIT 1`, [domain.id, possibleBasePath]);
        if (siteResult.rows.length === 0 && possibleBasePath !== '/') {
            siteResult = await database_1.pool.query(`SELECT id, name, base_path, is_default
         FROM sites
         WHERE domain_id = $1 AND base_path = '/' AND is_active = true
         LIMIT 1`, [domain.id]);
        }
        if (siteResult.rows.length === 0) {
            siteResult = await database_1.pool.query(`SELECT id, name, base_path, is_default
         FROM sites
         WHERE domain_id = $1 AND is_default = true AND is_active = true
         LIMIT 1`, [domain.id]);
        }
        const site = siteResult.rows[0];
        const siteContext = {
            domainId: domain.id,
            siteId: site?.id || null,
            siteName: site?.name || domain.hostname,
            basePath: site?.base_path || '/'
        };
        siteCache.set(cacheKey, { site: siteContext, timestamp: Date.now() });
        req.siteContext = siteContext;
        next();
    }
    catch (error) {
        console.error('Error in site resolver middleware:', error);
        next();
    }
}
function requireSiteContext(req, res, next) {
    if (!req.siteContext || !req.siteContext.siteId) {
        res.status(404).json({
            error: 'Site not found for this domain'
        });
        return;
    }
    next();
}
function clearSiteCache() {
    siteCache.clear();
}
function clearSiteCacheEntry(hostname, basePath) {
    const cacheKey = `${hostname}:${basePath}`;
    siteCache.delete(cacheKey);
}
//# sourceMappingURL=siteResolver.js.map