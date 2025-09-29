"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreviewService = void 0;
const jwt = __importStar(require("jsonwebtoken"));
const bcrypt = __importStar(require("bcryptjs"));
const crypto = __importStar(require("crypto"));
const nanoid_1 = require("nanoid");
const events_1 = require("events");
class PreviewService extends events_1.EventEmitter {
    constructor(pool, versionService) {
        super();
        this.tokenCache = new Map();
        this.CACHE_TTL_MS = 5 * 60 * 1000;
        this.DEFAULT_EXPIRY_HOURS = 24;
        this.MAX_TOKENS_PER_USER = 100;
        this.pool = pool;
        this.versionService = versionService;
        this.JWT_SECRET = process.env.JWT_PREVIEW_SECRET || 'preview-secret-change-in-production';
        this.AES_KEY = process.env.PREVIEW_AES_KEY || crypto.randomBytes(32).toString('hex');
        this.startCleanupInterval();
    }
    async generatePreviewToken(request, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const versionResult = await this.versionService.getVersion(request.versionId);
            if (!versionResult.success || !versionResult.data) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: 'Version not found or access denied'
                };
            }
            const version = versionResult.data;
            if (version.site_id !== request.siteId) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: 'Site mismatch - potential security violation'
                };
            }
            const countResult = await client.query(`SELECT COUNT(*) as count
         FROM preview_tokens
         WHERE created_by = $1
           AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP`, [userId]);
            if (parseInt(countResult.rows[0].count) >= this.MAX_TOKENS_PER_USER) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: `Token limit exceeded. Maximum ${this.MAX_TOKENS_PER_USER} active tokens per user.`
                };
            }
            const tokenId = (0, nanoid_1.nanoid)(32);
            const tokenPayload = {
                jti: tokenId,
                sid: request.siteId,
                vid: request.versionId,
                did: request.domainId,
                locale: request.locale,
                type: request.tokenType || 'preview',
                iat: Date.now(),
                exp: Date.now() + (request.expiresInHours || this.DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1000
            };
            const jwtToken = jwt.sign(tokenPayload, this.JWT_SECRET, {
                algorithm: 'HS256'
            });
            const encryptedToken = this.encryptToken(jwtToken);
            const tokenHash = crypto
                .createHash('sha256')
                .update(encryptedToken)
                .digest('hex');
            let passwordHash = null;
            if (request.password) {
                passwordHash = await bcrypt.hash(request.password, 10);
            }
            const expiresAt = new Date(Date.now() + (request.expiresInHours || this.DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1000);
            const insertResult = await client.query(`INSERT INTO preview_tokens (
          token, token_hash, token_type, site_id, version_id,
          domain_id, locale, expires_at, max_uses, password_protected,
          password_hash, allowed_ips, allowed_emails, settings, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`, [
                encryptedToken,
                tokenHash,
                request.tokenType || 'preview',
                request.siteId,
                request.versionId,
                request.domainId || null,
                request.locale || null,
                expiresAt,
                request.maxUses || null,
                !!request.password,
                passwordHash,
                request.allowedIps || null,
                request.allowedEmails || null,
                JSON.stringify(request.settings || {}),
                userId
            ]);
            const previewToken = insertResult.rows[0];
            const shortUrl = await this.generateShortUrl(previewToken.id, request.siteId, userId, client);
            this.emit('token:generated', {
                tokenId: previewToken.id,
                siteId: request.siteId,
                versionId: request.versionId,
                userId,
                tokenType: request.tokenType || 'preview'
            });
            await this.auditTokenOperation('generate', previewToken.id, userId, client);
            await client.query('COMMIT');
            return {
                success: true,
                data: {
                    ...previewToken,
                    short_url: shortUrl
                }
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error generating preview token:', error);
            return {
                success: false,
                error: 'Failed to generate preview token'
            };
        }
        finally {
            client.release();
        }
    }
    async validatePreviewToken(token, options = {}) {
        try {
            const cacheKey = this.getCacheKey(token);
            const cached = this.tokenCache.get(cacheKey);
            if (cached && this.isCacheValid(cached)) {
                return {
                    success: true,
                    data: {
                        valid: true,
                        token: cached.token,
                        version: cached.version
                    }
                };
            }
            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');
            const validationResult = await this.pool.query('SELECT * FROM validate_preview_token($1)', [tokenHash]);
            if (validationResult.rows.length === 0 || !validationResult.rows[0].valid) {
                const row = validationResult.rows[0] || {};
                return {
                    success: true,
                    data: {
                        valid: false,
                        error: row.expired ? 'Token expired' :
                            row.exceeded_uses ? 'Usage limit exceeded' :
                                'Invalid token',
                        expired: row.expired,
                        exceededUses: row.exceeded_uses
                    }
                };
            }
            const tokenResult = await this.pool.query(`SELECT * FROM preview_tokens WHERE token_hash = $1`, [tokenHash]);
            const previewToken = tokenResult.rows[0];
            if (previewToken.password_protected && !options.password) {
                return {
                    success: true,
                    data: {
                        valid: false,
                        requiresPassword: true,
                        error: 'Password required'
                    }
                };
            }
            if (previewToken.password_protected && options.password) {
                const passwordValid = await bcrypt.compare(options.password, previewToken.password_hash);
                if (!passwordValid) {
                    return {
                        success: true,
                        data: {
                            valid: false,
                            error: 'Invalid password'
                        }
                    };
                }
            }
            if (previewToken.allowed_ips && previewToken.allowed_ips.length > 0) {
                if (!options.ipAddress || !previewToken.allowed_ips.includes(options.ipAddress)) {
                    return {
                        success: true,
                        data: {
                            valid: false,
                            error: 'IP address not allowed'
                        }
                    };
                }
            }
            if (previewToken.allowed_emails && previewToken.allowed_emails.length > 0) {
                if (!options.userEmail || !previewToken.allowed_emails.includes(options.userEmail)) {
                    return {
                        success: true,
                        data: {
                            valid: false,
                            error: 'Email not authorized'
                        }
                    };
                }
            }
            await this.pool.query(`UPDATE preview_tokens
         SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP
         WHERE id = $1`, [previewToken.id]);
            const versionResult = await this.versionService.getVersion(previewToken.version_id);
            if (!versionResult.success || !versionResult.data) {
                return {
                    success: true,
                    data: {
                        valid: false,
                        error: 'Associated version not found'
                    }
                };
            }
            this.tokenCache.set(cacheKey, {
                token: previewToken,
                version: versionResult.data,
                cachedAt: new Date()
            });
            this.trackAnalytics({
                tokenId: previewToken.id,
                siteId: previewToken.site_id,
                versionId: previewToken.version_id,
                ipAddress: options.ipAddress || 'unknown'
            });
            return {
                success: true,
                data: {
                    valid: true,
                    token: previewToken,
                    version: versionResult.data
                }
            };
        }
        catch (error) {
            console.error('Error validating preview token:', error);
            return {
                success: false,
                error: 'Failed to validate preview token'
            };
        }
    }
    async revokePreviewToken(tokenId, userId, reason) {
        try {
            const result = await this.pool.query(`UPDATE preview_tokens
         SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
         WHERE id = $1 AND (created_by = $2 OR EXISTS (
           SELECT 1 FROM users WHERE id = $2 AND role = 'admin'
         ))
         RETURNING id`, [tokenId, userId]);
            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'Token not found or unauthorized'
                };
            }
            this.clearCacheForToken(tokenId);
            await this.auditTokenOperation('revoke', tokenId, userId);
            this.emit('token:revoked', {
                tokenId,
                userId,
                reason
            });
            return { success: true };
        }
        catch (error) {
            console.error('Error revoking preview token:', error);
            return {
                success: false,
                error: 'Failed to revoke preview token'
            };
        }
    }
    async getPreviewAnalytics(filters, userId) {
        try {
            let query = `
        SELECT
          pa.*,
          pt.token_type,
          cv.content_type,
          cv.content_id
        FROM preview_analytics pa
        JOIN preview_tokens pt ON pa.token_id = pt.id
        JOIN content_versions cv ON pa.version_id = cv.id
        WHERE 1=1
      `;
            const params = [];
            let paramIndex = 1;
            if (filters.tokenId) {
                query += ` AND pa.token_id = $${paramIndex++}`;
                params.push(filters.tokenId);
            }
            if (filters.siteId) {
                query += ` AND pa.site_id = $${paramIndex++}`;
                params.push(filters.siteId);
            }
            if (filters.startDate) {
                query += ` AND pa.accessed_at >= $${paramIndex++}`;
                params.push(filters.startDate);
            }
            if (filters.endDate) {
                query += ` AND pa.accessed_at <= $${paramIndex++}`;
                params.push(filters.endDate);
            }
            query += ` ORDER BY pa.accessed_at DESC LIMIT 1000`;
            const result = await this.pool.query(query, params);
            return {
                success: true,
                data: result.rows
            };
        }
        catch (error) {
            console.error('Error fetching preview analytics:', error);
            return {
                success: false,
                error: 'Failed to fetch analytics'
            };
        }
    }
    encryptToken(token) {
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.AES_KEY, 'hex'), crypto.randomBytes(16));
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    async generateShortUrl(tokenId, siteId, userId, client) {
        const shortCode = (0, nanoid_1.nanoid)(8);
        await client.query(`INSERT INTO short_urls (short_code, preview_token_id, site_id, created_by)
       VALUES ($1, $2, $3, $4)`, [shortCode, tokenId, siteId, userId]);
        return `${process.env.SHORT_URL_BASE || 'https://dprev.it'}/${shortCode}`;
    }
    async trackAnalytics(event) {
        try {
            await this.pool.query(`INSERT INTO preview_analytics (
          token_id, site_id, version_id, ip_address,
          user_agent, referer, response_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                event.tokenId,
                event.siteId,
                event.versionId,
                event.ipAddress,
                event.userAgent || null,
                event.referer || null,
                event.responseTimeMs || null
            ]);
        }
        catch (error) {
            console.error('Error tracking analytics:', error);
        }
    }
    async auditTokenOperation(operation, tokenId, userId, client) {
        const query = `
      INSERT INTO version_audit_log (
        action, entity_type, entity_id, user_id, metadata
      ) VALUES ($1, $2, $3, $4, $5)
    `;
        const execQuery = client || this.pool;
        try {
            await execQuery.query(query, [
                `preview_token_${operation}`,
                'preview_token',
                tokenId,
                userId,
                JSON.stringify({ operation, timestamp: new Date() })
            ]);
        }
        catch (error) {
            console.error('Error logging audit:', error);
        }
    }
    getCacheKey(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    isCacheValid(cached) {
        const age = Date.now() - cached.cachedAt.getTime();
        return age < this.CACHE_TTL_MS;
    }
    clearCacheForToken(tokenId) {
        for (const [key, value] of this.tokenCache.entries()) {
            if (value.token.id === tokenId) {
                this.tokenCache.delete(key);
            }
        }
    }
    startCleanupInterval() {
        setInterval(async () => {
            try {
                const result = await this.pool.query('SELECT * FROM cleanup_expired_preview_tokens()');
                console.log('Preview token cleanup:', result.rows[0]);
            }
            catch (error) {
                console.error('Error in cleanup job:', error);
            }
        }, 24 * 60 * 60 * 1000);
    }
}
exports.PreviewService = PreviewService;
//# sourceMappingURL=PreviewService.js.map