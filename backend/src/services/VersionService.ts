/**
 * VersionService - Core service for managing content versions
 *
 * This service handles all version-related operations including creation,
 * retrieval, publishing, and deletion of content versions.
 */

import { Pool } from 'pg';
import {
  ContentVersion,
  CreateVersionInput,
  VersionHistoryOptions,
  ServiceResponse,
  PaginatedResponse,
  ContentType,
  VersionDiff,
  VersionComparison,
  FieldChange
} from '../types/versioning';

export class VersionService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Creates a new version of content
   * @param input - Version creation input
   * @param userId - ID of the user creating the version
   */
  async createVersion(
    input: CreateVersionInput,
    userId: number
  ): Promise<ServiceResponse<ContentVersion>> {
    const client = await this.pool.connect();

    try {
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

      await client.query('COMMIT');

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
   * Publishes a version, making it the current live version
   */
  async publishVersion(
    versionId: number,
    userId: number
  ): Promise<ServiceResponse<ContentVersion>> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the version
      const versionResult = await client.query(
        'SELECT * FROM content_versions WHERE id = $1',
        [versionId]
      );

      if (versionResult.rows.length === 0) {
        throw new Error('Version not found');
      }

      const version = versionResult.rows[0];

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

      await client.query('COMMIT');

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