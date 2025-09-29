"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const versionAuth_1 = require("../middleware/versionAuth");
const database_1 = __importDefault(require("../utils/database"));
const router = (0, express_1.Router)();
router.get('/content/:contentType/:contentId/versions', auth_1.authenticateToken, async (req, res) => {
    try {
        const { contentType, contentId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const query = `
        SELECT
          cv.*,
          u.first_name,
          u.last_name
        FROM content_versions cv
        LEFT JOIN users u ON cv.created_by = u.id
        WHERE cv.content_type = $1
          AND cv.content_id = $2
          AND cv.version_type != 'auto_save'
        ORDER BY cv.created_at DESC
        LIMIT $3 OFFSET $4
      `;
        const offset = (Number(page) - 1) * Number(limit);
        const result = await database_1.default.query(query, [contentType, contentId, limit, offset]);
        const countQuery = `
        SELECT COUNT(*) as total
        FROM content_versions
        WHERE content_type = $1
          AND content_id = $2
          AND version_type != 'auto_save'
      `;
        const countResult = await database_1.default.query(countQuery, [contentType, contentId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Error listing versions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/content/:contentType/:contentId/versions', auth_1.authenticateToken, versionAuth_1.checkContentAccess, async (req, res) => {
    try {
        const { contentType, contentId } = req.params;
        const userId = req.user.userId;
        const versionData = req.body;
        const versionNumQuery = `
        SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
        FROM content_versions
        WHERE content_type = $1 AND content_id = $2
      `;
        const versionNumResult = await database_1.default.query(versionNumQuery, [contentType, contentId]);
        const nextVersion = versionNumResult.rows[0].next_version;
        const insertQuery = `
        INSERT INTO content_versions (
          site_id, content_type, content_id, version_number,
          version_type, title, content, excerpt, slug,
          data, meta_data, created_by, change_summary
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *
      `;
        const values = [
            1,
            contentType,
            contentId,
            nextVersion,
            versionData.version_type || 'draft',
            versionData.title,
            versionData.content,
            versionData.excerpt || null,
            versionData.slug || null,
            JSON.stringify(versionData.data || {}),
            JSON.stringify(versionData.meta_data || {}),
            userId,
            versionData.change_summary || null
        ];
        const result = await database_1.default.query(insertQuery, values);
        res.status(201).json({
            success: true,
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error creating version:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/versions/:versionId', auth_1.authenticateToken, versionAuth_1.checkVersionAccess, async (req, res) => {
    try {
        const { versionId } = req.params;
        const query = `
        SELECT cv.*, u.first_name, u.last_name
        FROM content_versions cv
        LEFT JOIN users u ON cv.created_by = u.id
        WHERE cv.id = $1
      `;
        const result = await database_1.default.query(query, [versionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Version not found' });
        }
        res.json({
            success: true,
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error getting version:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/versions/:versionId', auth_1.authenticateToken, versionAuth_1.checkVersionAccess, async (req, res) => {
    try {
        const { versionId } = req.params;
        const updates = req.body;
        const checkQuery = `SELECT version_type FROM content_versions WHERE id = $1`;
        const checkResult = await database_1.default.query(checkQuery, [versionId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Version not found' });
        }
        if (checkResult.rows[0].version_type !== 'draft' && checkResult.rows[0].version_type !== 'auto_save') {
            return res.status(400).json({ error: 'Only draft versions can be updated' });
        }
        const updateFields = [];
        const values = [];
        let paramCount = 1;
        if (updates.title !== undefined) {
            updateFields.push(`title = $${paramCount}`);
            values.push(updates.title);
            paramCount++;
        }
        if (updates.content !== undefined) {
            updateFields.push(`content = $${paramCount}`);
            values.push(updates.content);
            paramCount++;
        }
        if (updates.excerpt !== undefined) {
            updateFields.push(`excerpt = $${paramCount}`);
            values.push(updates.excerpt);
            paramCount++;
        }
        if (updates.slug !== undefined) {
            updateFields.push(`slug = $${paramCount}`);
            values.push(updates.slug);
            paramCount++;
        }
        if (updates.change_summary !== undefined) {
            updateFields.push(`change_summary = $${paramCount}`);
            values.push(updates.change_summary);
            paramCount++;
        }
        values.push(versionId);
        const updateQuery = `
        UPDATE content_versions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;
        const result = await database_1.default.query(updateQuery, values);
        res.json({
            success: true,
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error updating version:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/versions/:versionId/publish', auth_1.authenticateToken, versionAuth_1.checkPublishPermission, async (req, res) => {
    try {
        const { versionId } = req.params;
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const versionQuery = `
          SELECT content_type, content_id, site_id
          FROM content_versions
          WHERE id = $1
        `;
            const versionResult = await client.query(versionQuery, [versionId]);
            if (versionResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Version not found' });
            }
            const { content_type, content_id, site_id } = versionResult.rows[0];
            await client.query(`
          UPDATE content_versions
          SET is_current_published = false
          WHERE content_type = $1 AND content_id = $2 AND site_id = $3
        `, [content_type, content_id, site_id]);
            const publishQuery = `
          UPDATE content_versions
          SET
            version_type = 'published',
            is_current_published = true,
            published_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;
            const result = await client.query(publishQuery, [versionId]);
            await client.query('COMMIT');
            res.json({
                success: true,
                data: result.rows[0],
                message: 'Version published successfully'
            });
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error('Error publishing version:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/versions/:versionId', auth_1.authenticateToken, versionAuth_1.checkVersionAccess, async (req, res) => {
    try {
        const { versionId } = req.params;
        const checkQuery = `SELECT version_type FROM content_versions WHERE id = $1`;
        const checkResult = await database_1.default.query(checkQuery, [versionId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Version not found' });
        }
        if (checkResult.rows[0].version_type === 'published') {
            return res.status(400).json({ error: 'Cannot delete published versions' });
        }
        const deleteQuery = `
        UPDATE content_versions
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
        await database_1.default.query(deleteQuery, [versionId]);
        res.json({
            success: true,
            message: 'Version deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting version:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=versions_simple.js.map