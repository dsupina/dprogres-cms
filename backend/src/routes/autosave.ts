import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { checkContentAccess } from '../middleware/versionAuth';
import { VersionService } from '../services/VersionService';
import pool from '../utils/database';
import { ContentType } from '../types/versioning/enums';
import crypto from 'crypto';

const router = Router();
const versionService = new VersionService(pool);

// Helper function to generate content hash
async function generateContentHash(content: any): Promise<string> {
  const contentString = JSON.stringify(content);
  return crypto.createHash('sha256').update(contentString).digest('hex');
}

// Create auto-save version
// POST /api/content/:contentType/:contentId/autosave
router.post(
  '/content/:contentType/:contentId/autosave',
  authenticateToken,
  checkContentAccess,
  async (req: Request, res: Response) => {
    try {
      const { contentType, contentId } = req.params;
      const userId = req.user!.userId;
      const autoSaveData = req.body;

      // Generate content hash
      const contentHash = await generateContentHash({
        title: autoSaveData.title,
        content: autoSaveData.content,
        excerpt: autoSaveData.excerpt,
        data: autoSaveData.data
      });

      // Get site context
      const tableName = contentType === 'post' ? 'posts' : 'pages';
      const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
      const siteResult = await pool.query(siteQuery, [contentId]);

      if (siteResult.rows.length === 0) {
        return res.status(404).json({ error: `${contentType} not found` });
      }

      const siteId = siteResult.rows[0].site_id || 1;

      // Create auto-save input
      const input = {
        site_id: siteId, // Add site_id to satisfy CreateVersionInput type
        content_type: contentType as ContentType,
        content_id: Number(contentId),
        title: autoSaveData.title,
        content: autoSaveData.content,
        excerpt: autoSaveData.excerpt,
        slug: autoSaveData.slug,
        data: autoSaveData.data || {},
        meta_data: autoSaveData.meta_data || {},
        change_summary: 'Auto-save',
        content_hash: contentHash
      };

      // Create the auto-save using the service
      const result = await versionService.createAutoSave(input, userId, siteId);

      if (!result.success) {
        // If no changes detected, return success but with no data
        if (result.error?.includes('No changes detected')) {
          return res.json({
            success: true,
            data: null,
            message: 'No changes to save'
          });
        }
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        data: {
          version: result.data,
          content_hash: contentHash
        }
      });
    } catch (error) {
      console.error('Error creating auto-save:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get latest auto-save version
// GET /api/content/:contentType/:contentId/autosave/latest
router.get(
  '/content/:contentType/:contentId/autosave/latest',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { contentType, contentId } = req.params;

      // Get site context
      const tableName = contentType === 'post' ? 'posts' : 'pages';
      const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
      const siteResult = await pool.query(siteQuery, [contentId]);

      if (siteResult.rows.length === 0) {
        return res.status(404).json({ error: `${contentType} not found` });
      }

      const siteId = siteResult.rows[0].site_id || 1;

      // Get latest auto-save
      const result = await versionService.getLatestAutoSave(
        contentType as ContentType,
        Number(contentId),
        siteId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Check if there's a newer manual save
      const latestVersionQuery = `
        SELECT created_at
        FROM content_versions
        WHERE site_id = $1
          AND content_type = $2
          AND content_id = $3
          AND version_type != 'auto_save'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const latestVersion = await pool.query(latestVersionQuery, [siteId, contentType, contentId]);
      const hasNewerManualSave = latestVersion.rows.length > 0 &&
        result.data &&
        new Date(latestVersion.rows[0].created_at) > new Date(result.data.created_at);

      res.json({
        success: true,
        data: {
          version: result.data,
          has_newer_manual_save: hasNewerManualSave
        }
      });
    } catch (error) {
      console.error('Error getting latest auto-save:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Check if content has unsaved changes
// GET /api/content/:contentType/:contentId/autosave/status
router.get(
  '/content/:contentType/:contentId/autosave/status',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { contentType, contentId } = req.params;
      const { content_hash } = req.query;

      if (!content_hash) {
        return res.status(400).json({ error: 'Content hash required' });
      }

      // Get site context
      const tableName = contentType === 'post' ? 'posts' : 'pages';
      const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
      const siteResult = await pool.query(siteQuery, [contentId]);

      if (siteResult.rows.length === 0) {
        return res.status(404).json({ error: `${contentType} not found` });
      }

      const siteId = siteResult.rows[0].site_id || 1;

      // Check for unsaved changes
      const result = await versionService.hasUnsavedChanges(
        content_hash as string,
        contentType as ContentType,
        Number(contentId),
        siteId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Get latest version info for status
      const latestVersionQuery = `
        SELECT version_number, created_at, created_by
        FROM content_versions
        WHERE site_id = $1
          AND content_type = $2
          AND content_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const latestVersion = await pool.query(latestVersionQuery, [siteId, contentType, contentId]);

      res.json({
        success: true,
        data: {
          has_unsaved_changes: result.data,
          latest_version_number: latestVersion.rows[0]?.version_number || 0
        }
      });
    } catch (error) {
      console.error('Error checking auto-save status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Clean up auto-saves for content
// DELETE /api/content/:contentType/:contentId/autosave/cleanup
router.delete(
  '/content/:contentType/:contentId/autosave/cleanup',
  authenticateToken,
  checkContentAccess,
  async (req: Request, res: Response) => {
    try {
      const { contentType, contentId } = req.params;

      // Get site context
      const tableName = contentType === 'post' ? 'posts' : 'pages';
      const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
      const siteResult = await pool.query(siteQuery, [contentId]);

      if (siteResult.rows.length === 0) {
        return res.status(404).json({ error: `${contentType} not found` });
      }

      const siteId = siteResult.rows[0].site_id || 1;

      // Prune old auto-saves
      const result = await versionService.pruneOldAutoSaves(
        siteId,
        contentType as ContentType,
        Number(contentId)
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        message: `Cleaned up ${result.data?.deleted_count || 0} old auto-saves`
      });
    } catch (error) {
      console.error('Error cleaning up auto-saves:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;