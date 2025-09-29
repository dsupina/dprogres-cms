"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const versionAuth_1 = require("../middleware/versionAuth");
const VersionService_1 = require("../services/VersionService");
const database_1 = __importDefault(require("../utils/database"));
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
const versionService = new VersionService_1.VersionService(database_1.default);
async function generateContentHash(content) {
    const contentString = JSON.stringify(content);
    return crypto_1.default.createHash('sha256').update(contentString).digest('hex');
}
router.post('/content/:contentType/:contentId/autosave', auth_1.authenticateToken, versionAuth_1.checkContentAccess, async (req, res) => {
    try {
        const { contentType, contentId } = req.params;
        const userId = req.user.userId;
        const autoSaveData = req.body;
        const contentHash = await generateContentHash({
            title: autoSaveData.title,
            content: autoSaveData.content,
            excerpt: autoSaveData.excerpt,
            data: autoSaveData.data
        });
        const tableName = contentType === 'post' ? 'posts' : 'pages';
        const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
        const siteResult = await database_1.default.query(siteQuery, [contentId]);
        if (siteResult.rows.length === 0) {
            return res.status(404).json({ error: `${contentType} not found` });
        }
        const siteId = siteResult.rows[0].site_id || 1;
        const input = {
            site_id: siteId,
            content_type: contentType,
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
        const result = await versionService.createAutoSave(input, userId, siteId);
        if (!result.success) {
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
    }
    catch (error) {
        console.error('Error creating auto-save:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/content/:contentType/:contentId/autosave/latest', auth_1.authenticateToken, async (req, res) => {
    try {
        const { contentType, contentId } = req.params;
        const tableName = contentType === 'post' ? 'posts' : 'pages';
        const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
        const siteResult = await database_1.default.query(siteQuery, [contentId]);
        if (siteResult.rows.length === 0) {
            return res.status(404).json({ error: `${contentType} not found` });
        }
        const siteId = siteResult.rows[0].site_id || 1;
        const result = await versionService.getLatestAutoSave(contentType, Number(contentId), siteId);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
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
        const latestVersion = await database_1.default.query(latestVersionQuery, [siteId, contentType, contentId]);
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
    }
    catch (error) {
        console.error('Error getting latest auto-save:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/content/:contentType/:contentId/autosave/status', auth_1.authenticateToken, async (req, res) => {
    try {
        const { contentType, contentId } = req.params;
        const { content_hash } = req.query;
        if (!content_hash) {
            return res.status(400).json({ error: 'Content hash required' });
        }
        const tableName = contentType === 'post' ? 'posts' : 'pages';
        const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
        const siteResult = await database_1.default.query(siteQuery, [contentId]);
        if (siteResult.rows.length === 0) {
            return res.status(404).json({ error: `${contentType} not found` });
        }
        const siteId = siteResult.rows[0].site_id || 1;
        const result = await versionService.hasUnsavedChanges(content_hash, contentType, Number(contentId), siteId);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        const latestVersionQuery = `
        SELECT version_number, created_at, created_by
        FROM content_versions
        WHERE site_id = $1
          AND content_type = $2
          AND content_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `;
        const latestVersion = await database_1.default.query(latestVersionQuery, [siteId, contentType, contentId]);
        res.json({
            success: true,
            data: {
                has_unsaved_changes: result.data,
                latest_version_number: latestVersion.rows[0]?.version_number || 0
            }
        });
    }
    catch (error) {
        console.error('Error checking auto-save status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/content/:contentType/:contentId/autosave/cleanup', auth_1.authenticateToken, versionAuth_1.checkContentAccess, async (req, res) => {
    try {
        const { contentType, contentId } = req.params;
        const tableName = contentType === 'post' ? 'posts' : 'pages';
        const siteQuery = `SELECT site_id FROM ${tableName} WHERE id = $1`;
        const siteResult = await database_1.default.query(siteQuery, [contentId]);
        if (siteResult.rows.length === 0) {
            return res.status(404).json({ error: `${contentType} not found` });
        }
        const siteId = siteResult.rows[0].site_id || 1;
        const result = await versionService.pruneOldAutoSaves(siteId, contentType, Number(contentId));
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({
            success: true,
            message: `Cleaned up ${result.data?.deleted_count || 0} old auto-saves`
        });
    }
    catch (error) {
        console.error('Error cleaning up auto-saves:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=autosave.js.map