/**
 * PreviewService - Core service for managing secure preview tokens
 * Ticket: CV-006
 *
 * This service handles preview token generation, validation, and management
 * with enterprise-grade security, multi-domain support, and analytics tracking.
 */

import { Pool, PoolClient } from 'pg';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import DOMPurify from 'isomorphic-dompurify';
import { VersionService } from './VersionService';
import {
  ServiceResponse,
  ContentVersion,
  ContentType
} from '../types/versioning';

// Preview-specific types
export interface PreviewToken {
  id: number;
  token: string;
  token_hash: string;
  token_type: 'preview' | 'share' | 'embed';
  site_id: number;
  version_id: number;
  domain_id?: number;
  locale?: string;
  expires_at: Date;
  max_uses?: number;
  use_count: number;
  password_protected: boolean;
  allowed_ips?: string[];
  allowed_emails?: string[];
  settings: Record<string, any>;
  created_by: number;
  created_at: Date;
  last_used_at?: Date;
  revoked_at?: Date;
}

export interface TokenGenerationRequest {
  versionId: number;
  siteId: number;
  domainId?: number;
  locale?: string;
  expiresInHours?: number;
  maxUses?: number;
  password?: string;
  allowedIps?: string[];
  allowedEmails?: string[];
  tokenType?: 'preview' | 'share' | 'embed';
  settings?: {
    devicePreview?: 'desktop' | 'tablet' | 'mobile';
    trackAnalytics?: boolean;
    enableFeedback?: boolean;
    customBranding?: Record<string, any>;
  };
}

export interface TokenValidationResult {
  valid: boolean;
  token?: PreviewToken;
  version?: ContentVersion;
  error?: string;
  requiresPassword?: boolean;
  expired?: boolean;
  exceededUses?: boolean;
}

export interface PreviewAnalyticsEvent {
  tokenId: number;
  siteId: number;
  versionId: number;
  ipAddress: string;
  userAgent?: string;
  referer?: string;
  countryCode?: string;
  deviceType?: string;
  sessionId?: string;
  responseTimeMs?: number;
}

interface TokenCache {
  token: PreviewToken;
  version: ContentVersion;
  cachedAt: Date;
}

export class PreviewService extends EventEmitter {
  private pool: Pool;
  private versionService: VersionService;
  private tokenCache: Map<string, TokenCache> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly DEFAULT_EXPIRY_HOURS = 24;
  private readonly MAX_TOKENS_PER_USER = 100;
  private readonly JWT_SECRET: string;
  private readonly AES_KEY: string;

