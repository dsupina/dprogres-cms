/**
 * Enhanced VersionService - Core service for managing content versions
 * Ticket: CV-003
 *
 * This service handles all version-related operations including creation,
 * retrieval, publishing, and deletion of content versions with enhanced
 * security, performance, and multi-site support.
 */

import { Pool, PoolClient } from 'pg';
import {
  ContentVersion,
  CreateVersionInput,
  VersionHistoryOptions,
  ServiceResponse,
  PaginatedResponse,
  ContentType,
  VersionDiff,
  VersionComparison,
  FieldChange,
  VersionType
} from '../types/versioning';
import {
  VersionErrorCode,
  DataClassification,
  VersioningIsolationLevel
} from '../types/versioning/enums';
import {
  VersionAction
} from '../types/versioning/core';
import { EventEmitter } from 'events';
import DOMPurify from 'isomorphic-dompurify';

// Interfaces for enhanced functionality
interface VersionEventPayload {
  action: VersionAction;
  version: ContentVersion;
  userId: number;
  siteId: number;
  metadata?: Record<string, any>;
}

interface VersionMetrics {
  total_versions: number;
  draft_count: number;
  published_count: number;
  auto_save_count: number;
  last_activity: Date | null;
  storage_size_bytes: number;
}

interface AuditLogEntry {
  action: VersionAction;
  version_id: number;
  user_id: number;
  site_id: number;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, any>;
  data_classification: DataClassification;
}

export class VersionService extends EventEmitter {
  private pool: Pool;
  private versionCache: Map<string, ContentVersion> = new Map();
  private metricsCache: Map<string, VersionMetrics> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly AUTO_SAVE_RETENTION_DAYS = 30;
  private readonly MAX_VERSIONS_PER_CONTENT = 1000;

  constructor(pool: Pool) {
    super();
    this.pool = pool;

    // Set up periodic cache cleanup
    setInterval(() => this.cleanupExpiredCache(), this.CACHE_TTL);
  }

