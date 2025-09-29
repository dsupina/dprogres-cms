"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionService = void 0;
const versioning_1 = require("../types/versioning");
const enums_1 = require("../types/versioning/enums");
const core_1 = require("../types/versioning/core");
const events_1 = require("events");
const isomorphic_dompurify_1 = __importDefault(require("isomorphic-dompurify"));
class VersionService extends events_1.EventEmitter {
    constructor(pool) {
        super();
        this.versionCache = new Map();
        this.metricsCache = new Map();
        this.CACHE_TTL = 300000;
        this.AUTO_SAVE_RETENTION_DAYS = 30;
        this.MAX_VERSIONS_PER_CONTENT = 1000;
        this.pool = pool;
        setInterval(() => this.cleanupExpiredCache(), this.CACHE_TTL);
    }
    async createVersion(input, userId, options = {}) {
        const siteValidation = await this.validateSiteAccess(input.site_id, userId);
        if (!siteValidation.success) {
            return { success: false, error: siteValidation.error };
        }
        const sanitizedInput = await this.sanitizeVersionInput(input);
        if (!sanitizedInput.success) {
            return { success: false, error: sanitizedInput.error };
        }
        const versionCount = await this.getVersionCount(input.site_id, input.content_type, input.content_id);
        if (versionCount >= this.MAX_VERSIONS_PER_CONTENT) {
            return {
                success: false,
                error: `Maximum version limit (${this.MAX_VERSIONS_PER_CONTENT}) reached for this content`
            };
        }
        const client = await this.pool.connect();
        try {
            await client.query(`SET TRANSACTION ISOLATION LEVEL ${enums_1.VersioningIsolationLevel.REPEATABLE_READ}`);
            await client.query('BEGIN');
            const versionNumberResult = await client.query('SELECT get_next_version_number($1, $2, $3) as version_number', [input.site_id, input.content_type, input.content_id]);
            const versionNumber = versionNumberResult.rows[0].version_number;
            const changedFields = await this.detectChangedFields(input.site_id, input.content_type, input.content_id, input, client);
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
            await this.auditVersionOperation({
                action: core_1.VersionAction.CREATED,
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
            this.emitVersionEvent({
                action: core_1.VersionAction.CREATED,
                version,
                userId,
                siteId: input.site_id,
                metadata: { changed_fields_count: changedFields.length }
            });
            this.invalidateVersionCaches(input.site_id, input.content_type, input.content_id);
            return {
                success: true,
                data: version,
                metadata: {
                    version_number: versionNumber,
                    changed_fields_count: changedFields.length
                }
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create version'
            };
        }
        finally {
            client.release();
        }
    }
    async getVersion(versionId) {
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
        }
        catch (error) {
            console.error('Error fetching version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch version'
            };
        }
    }
    async getVersionHistory(contentType, contentId, options = {}) {
        try {
            const { limit = 50, offset = 0, include_auto_saves = false, include_drafts = true, published_only = false, order_by = 'version_number', order_direction = 'DESC' } = options;
            const siteId = options.site_id;
            if (!siteId) {
                return {
                    success: false,
                    error: 'Site ID is required for version history'
                };
            }
            let whereConditions = ['site_id = $1', 'content_type = $2', 'content_id = $3'];
            const values = [siteId, contentType, contentId];
            if (options.version_type) {
                values.push(options.version_type);
                whereConditions.push(`version_type = $${values.length}`);
            }
            else if (!include_auto_saves) {
                whereConditions.push("version_type != 'auto_save'");
            }
            if (published_only && !options.version_type) {
                whereConditions.push("version_type = 'published'");
            }
            else if (!include_drafts && !options.version_type) {
                whereConditions.push("version_type = 'published'");
            }
            const whereClause = whereConditions.join(' AND ');
            const countQuery = `
        SELECT COUNT(*) as total
        FROM content_versions
        WHERE ${whereClause}`;
            const countResult = await this.pool.query(countQuery, values);
            const total = parseInt(countResult.rows[0].total);
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
        }
        catch (error) {
            console.error('Error fetching version history:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch version history'
            };
        }
    }
    async publishVersion(versionId, userId, options = {}) {
        const client = await this.pool.connect();
        try {
            await client.query(`SET TRANSACTION ISOLATION LEVEL ${enums_1.VersioningIsolationLevel.SERIALIZABLE}`);
            await client.query('BEGIN');
            const versionResult = await client.query('SELECT * FROM content_versions WHERE id = $1', [versionId]);
            if (versionResult.rows.length === 0) {
                throw new Error('Version not found');
            }
            const version = versionResult.rows[0];
            const siteValidation = await this.validateSiteAccess(version.site_id, userId);
            if (!siteValidation.success) {
                await client.query('ROLLBACK');
                return { success: false, error: siteValidation.error };
            }
            await client.query(`UPDATE content_versions
         SET is_current_published = FALSE
         WHERE content_type = $1 AND content_id = $2 AND is_current_published = TRUE`, [version.content_type, version.content_id]);
            await client.query(`UPDATE content_versions
         SET is_current_published = TRUE,
             is_current_draft = FALSE,
             published_by = $1,
             published_at = CURRENT_TIMESTAMP
         WHERE id = $2`, [userId, versionId]);
            await this.syncToMainTable(version, client);
            await this.auditVersionOperation({
                action: core_1.VersionAction.PUBLISHED,
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
                data_classification: this.classifyVersionData(version)
            }, client);
            await client.query('COMMIT');
            this.emitVersionEvent({
                action: core_1.VersionAction.PUBLISHED,
                version,
                userId,
                siteId: version.site_id
            });
            this.invalidateVersionCaches(version.site_id, version.content_type, version.content_id);
            const updatedVersion = await this.getVersion(versionId);
            return updatedVersion;
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error publishing version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to publish version'
            };
        }
        finally {
            client.release();
        }
    }
    async revertToVersion(versionId, userId) {
        try {
            const versionResult = await this.getVersion(versionId);
            if (!versionResult.success || !versionResult.data) {
                return versionResult;
            }
            const oldVersion = versionResult.data;
            const input = {
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
                return await this.publishVersion(newVersion.data.id, userId);
            }
            return newVersion;
        }
        catch (error) {
            console.error('Error reverting to version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to revert to version'
            };
        }
    }
    async deleteVersion(versionId) {
        try {
            const versionResult = await this.pool.query('SELECT is_current_published FROM content_versions WHERE id = $1', [versionId]);
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
            await this.pool.query('DELETE FROM content_versions WHERE id = $1', [versionId]);
            return { success: true };
        }
        catch (error) {
            console.error('Error deleting version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete version'
            };
        }
    }
    async compareVersions(versionId1, versionId2) {
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
        }
        catch (error) {
            console.error('Error comparing versions:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to compare versions'
            };
        }
    }
    async getLatestDraft(siteId, contentType, contentId) {
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
        }
        catch (error) {
            console.error('Error fetching latest draft:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch latest draft'
            };
        }
    }
    async getPublishedVersion(siteId, contentType, contentId) {
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
        }
        catch (error) {
            console.error('Error fetching published version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch published version'
            };
        }
    }
    async validateSiteAccess(siteId, userId) {
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
                    error: 'Access denied: User does not have permission for this site'
                };
            }
            return { success: true, data: true };
        }
        catch (error) {
            console.error('Error validating site access:', error);
            return {
                success: false,
                error: 'Failed to validate site access'
            };
        }
    }
    async sanitizeVersionInput(input) {
        try {
            const sanitized = {
                ...input,
                title: isomorphic_dompurify_1.default.sanitize(input.title),
                content: input.content ? isomorphic_dompurify_1.default.sanitize(input.content) : undefined,
                excerpt: input.excerpt ? isomorphic_dompurify_1.default.sanitize(input.excerpt) : undefined,
                change_summary: input.change_summary ? isomorphic_dompurify_1.default.sanitize(input.change_summary) : undefined
            };
            if (!sanitized.title || sanitized.title.length < 1) {
                return {
                    success: false,
                    error: 'Title is required and cannot be empty'
                };
            }
            if (sanitized.title.length > 255) {
                return {
                    success: false,
                    error: 'Title cannot exceed 255 characters'
                };
            }
            return { success: true, data: sanitized };
        }
        catch (error) {
            console.error('Error sanitizing input:', error);
            return {
                success: false,
                error: 'Failed to sanitize input data'
            };
        }
    }
    async getVersionCount(siteId, contentType, contentId) {
        try {
            const query = `
        SELECT COUNT(*) as count
        FROM content_versions
        WHERE site_id = $1 AND content_type = $2 AND content_id = $3`;
            const result = await this.pool.query(query, [siteId, contentType, contentId]);
            return parseInt(result.rows[0].count);
        }
        catch (error) {
            console.error('Error getting version count:', error);
            return 0;
        }
    }
    async auditVersionOperation(auditData, client) {
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
        }
        catch (error) {
            console.error('Error writing audit log:', error);
        }
    }
    classifyVersionData(input) {
        const content = `${input.title} ${input.content || ''} ${input.excerpt || ''}`;
        const piiPatterns = [
            /\b\d{3}-?\d{2}-?\d{4}\b/,
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
            /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/
        ];
        for (const pattern of piiPatterns) {
            if (pattern.test(content)) {
                return enums_1.DataClassification.RESTRICTED;
            }
        }
        return enums_1.DataClassification.INTERNAL;
    }
    emitVersionEvent(payload) {
        this.emit('version:' + payload.action, payload);
        this.emit('version:any', payload);
    }
    invalidateVersionCaches(siteId, contentType, contentId) {
        const keys = [
            `versions:${siteId}:${contentType}:${contentId}`,
            `draft:${siteId}:${contentType}:${contentId}`,
            `published:${siteId}:${contentType}:${contentId}`,
            `metrics:${siteId}:${contentType}:${contentId}`
        ];
        keys.forEach(key => this.versionCache.delete(key));
        keys.forEach(key => this.metricsCache.delete(key));
    }
    cleanupExpiredCache() {
        const now = Date.now();
        for (const [key, entry] of this.versionCache.entries()) {
            if (entry._cached_at && now - entry._cached_at > this.CACHE_TTL) {
                this.versionCache.delete(key);
            }
        }
    }
    async createDraft(input, userId, options = {}) {
        const draftInput = {
            ...input,
            version_type: versioning_1.VersionType.DRAFT,
            is_current_draft: true,
            is_current_published: false
        };
        return this.createVersion(draftInput, userId, options);
    }
    async autoSave(input, userId, options = {}) {
        const autoSaveInput = {
            ...input,
            version_type: versioning_1.VersionType.AUTO_SAVE,
            is_current_draft: false,
            is_current_published: false,
            change_summary: input.change_summary || 'Auto-save'
        };
        const result = await this.createVersion(autoSaveInput, userId, options);
        if (result.success) {
            this.pruneOldAutoSaves(input.site_id, input.content_type, input.content_id).catch(error => {
                console.error('Error pruning auto-saves:', error);
            });
        }
        return result;
    }
    async getVersionsByUser(siteId, userId, options = {}) {
        try {
            const siteValidation = await this.validateSiteAccess(siteId, userId);
            if (!siteValidation.success) {
                return {
                    success: false,
                    error: siteValidation.error || 'Site access validation failed'
                };
            }
            const { limit = 50, offset = 0, order_by = 'created_at', order_direction = 'DESC' } = options;
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
        }
        catch (error) {
            console.error('Error fetching versions by user:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch versions by user'
            };
        }
    }
    async getVersionMetrics(siteId, contentType, contentId) {
        try {
            const cacheKey = `metrics:${siteId}:${contentType || 'all'}:${contentId || 'all'}`;
            const cached = this.metricsCache.get(cacheKey);
            if (cached) {
                return { success: true, data: cached };
            }
            let whereClause = 'WHERE site_id = $1';
            const params = [siteId];
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
            const metricsData = {
                total_versions: parseInt(metrics.total_versions),
                draft_count: parseInt(metrics.draft_count),
                published_count: parseInt(metrics.published_count),
                auto_save_count: parseInt(metrics.auto_save_count),
                last_activity: metrics.last_activity,
                storage_size_bytes: parseInt(metrics.storage_size_bytes) || 0
            };
            this.metricsCache.set(cacheKey, metricsData);
            return { success: true, data: metricsData };
        }
        catch (error) {
            console.error('Error getting version metrics:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get version metrics'
            };
        }
    }
    async pruneOldAutoSaves(siteId, contentType, contentId) {
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
        }
        catch (error) {
            console.error('Error pruning auto-saves:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to prune auto-saves'
            };
        }
    }
    async createAutoSave(input, userId, siteId) {
        try {
            const autoSaveInput = {
                ...input,
                site_id: siteId,
                content_type: input.content_type,
                content_id: input.content_id,
                version_type: 'auto_save'
            };
            if (input.content_hash) {
                const existingHash = await this.getLatestContentHash(siteId, input.content_type, input.content_id);
                if (existingHash.success && existingHash.data === input.content_hash) {
                    return {
                        success: false,
                        error: 'No changes detected - auto-save skipped'
                    };
                }
            }
            const result = await this.createVersion(autoSaveInput, userId);
            if (result.success && result.data) {
                await this.cleanupOldAutoSaves(siteId, input.content_type, input.content_id, 5);
                if (input.content_hash) {
                    await this.pool.query('UPDATE content_versions SET content_hash = $1 WHERE id = $2', [input.content_hash, result.data.id]);
                }
            }
            return result;
        }
        catch (error) {
            console.error('Error creating auto-save:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create auto-save'
            };
        }
    }
    async getLatestAutoSave(contentType, contentId, siteId) {
        try {
            const query = `
        SELECT *
        FROM content_versions
        WHERE site_id = $1
          AND content_type = $2
          AND content_id = $3
          AND version_type = 'auto_save'
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const result = await this.pool.query(query, [siteId, contentType, contentId]);
            if (result.rows.length === 0) {
                return { success: true, data: null };
            }
            return { success: true, data: result.rows[0] };
        }
        catch (error) {
            console.error('Error getting latest auto-save:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get latest auto-save'
            };
        }
    }
    async hasUnsavedChanges(contentHash, contentType, contentId, siteId) {
        try {
            const latestHash = await this.getLatestContentHash(siteId, contentType, contentId);
            if (!latestHash.success) {
                return {
                    success: false,
                    error: latestHash.error
                };
            }
            return {
                success: true,
                data: latestHash.data !== contentHash
            };
        }
        catch (error) {
            console.error('Error checking unsaved changes:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to check unsaved changes'
            };
        }
    }
    async getLatestContentHash(siteId, contentType, contentId) {
        try {
            const query = `
        SELECT content_hash
        FROM content_versions
        WHERE site_id = $1
          AND content_type = $2
          AND content_id = $3
          AND content_hash IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const result = await this.pool.query(query, [siteId, contentType, contentId]);
            if (result.rows.length === 0) {
                return { success: true, data: null };
            }
            return { success: true, data: result.rows[0].content_hash };
        }
        catch (error) {
            console.error('Error getting content hash:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get content hash'
            };
        }
    }
    async cleanupOldAutoSaves(siteId, contentType, contentId, keepCount = 5) {
        try {
            const query = `
        WITH versions_to_delete AS (
          SELECT id
          FROM content_versions
          WHERE site_id = $1
            AND content_type = $2
            AND content_id = $3
            AND version_type = 'auto_save'
          ORDER BY created_at DESC
          OFFSET $4
        )
        DELETE FROM content_versions
        WHERE id IN (SELECT id FROM versions_to_delete)
      `;
            const result = await this.pool.query(query, [siteId, contentType, contentId, keepCount]);
            return {
                success: true,
                data: result.rowCount || 0
            };
        }
        catch (error) {
            console.error('Error cleaning up auto-saves:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to cleanup auto-saves'
            };
        }
    }
    onVersionCreated(handler) {
        this.on('version:created', handler);
    }
    onVersionPublished(handler) {
        this.on('version:published', handler);
    }
    onVersionArchived(handler) {
        this.on('version:archived', handler);
    }
    onAnyVersionEvent(handler) {
        this.on('version:any', handler);
    }
    async detectChangedFields(siteId, contentType, contentId, newData, client) {
        try {
            const prevVersionResult = await client.query(`SELECT * FROM content_versions
         WHERE site_id = $1 AND content_type = $2 AND content_id = $3
         ORDER BY version_number DESC
         LIMIT 1`, [siteId, contentType, contentId]);
            if (prevVersionResult.rows.length === 0) {
                return ['initial_version'];
            }
            const prevVersion = prevVersionResult.rows[0];
            const changedFields = [];
            const directFields = ['title', 'slug', 'content', 'excerpt'];
            for (const field of directFields) {
                const currentValue = newData[field];
                if (currentValue !== undefined && currentValue !== prevVersion[field]) {
                    changedFields.push(field);
                }
            }
            const prevData = prevVersion.data || {};
            const currentData = newData.data || {};
            const dataFields = ['category_id', 'status', 'featured_image', 'template', 'parent_id', 'order_index', 'is_homepage'];
            for (const field of dataFields) {
                if (currentData[field] !== undefined && currentData[field] !== prevData[field]) {
                    changedFields.push(`data.${field}`);
                }
            }
            const prevMeta = prevVersion.meta_data || {};
            const currentMeta = newData.meta_data || {};
            const metaFields = ['meta_title', 'meta_description', 'og_image'];
            for (const field of metaFields) {
                if (currentMeta[field] !== undefined && currentMeta[field] !== prevMeta[field]) {
                    changedFields.push(`meta.${field}`);
                }
            }
            return changedFields;
        }
        catch (error) {
            console.error('Error detecting changed fields:', error);
            return [];
        }
    }
    async syncToMainTable(version, client) {
        if (version.content_type === versioning_1.ContentType.POST) {
            await client.query(`UPDATE posts SET
         title = $1, slug = $2, content = $3, excerpt = $4,
         meta_title = $5, meta_description = $6, og_image = $7,
         category_id = $8, status = $9, featured_image = $10,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $11`, [
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
            ]);
        }
        else if (version.content_type === versioning_1.ContentType.PAGE) {
            await client.query(`UPDATE pages SET
         title = $1, slug = $2, content = $3, excerpt = $4,
         meta_title = $5, meta_description = $6, og_image = $7,
         template = $8, parent_id = $9, order_index = $10,
         is_homepage = $11, updated_at = CURRENT_TIMESTAMP
         WHERE id = $12`, [
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
            ]);
        }
    }
    calculateDiff(v1, v2) {
        const changes = [];
        const fields = [
            'title', 'slug', 'content', 'excerpt',
            'meta_title', 'meta_description', 'og_image',
            'category_id', 'status', 'featured_image',
            'template', 'parent_id', 'order_index', 'is_homepage'
        ];
        for (const field of fields) {
            const oldValue = v1[field];
            const newValue = v2[field];
            if (oldValue !== newValue) {
                let type = 'modified';
                if (oldValue == null && newValue != null)
                    type = 'added';
                if (oldValue != null && newValue == null)
                    type = 'deleted';
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
    calculateDiffStats(changes) {
        return {
            fields_changed: changes.length,
            lines_added: 0,
            lines_removed: 0,
            total_changes: changes.length
        };
    }
}
exports.VersionService = VersionService;
//# sourceMappingURL=VersionService.js.map