  constructor(pool: Pool, versionService: VersionService) {
    super();
    this.pool = pool;
    this.versionService = versionService;

    // Load secrets from environment
    this.JWT_SECRET = process.env.JWT_PREVIEW_SECRET || 'preview-secret-change-in-production';
    this.AES_KEY = process.env.PREVIEW_AES_KEY || crypto.randomBytes(32).toString('hex');

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate a secure preview token with all security features
   */
  async generatePreviewToken(
    request: TokenGenerationRequest,
    userId: number
  ): Promise<ServiceResponse<PreviewToken>> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Validate version access
      const versionResult = await this.versionService.getVersion(request.versionId);
      if (!versionResult.success || !versionResult.data) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Version not found or access denied'
        };
      }

      const version = versionResult.data;

      // 2. Validate site access (BLOCKER security requirement)
      if (version.site_id !== request.siteId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Site mismatch - potential security violation'
        };
      }

      // 3. Check token limit per user
      const countResult = await client.query(
        `SELECT COUNT(*) as count
         FROM preview_tokens
         WHERE created_by = $1
           AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [userId]
      );

      if (parseInt(countResult.rows[0].count) >= this.MAX_TOKENS_PER_USER) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Token limit exceeded. Maximum ${this.MAX_TOKENS_PER_USER} active tokens per user.`
        };
      }

      // 4. Generate secure token
      const tokenId = nanoid(32);
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

      // Sign with RSA256 (or HS256 for now)
      const jwtToken = jwt.sign(tokenPayload, this.JWT_SECRET, {
        algorithm: 'HS256'
      });

      // Encrypt sensitive data with AES
      const encryptedToken = this.encryptToken(jwtToken);

      // Generate hash for database lookup
      const tokenHash = crypto
        .createHash('sha256')
        .update(encryptedToken)
        .digest('hex');

      // 5. Hash password if provided
      let passwordHash: string | null = null;
      if (request.password) {
        passwordHash = await bcrypt.hash(request.password, 10);
      }

      // 6. Insert token into database
      const expiresAt = new Date(
        Date.now() + (request.expiresInHours || this.DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1000
      );

      const insertResult = await client.query(
        `INSERT INTO preview_tokens (
          token, token_hash, token_type, site_id, version_id,
          domain_id, locale, expires_at, max_uses, password_protected,
          password_hash, allowed_ips, allowed_emails, settings, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
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
        ]
      );

      const previewToken = insertResult.rows[0];

      // 7. Generate short URL for QR codes
      const shortUrl = await this.generateShortUrl(previewToken.id, request.siteId, userId, client);

      // 8. Emit event for tracking
      this.emit('token:generated', {
        tokenId: previewToken.id,
        siteId: request.siteId,
        versionId: request.versionId,
        userId,
        tokenType: request.tokenType || 'preview'
      });

      // 9. Audit log for security
      await this.auditTokenOperation('generate', previewToken.id, userId, client);

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          ...previewToken,
          short_url: shortUrl
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error generating preview token:', error);
      return {
        success: false,
        error: 'Failed to generate preview token'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate a preview token with all security checks
   */
  async validatePreviewToken(
    token: string,
    options: {
      ipAddress?: string;
      password?: string;
      userEmail?: string;
    } = {}
  ): Promise<ServiceResponse<TokenValidationResult>> {
    try {
      // 1. Check cache first for performance
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

      // 2. Hash token for database lookup
      const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      // 3. Use optimized validation function
      const validationResult = await this.pool.query(
        'SELECT * FROM validate_preview_token($1)',
        [tokenHash]
      );

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

      // 4. Fetch full token details
      const tokenResult = await this.pool.query(
        `SELECT * FROM preview_tokens WHERE token_hash = $1`,
        [tokenHash]
      );

      const previewToken = tokenResult.rows[0];

      // 5. Check password if required
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
        const passwordValid = await bcrypt.compare(
          options.password,
          previewToken.password_hash
        );

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

      // 6. Check IP restrictions
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

      // 7. Check email restrictions
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

      // 8. Increment use count
      await this.pool.query(
        `UPDATE preview_tokens
         SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [previewToken.id]
      );

      // 9. Fetch version data
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

      // 10. Cache the result
      this.tokenCache.set(cacheKey, {
        token: previewToken,
        version: versionResult.data,
        cachedAt: new Date()
      });

      // 11. Track analytics asynchronously
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

    } catch (error) {
      console.error('Error validating preview token:', error);
      return {
        success: false,
        error: 'Failed to validate preview token'
      };
    }
  }

  /**
   * Revoke a preview token immediately
   */
  async revokePreviewToken(
    tokenId: number,
    userId: number,
    reason?: string
  ): Promise<ServiceResponse<void>> {
    try {
      const result = await this.pool.query(
        `UPDATE preview_tokens
         SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
         WHERE id = $1 AND (created_by = $2 OR EXISTS (
           SELECT 1 FROM users WHERE id = $2 AND role = 'admin'
         ))
         RETURNING id`,
        [tokenId, userId]
      );

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Token not found or unauthorized'
        };
      }

      // Clear from cache
      this.clearCacheForToken(tokenId);

      // Audit log
      await this.auditTokenOperation('revoke', tokenId, userId);

      this.emit('token:revoked', {
        tokenId,
        userId,
        reason
      });

      return { success: true };

    } catch (error) {
      console.error('Error revoking preview token:', error);
      return {
        success: false,
        error: 'Failed to revoke preview token'
      };
    }
  }

  /**
   * Get preview analytics for a token or site
   */
  async getPreviewAnalytics(
    filters: {
      tokenId?: number;
      siteId?: number;
      startDate?: Date;
      endDate?: Date;
    },
    userId: number
  ): Promise<ServiceResponse<any[]>> {
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

      const params: any[] = [];
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

    } catch (error) {
      console.error('Error fetching preview analytics:', error);
      return {
        success: false,
        error: 'Failed to fetch analytics'
      };
    }
  }

  // Private helper methods

  private encryptToken(token: string): string {
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.AES_KEY, 'hex'),
      crypto.randomBytes(16)
    );

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
  }

  private async generateShortUrl(
    tokenId: number,
    siteId: number,
    userId: number,
    client: PoolClient
  ): Promise<string> {
    const shortCode = nanoid(8);

    await client.query(
      `INSERT INTO short_urls (short_code, preview_token_id, site_id, created_by)
       VALUES ($1, $2, $3, $4)`,
      [shortCode, tokenId, siteId, userId]
    );

    return `${process.env.SHORT_URL_BASE || 'https://dprev.it'}/${shortCode}`;
  }

  private async trackAnalytics(event: PreviewAnalyticsEvent): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO preview_analytics (
          token_id, site_id, version_id, ip_address,
          user_agent, referer, response_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.tokenId,
          event.siteId,
          event.versionId,
          event.ipAddress,
          event.userAgent || null,
          event.referer || null,
          event.responseTimeMs || null
        ]
      );
    } catch (error) {
      console.error('Error tracking analytics:', error);
      // Don't fail the main operation for analytics errors
    }
  }

  private async auditTokenOperation(
    operation: string,
    tokenId: number,
    userId: number,
    client?: PoolClient
  ): Promise<void> {
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
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }

  private getCacheKey(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private isCacheValid(cached: TokenCache): boolean {
    const age = Date.now() - cached.cachedAt.getTime();
    return age < this.CACHE_TTL_MS;
  }

  private clearCacheForToken(tokenId: number): void {
    for (const [key, value] of this.tokenCache.entries()) {
      if (value.token.id === tokenId) {
        this.tokenCache.delete(key);
      }
    }
  }

  private startCleanupInterval(): void {
    setInterval(async () => {
      try {
        const result = await this.pool.query('SELECT * FROM cleanup_expired_preview_tokens()');
        console.log('Preview token cleanup:', result.rows[0]);
      } catch (error) {
        console.error('Error in cleanup job:', error);
      }
    }, 24 * 60 * 60 * 1000); // Run daily
  }
}