  /**
   * Creates a new version of content with enhanced security and validation
   * @param input - Version creation input
   * @param userId - ID of the user creating the version
   * @param options - Additional options for site validation and audit context
   */
  async createVersion(
    input: CreateVersionInput,
    userId: number
  ): Promise<ServiceResponse<ContentVersion>> {
    // Enhanced security validation
    const siteValidation = await this.validateSiteAccess(input.site_id, userId);
    if (!siteValidation.success) {
      return siteValidation as ServiceResponse<ContentVersion>;
    }

    // Input sanitization
    const sanitizedInput = await this.sanitizeVersionInput(input);
    if (!sanitizedInput.success) {
      return sanitizedInput as ServiceResponse<ContentVersion>;
    }

    // Check version limits
    const versionCount = await this.getVersionCount(input.site_id, input.content_type, input.content_id);
    if (versionCount >= this.MAX_VERSIONS_PER_CONTENT) {
      return {
        success: false,
        error: `Maximum version limit (${this.MAX_VERSIONS_PER_CONTENT}) reached for this content`,
        error_code: VersionErrorCode.VALIDATION_FAILED
      };
    }

    const client = await this.pool.connect();

    try {
      // Use appropriate isolation level for version creation
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${VersioningIsolationLevel.REPEATABLE_READ}`);
      await client.query('BEGIN');

      // Get next version number (site-aware)
      const versionNumberResult = await client.query(
        'SELECT get_next_version_number($1, $2, $3) as version_number',
        [input.site_id, input.content_type, input.content_id]
      );
      const versionNumber = versionNumberResult.rows[0].version_number;

      // Determine changed fields (compare with previous version if exists)
      const changedFields = await this.detectChangedFields(
        input.site_id,
        input.content_type,
        input.content_id,
        input,
        client
      );

      // Insert new version with site context
      const insertQuery = `
        INSERT INTO content_versions (
          site_id, locale, content_type, content_id, version_number,
          title, slug, content, excerpt,
          data, meta_data,
          is_current_draft, is_current_published, version_type, change_summary,
          diff_from_previous, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb,
          $12, $13, $14, $15,
          $16::jsonb, $17
        ) RETURNING *`;

      const diffData = changedFields.length > 0 ? {
        changed_fields: changedFields,
        timestamp: new Date().toISOString()
      } : null;

      const values = [
        input.site_id,
        input.locale || 'en-US',
        input.content_type,
        input.content_id,
        versionNumber,
        input.title,
        input.slug || null,
        input.content || null,
        input.excerpt || null,
        JSON.stringify(input.data || {}),
        JSON.stringify(input.meta_data || {}),
        input.is_current_draft || false,
        input.is_current_published || false,
        input.version_type || 'draft',
        input.change_summary || null,
        diffData ? JSON.stringify(diffData) : null,
        userId
      ];

      const result = await client.query(insertQuery, values);
      const version = result.rows[0];

      // Audit logging
      await this.auditVersionOperation({
        action: VersionAction.CREATED,
        version_id: version.id,
        user_id: userId,
        site_id: input.site_id,
        ip_address: options.ip_address,
        user_agent: options.user_agent,
        details: {
          content_type: input.content_type,
          content_id: input.content_id,
          version_number: versionNumber,
          change_summary: input.change_summary
        },
        data_classification: this.classifyVersionData(sanitizedInput.data)
      }, client);

      await client.query('COMMIT');

      // Emit version created event
      this.emitVersionEvent({
        action: VersionAction.CREATED,
        version,
        userId,
        siteId: input.site_id,
        metadata: { changed_fields_count: changedFields.length }
      });

      // Clear relevant caches
      this.invalidateVersionCaches(input.site_id, input.content_type, input.content_id);

      return {
        success: true,
        data: version,
        metadata: {
          version_number: versionNumber,
          changed_fields_count: changedFields.length
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create version'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a specific version by ID
   */
  async getVersion(versionId: number): Promise<ServiceResponse<ContentVersion>> {
    try {
      const query = `
        SELECT v.*, u.name as created_by_name
        FROM content_versions v
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.id = $1`;

      const result = await this.pool.query(query, [versionId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Version not found'
        };
      }

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('Error fetching version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch version'
      };
    }
  }

  /**
   * Retrieves version history for a content item
   */
  async getVersionHistory(
    contentType: ContentType,
    contentId: number,
    options: VersionHistoryOptions = {}
  ): Promise<ServiceResponse<PaginatedResponse<ContentVersion>>> {
    try {
      const {
        limit = 50,
        offset = 0,
        include_auto_saves = false,
        include_drafts = true,
        published_only = false,
        order_by = 'version_number',
        order_direction = 'DESC'
      } = options;

      // Use site_id from options or require it
      const siteId = options.site_id;
      if (!siteId) {
        return {
          success: false,
          error: 'Site ID is required for version history'
        };
      }

      let whereConditions = ['site_id = $1', 'content_type = $2', 'content_id = $3'];
      const values: any[] = [siteId, contentType, contentId];

      // Handle version_type filter from options
      if (options.version_type) {
        values.push(options.version_type);
        whereConditions.push(`version_type = $${values.length}`);
      } else if (!include_auto_saves) {
        whereConditions.push("version_type != 'auto_save'");
      }

      if (published_only && !options.version_type) {
        whereConditions.push("version_type = 'published'");
      } else if (!include_drafts && !options.version_type) {
        whereConditions.push("version_type = 'published'");
      }

      const whereClause = whereConditions.join(' AND ');

      // Count total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM content_versions
        WHERE ${whereClause}`;

      const countResult = await this.pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total);

      // Fetch versions
      const query = `
        SELECT v.*, u.name as created_by_name
        FROM content_versions v
        LEFT JOIN users u ON v.created_by = u.id
        WHERE ${whereClause}
        ORDER BY ${order_by} ${order_direction}
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

      values.push(limit, offset);
      const result = await this.pool.query(query, values);

      return {
        success: true,
        data: {
          items: result.rows,
          total,
          page: Math.floor(offset / limit) + 1,
          limit,
          has_more: offset + limit < total
        }
      };
    } catch (error) {
      console.error('Error fetching version history:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch version history'
      };
    }
  }

  /**
   * Publishes a version, making it the current live version with enhanced security
   */
  async publishVersion(
    versionId: number,
    userId: number,
    options: {
      ip_address?: string;
      user_agent?: string;
    } = {}
  ): Promise<ServiceResponse<ContentVersion>> {
    const client = await this.pool.connect();

    try {
      // Use serializable isolation for publishing to prevent conflicts
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${VersioningIsolationLevel.SERIALIZABLE}`);
      await client.query('BEGIN');

      // Get the version with site validation
      const versionResult = await client.query(
        'SELECT * FROM content_versions WHERE id = $1',
        [versionId]
      );

