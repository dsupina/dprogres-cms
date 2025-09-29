"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDomain = validateDomain;
exports.resolveDomain = resolveDomain;
exports.clearDomainCache = clearDomainCache;
const database_1 = require("../utils/database");
let domainCache = {
    domains: new Set(),
    lastUpdated: 0
};
const CACHE_TTL = 5 * 60 * 1000;
async function refreshDomainCache() {
    try {
        const result = await database_1.pool.query('SELECT hostname FROM domains WHERE is_active = true', []);
        domainCache.domains = new Set(result.rows.map((row) => row.hostname.toLowerCase()));
        domainCache.lastUpdated = Date.now();
        domainCache.domains.add('localhost');
        if (process.env.NODE_ENV === 'development') {
            domainCache.domains.add('localhost:5173');
            domainCache.domains.add('localhost:3000');
            domainCache.domains.add('localhost:5000');
        }
    }
    catch (error) {
        console.error('Failed to refresh domain cache:', error);
    }
}
async function validateDomain(req, res, next) {
    try {
        const now = Date.now();
        if (now - domainCache.lastUpdated > CACHE_TTL || domainCache.domains.size === 0) {
            await refreshDomainCache();
        }
        const hostHeader = req.get('host');
        if (!hostHeader) {
            res.status(400).json({ error: 'Missing Host header' });
            return;
        }
        const hostname = hostHeader.split(':')[0].toLowerCase();
        if (!domainCache.domains.has(hostname) && !domainCache.domains.has(hostHeader.toLowerCase())) {
            console.warn(`Rejected request from unauthorized host: ${hostHeader}`);
            res.status(400).json({ error: 'Invalid host' });
            return;
        }
        req.validatedDomain = hostname;
        next();
    }
    catch (error) {
        console.error('Domain validation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function resolveDomain(req, res, next) {
    try {
        const hostname = req.validatedDomain || 'localhost';
        const result = await database_1.pool.query('SELECT id, hostname, is_default, settings FROM domains WHERE hostname = $1 AND is_active = true', [hostname]);
        if (result.rows.length > 0) {
            req.domain = result.rows[0];
        }
        else {
            const defaultResult = await database_1.pool.query('SELECT id, hostname, is_default, settings FROM domains WHERE is_default = true AND is_active = true', []);
            if (defaultResult.rows.length > 0) {
                req.domain = defaultResult.rows[0];
            }
            else {
                req.domain = null;
            }
        }
        next();
    }
    catch (error) {
        console.error('Domain resolution error:', error);
        req.domain = null;
        next();
    }
}
function clearDomainCache() {
    domainCache = {
        domains: new Set(),
        lastUpdated: 0
    };
}
//# sourceMappingURL=domainValidation.js.map