      if (versionResult.rows.length === 0) {
        throw new Error('Version not found');
      }

      const version = versionResult.rows[0];

      // Validate site access
      const siteValidation = await this.validateSiteAccess(version.site_id, userId);
      if (!siteValidation.success) {
        await client.query('ROLLBACK');
        return siteValidation as ServiceResponse<ContentVersion>;
      }

      // Mark previous published version as archived
      await client.query(
        `UPDATE content_versions
         SET is_current_published = FALSE
         WHERE content_type = $1 AND content_id = $2 AND is_current_published = TRUE`,
        [version.content_type, version.content_id]
      );

      // Publish this version
      await client.query(
        `UPDATE content_versions
         SET is_current_published = TRUE,
             is_current_draft = FALSE,
             published_by = $1,
             published_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [userId, versionId]
      );

      // Update the main content table
      await this.syncToMainTable(version, client);

      // Audit logging
      await this.auditVersionOperation({
        action: VersionAction.PUBLISHED,
        version_id: versionId,
        user_id: userId,
        site_id: version.site_id,
        ip_address: options.ip_address,
        user_agent: options.user_agent,
        details: {
          content_type: version.content_type,
          content_id: version.content_id,
          version_number: version.version_number
        },
        data_classification: this.classifyVersionData(version as any)
      }, client);

      await client.query('COMMIT');

      // Emit version published event
      this.emitVersionEvent({
        action: VersionAction.PUBLISHED,
        version,
        userId,
        siteId: version.site_id
      });

      // Clear caches
      this.invalidateVersionCaches(version.site_id, version.content_type, version.content_id);

      const updatedVersion = await this.getVersion(versionId);
      return updatedVersion;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error publishing version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish version'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Reverts content to a previous version
   */
  async revertToVersion(
    versionId: number,
    userId: number
  ): Promise<ServiceResponse<ContentVersion>> {
    try {
      // Get the version to revert to
      const versionResult = await this.getVersion(versionId);
      if (!versionResult.success || !versionResult.data) {
        return versionResult;
      }

      const oldVersion = versionResult.data;

      // Create a new version based on the old one
      const input: CreateVersionInput = {
        site_id: oldVersion.site_id,
        locale: oldVersion.locale,
        content_type: oldVersion.content_type,
        content_id: oldVersion.content_id,
        title: oldVersion.title,
        slug: oldVersion.slug || undefined,
        content: oldVersion.content || undefined,
        excerpt: oldVersion.excerpt || undefined,
        data: oldVersion.data || undefined,
        meta_data: oldVersion.meta_data || undefined,
        change_summary: `Reverted to version ${oldVersion.version_number}`,
        is_current_draft: false
      };

      const newVersion = await this.createVersion(input, userId);

      if (newVersion.success && newVersion.data) {
        // Immediately publish the reverted version
        return await this.publishVersion(newVersion.data.id, userId);
      }

      return newVersion;
    } catch (error) {
      console.error('Error reverting to version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revert to version'
      };
    }
  }

  /**
   * Deletes a version (soft delete for published versions)
   */
  async deleteVersion(versionId: number): Promise<ServiceResponse<void>> {
    try {
      // Check if version is published
      const versionResult = await this.pool.query(
        'SELECT is_current_published FROM content_versions WHERE id = $1',
        [versionId]
      );

      if (versionResult.rows.length === 0) {
        return {
          success: false,
          error: 'Version not found'
        };
      }

      if (versionResult.rows[0].is_current_published) {
        return {
          success: false,
          error: 'Cannot delete published version'
        };
      }

      // Delete the version
      await this.pool.query(
        'DELETE FROM content_versions WHERE id = $1',
        [versionId]
      );

      return { success: true };
    } catch (error) {
      console.error('Error deleting version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete version'
      };
    }
  }

  /**
   * Compares two versions and returns the differences
   */
  async compareVersions(
    versionId1: number,
    versionId2: number
  ): Promise<ServiceResponse<VersionComparison>> {
    try {
      const [v1Result, v2Result] = await Promise.all([
        this.getVersion(versionId1),
        this.getVersion(versionId2)
      ]);

      if (!v1Result.success || !v1Result.data) {
        return {
          success: false,
          error: 'First version not found'
        };
      }

      if (!v2Result.success || !v2Result.data) {
        return {
          success: false,
          error: 'Second version not found'
        };
      }

      const version1 = v1Result.data;
      const version2 = v2Result.data;

      const changes = this.calculateDiff(version1, version2);
      const stats = this.calculateDiffStats(changes);

      return {
        success: true,
        data: {
          version_a: version1,
          version_b: version2,
          diffs: changes
        }
      };
    } catch (error) {
      console.error('Error comparing versions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to compare versions'
      };
    }
  }

  /**
   * Gets the latest draft version for a content item
   */
  async getLatestDraft(
    siteId: number,
    contentType: ContentType,
    contentId: number
  ): Promise<ServiceResponse<ContentVersion | null>> {
    try {
      const query = `
        SELECT * FROM content_versions
        WHERE site_id = $1 AND content_type = $2 AND content_id = $3 AND is_current_draft = TRUE
        ORDER BY version_number DESC
        LIMIT 1`;

      const result = await this.pool.query(query, [siteId, contentType, contentId]);

      return {
        success: true,
        data: result.rows[0] || null
      };
    } catch (error) {
      console.error('Error fetching latest draft:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch latest draft'
      };
    }
  }

  /**
   * Gets the current published version for a content item
   */
  async getPublishedVersion(
    siteId: number,
    contentType: ContentType,
    contentId: number
  ): Promise<ServiceResponse<ContentVersion | null>> {
    try {
      const query = `
        SELECT * FROM content_versions
        WHERE site_id = $1 AND content_type = $2 AND content_id = $3 AND is_current_published = TRUE
        LIMIT 1`;

      const result = await this.pool.query(query, [siteId, contentType, contentId]);

      return {
        success: true,
        data: result.rows[0] || null
      };
    } catch (error) {
      console.error('Error fetching published version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch published version'
      };
    }
  }

  // ============================================
  // Enhanced Security & Validation Methods
  // ============================================

  /**
   * Validates that a user has access to a specific site
   */
  async validateSiteAccess(siteId: number, userId: number): Promise<ServiceResponse<boolean>> {
    try {
      const query = `
        SELECT 1 FROM sites s
        JOIN users u ON u.id = $2
        WHERE s.id = $1
        AND (u.role = 'admin' OR EXISTS (
          SELECT 1 FROM site_users su
          WHERE su.site_id = s.id AND su.user_id = u.id
        ))`;

      const result = await this.pool.query(query, [siteId, userId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Access denied: User does not have permission for this site',
          error_code: VersionErrorCode.INSUFFICIENT_PERMISSIONS
        };
      }

      return { success: true, data: true };
    } catch (error) {
      console.error('Error validating site access:', error);
      return {
        success: false,
        error: 'Failed to validate site access',
        error_code: VersionErrorCode.VALIDATION_FAILED
      };
    }
  }

  /**
   * Sanitizes version input to prevent XSS and other attacks
   */
  async sanitizeVersionInput(input: CreateVersionInput): Promise<ServiceResponse<CreateVersionInput>> {
    try {
      const sanitized: CreateVersionInput = {
        ...input,
        title: DOMPurify.sanitize(input.title),
        content: input.content ? DOMPurify.sanitize(input.content) : null,
        excerpt: input.excerpt ? DOMPurify.sanitize(input.excerpt) : null,
        change_summary: input.change_summary ? DOMPurify.sanitize(input.change_summary) : null
      };

      // Additional validation
      if (!sanitized.title || sanitized.title.length < 1) {
        return {
          success: false,
          error: 'Title is required and cannot be empty',
          error_code: VersionErrorCode.VALIDATION_FAILED
        };
      }

      if (sanitized.title.length > 255) {
        return {
          success: false,
          error: 'Title cannot exceed 255 characters',
          error_code: VersionErrorCode.VALIDATION_FAILED
        };
      }

      return { success: true, data: sanitized };
    } catch (error) {
      console.error('Error sanitizing input:', error);
      return {
        success: false,
        error: 'Failed to sanitize input data',
        error_code: VersionErrorCode.VALIDATION_FAILED
      };
    }
  }

  /**
   * Gets the count of versions for a specific content item
   */
  async getVersionCount(siteId: number, contentType: ContentType, contentId: number): Promise<number> {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM content_versions
        WHERE site_id = $1 AND content_type = $2 AND content_id = $3`;

      const result = await this.pool.query(query, [siteId, contentType, contentId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting version count:', error);
      return 0;
    }
  }

  /**
   * Audit logging for version operations
   */
  async auditVersionOperation(auditData: AuditLogEntry, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    try {
      const query = `
        INSERT INTO version_audit_log (
          action, version_id, user_id, site_id, ip_address, user_agent,
          details, data_classification, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`;

      await db.query(query, [
        auditData.action,
        auditData.version_id,
        auditData.user_id,
        auditData.site_id,
        auditData.ip_address,
        auditData.user_agent,
        JSON.stringify(auditData.details),
        auditData.data_classification
      ]);
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      console.error('Error writing audit log:', error);
    }
  }

  /**
   * Classifies version data for security purposes
   */
  classifyVersionData(input: CreateVersionInput): DataClassification {
    // Simple classification - could be enhanced with ML/AI
    const content = `${input.title} ${input.content || ''} ${input.excerpt || ''}`;

    // Check for potential PII patterns
    const piiPatterns = [
      /\b\d{3}-?\d{2}-?\d{4}\b/, // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ // Credit card
    ];

    for (const pattern of piiPatterns) {
      if (pattern.test(content)) {
        return DataClassification.RESTRICTED;
      }
    }

    return DataClassification.INTERNAL;
  }

  /**
   * Emits version lifecycle events
   */
  emitVersionEvent(payload: VersionEventPayload): void {
    this.emit('version:' + payload.action, payload);
    this.emit('version:any', payload);
  }

  /**
   * Invalidates relevant caches
   */
  invalidateVersionCaches(siteId: number, contentType: ContentType, contentId: number): void {
    const keys = [
      `versions:${siteId}:${contentType}:${contentId}`,
      `draft:${siteId}:${contentType}:${contentId}`,
      `published:${siteId}:${contentType}:${contentId}`,
      `metrics:${siteId}:${contentType}:${contentId}`
    ];

    keys.forEach(key => this.versionCache.delete(key));
    keys.forEach(key => this.metricsCache.delete(key));
  }

  /**
   * Cleans up expired cache entries
   */
  cleanupExpiredCache(): void {
    // Simple cleanup - in production, use TTL-aware cache like Redis
    const now = Date.now();
    for (const [key, entry] of this.versionCache.entries()) {
      if ((entry as any)._cached_at && now - (entry as any)._cached_at > this.CACHE_TTL) {
        this.versionCache.delete(key);
      }
    }
  }

  // ============================================
  // Enhanced Version Operations
  // ============================================

  /**
   * Creates a specialized draft version with conflict detection
   */
  async createDraft(
    input: CreateVersionInput,
    userId: number,
    options: { ip_address?: string; user_agent?: string } = {}
  ): Promise<ServiceResponse<ContentVersion>> {
    const draftInput = {
      ...input,
      version_type: VersionType.DRAFT,
      is_current_draft: true,
      is_current_published: false
    };

    return this.createVersion(draftInput, userId, options);
  }

  /**
   * Creates an auto-save version with automatic pruning
   */
  async autoSave(
    input: CreateVersionInput,
    userId: number,
    options: { ip_address?: string; user_agent?: string } = {}
  ): Promise<ServiceResponse<ContentVersion>> {
    const autoSaveInput = {
      ...input,
      version_type: VersionType.AUTO_SAVE,
      is_current_draft: false,
      is_current_published: false,
      change_summary: input.change_summary || 'Auto-save'
    };

    const result = await this.createVersion(autoSaveInput, userId, options);

    // Trigger auto-save cleanup asynchronously
    if (result.success) {
      this.pruneOldAutoSaves(input.site_id, input.content_type, input.content_id).catch(error => {
        console.error('Error pruning auto-saves:', error);
      });
    }

    return result;
  }

  /**
   * Gets versions created by a specific user
   */
  async getVersionsByUser(
    siteId: number,
    userId: number,
    options: VersionHistoryOptions = {}
  ): Promise<ServiceResponse<PaginatedResponse<ContentVersion>>> {
    try {
      // Validate site access
      const siteValidation = await this.validateSiteAccess(siteId, userId);
      if (!siteValidation.success) {
        return siteValidation as ServiceResponse<PaginatedResponse<ContentVersion>>;
      }

      const {
        limit = 50,
        offset = 0,
        order_by = 'created_at',
        order_direction = 'DESC'
      } = options;

      const query = `
        SELECT v.*, u.name as created_by_name
        FROM content_versions v
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.site_id = $1 AND v.created_by = $2
        ORDER BY ${order_by} ${order_direction}
        LIMIT $3 OFFSET $4`;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM content_versions
        WHERE site_id = $1 AND created_by = $2`;

      const [versionsResult, countResult] = await Promise.all([
        this.pool.query(query, [siteId, userId, limit, offset]),
        this.pool.query(countQuery, [siteId, userId])
      ]);

      const total = parseInt(countResult.rows[0].total);

      return {
        success: true,
        data: {
          items: versionsResult.rows,
          total,
          page: Math.floor(offset / limit) + 1,
          limit,
          has_more: offset + limit < total
        }
      };
    } catch (error) {
      console.error('Error fetching versions by user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch versions by user'
      };
    }
  }

  /**
   * Generates detailed version metrics
   */
  async getVersionMetrics(
    siteId: number,
    contentType?: ContentType,
    contentId?: number
  ): Promise<ServiceResponse<VersionMetrics>> {
    try {
      const cacheKey = `metrics:${siteId}:${contentType || 'all'}:${contentId || 'all'}`;
      const cached = this.metricsCache.get(cacheKey);
      if (cached) {
        return { success: true, data: cached };
      }

      let whereClause = 'WHERE site_id = $1';
      const params: any[] = [siteId];

      if (contentType) {
        whereClause += ' AND content_type = $2';
        params.push(contentType);
      }

      if (contentId) {
        whereClause += ` AND content_id = $${params.length + 1}`;
        params.push(contentId);
      }

      const query = `
        SELECT
          COUNT(*) as total_versions,
          COUNT(*) FILTER (WHERE version_type = 'draft') as draft_count,
          COUNT(*) FILTER (WHERE version_type = 'published') as published_count,
          COUNT(*) FILTER (WHERE version_type = 'auto_save') as auto_save_count,
          MAX(created_at) as last_activity,
          SUM(COALESCE(LENGTH(content), 0) + COALESCE(LENGTH(title), 0)) as storage_size_bytes
        FROM content_versions
        ${whereClause}`;

      const result = await this.pool.query(query, params);
      const metrics = result.rows[0];

      const metricsData: VersionMetrics = {
        total_versions: parseInt(metrics.total_versions),
        draft_count: parseInt(metrics.draft_count),
        published_count: parseInt(metrics.published_count),
        auto_save_count: parseInt(metrics.auto_save_count),
        last_activity: metrics.last_activity,
        storage_size_bytes: parseInt(metrics.storage_size_bytes) || 0
      };

      // Cache the results
      this.metricsCache.set(cacheKey, metricsData);

      return { success: true, data: metricsData };
    } catch (error) {
      console.error('Error getting version metrics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get version metrics'
      };
    }
  }

  /**
   * Prunes old auto-save versions
   */
  async pruneOldAutoSaves(
    siteId: number,
    contentType: ContentType,
    contentId: number
  ): Promise<ServiceResponse<{ deleted_count: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.AUTO_SAVE_RETENTION_DAYS);

      const query = `
        DELETE FROM content_versions
        WHERE site_id = $1
          AND content_type = $2
          AND content_id = $3
          AND version_type = 'auto_save'
          AND created_at < $4
          AND NOT is_current_draft
          AND NOT is_current_published`;

      const result = await this.pool.query(query, [siteId, contentType, contentId, cutoffDate]);

      return {
        success: true,
        data: { deleted_count: result.rowCount || 0 }
      };
    } catch (error) {
      console.error('Error pruning auto-saves:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prune auto-saves'
      };
    }
  }

  // ============================================
  // Event System Methods
  // ============================================

  /**
   * Registers an event handler for version lifecycle events
   */
  onVersionCreated(handler: (payload: VersionEventPayload) => void): void {
    this.on('version:created', handler);
  }

  /**
   * Registers an event handler for version published events
   */
  onVersionPublished(handler: (payload: VersionEventPayload) => void): void {
    this.on('version:published', handler);
  }

  /**
   * Registers an event handler for version archived events
   */
  onVersionArchived(handler: (payload: VersionEventPayload) => void): void {
    this.on('version:archived', handler);
  }

  /**
   * Registers an event handler for any version event
   */
  onAnyVersionEvent(handler: (payload: VersionEventPayload) => void): void {
    this.on('version:any', handler);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Detects which fields have changed compared to the previous version
   */
  private async detectChangedFields(
    siteId: number,
    contentType: ContentType,
    contentId: number,
    newData: any,
    client: any
  ): Promise<string[]> {
    try {
      const prevVersionResult = await client.query(
        `SELECT * FROM content_versions
         WHERE site_id = $1 AND content_type = $2 AND content_id = $3
         ORDER BY version_number DESC
         LIMIT 1`,
        [siteId, contentType, contentId]
      );

      if (prevVersionResult.rows.length === 0) {
        // First version, all fields are new
        return ['initial_version'];
      }

      const prevVersion = prevVersionResult.rows[0];
      const changedFields: string[] = [];

      // Compare direct fields
      const directFields = ['title', 'slug', 'content', 'excerpt'];
      for (const field of directFields) {
        const currentValue = (newData as any)[field];
        if (currentValue !== undefined && currentValue !== prevVersion[field]) {
          changedFields.push(field);
        }
      }

      // Compare data fields (JSONB)
      const prevData = prevVersion.data || {};
      const currentData = newData.data || {};
      const dataFields = ['category_id', 'status', 'featured_image', 'template', 'parent_id', 'order_index', 'is_homepage'];

      for (const field of dataFields) {
        if (currentData[field] !== undefined && currentData[field] !== prevData[field]) {
          changedFields.push(`data.${field}`);
        }
      }

      // Compare meta_data fields (JSONB)
      const prevMeta = prevVersion.meta_data || {};
      const currentMeta = newData.meta_data || {};
      const metaFields = ['meta_title', 'meta_description', 'og_image'];

      for (const field of metaFields) {
        if (currentMeta[field] !== undefined && currentMeta[field] !== prevMeta[field]) {
          changedFields.push(`meta.${field}`);
        }
      }

      return changedFields;
    } catch (error) {
      console.error('Error detecting changed fields:', error);
      return [];
    }
  }

  /**
   * Syncs version data back to the main content table
   */
  private async syncToMainTable(version: ContentVersion, client: any): Promise<void> {
    if (version.content_type === ContentType.POST) {
      await client.query(
        `UPDATE posts SET
         title = $1, slug = $2, content = $3, excerpt = $4,
         meta_title = $5, meta_description = $6, og_image = $7,
         category_id = $8, status = $9, featured_image = $10,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $11`,
        [
          version.title,
          version.slug,
          version.content,
          version.excerpt,
          version.meta_data?.meta_title || null,
          version.meta_data?.meta_description || null,
          version.meta_data?.og_image || null,
          version.data?.category_id || null,
          version.data?.status || null,
          version.data?.featured_image || null,
          version.content_id
        ]
      );
    } else if (version.content_type === ContentType.PAGE) {
      await client.query(
        `UPDATE pages SET
         title = $1, slug = $2, content = $3, excerpt = $4,
         meta_title = $5, meta_description = $6, og_image = $7,
         template = $8, parent_id = $9, order_index = $10,
         is_homepage = $11, updated_at = CURRENT_TIMESTAMP
         WHERE id = $12`,
        [
          version.title,
          version.slug,
          version.content,
          version.excerpt,
          version.meta_data?.meta_title || null,
          version.meta_data?.meta_description || null,
          version.meta_data?.og_image || null,
          version.data?.template || null,
          version.data?.parent_id || null,
          version.data?.order_index || null,
          version.data?.is_homepage || false,
          version.content_id
        ]
      );
    }
  }

  /**
   * Calculates the diff between two versions
   */
  private calculateDiff(v1: ContentVersion, v2: ContentVersion): FieldChange[] {
    const changes: FieldChange[] = [];
    const fields = [
      'title', 'slug', 'content', 'excerpt',
      'meta_title', 'meta_description', 'og_image',
      'category_id', 'status', 'featured_image',
      'template', 'parent_id', 'order_index', 'is_homepage'
    ];

    for (const field of fields) {
      const oldValue = (v1 as any)[field];
      const newValue = (v2 as any)[field];

      if (oldValue !== newValue) {
        let type: 'added' | 'modified' | 'deleted' = 'modified';
        if (oldValue == null && newValue != null) type = 'added';
        if (oldValue != null && newValue == null) type = 'deleted';

        changes.push({
          field,
          old_value: oldValue,
          new_value: newValue,
          change_type: type
        });
      }
    }

    return changes;
  }

  /**
   * Calculates statistics for a diff
   */
  private calculateDiffStats(changes: FieldChange[]): any {
    return {
      fields_changed: changes.length,
      lines_added: 0, // Would need proper diff algorithm for content field
      lines_removed: 0,
      total_changes: changes.length
    };
  }
}