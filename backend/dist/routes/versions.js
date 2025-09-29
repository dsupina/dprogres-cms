"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVersionRoutes = createVersionRoutes;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const VersionService_1 = require("../services/VersionService");
const DiffService_1 = require("../services/DiffService");
const router = (0, express_1.Router)();
const compareVersionsSchema = joi_1.default.object({
    version_a_id: joi_1.default.number().integer().positive().required(),
    version_b_id: joi_1.default.number().integer().positive().required(),
    diff_type: joi_1.default.string().valid('text', 'structural', 'metadata', 'all').default('all'),
    include_unchanged: joi_1.default.boolean().default(false),
    algorithm: joi_1.default.string().valid('myers', 'patience', 'histogram', 'semantic').default('myers'),
    granularity: joi_1.default.string().valid('line', 'word', 'character').default('line'),
    context_lines: joi_1.default.number().integer().min(0).max(10).default(3),
    ignore_whitespace: joi_1.default.boolean().default(false)
});
const exportDiffSchema = joi_1.default.object({
    version_ids: joi_1.default.array().items(joi_1.default.number().integer().positive()).min(2).max(2).required(),
    format: joi_1.default.string().valid('pdf', 'html', 'json', 'docx').required(),
    include_metadata: joi_1.default.boolean().default(true),
    include_statistics: joi_1.default.boolean().default(true),
    include_unchanged: joi_1.default.boolean().default(false),
    template: joi_1.default.string().optional(),
    custom_branding: joi_1.default.boolean().default(false),
    page_orientation: joi_1.default.string().valid('portrait', 'landscape').default('portrait')
});
const getDiffSchema = joi_1.default.object({
    format: joi_1.default.string().valid('json', 'html', 'unified').default('json'),
    context_lines: joi_1.default.number().integer().min(0).max(10).default(3)
});
const changesSummarySchema = joi_1.default.object({
    compare_with: joi_1.default.string().valid('previous', 'published', 'specific').default('previous'),
    compare_version_id: joi_1.default.number().integer().positive().optional()
});
function createVersionRoutes(pool) {
    const versionService = new VersionService_1.VersionService(pool);
    const diffService = new DiffService_1.DiffService(pool);
    const validateQuery = (schema) => {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.query, {
                abortEarly: false,
                stripUnknown: true,
            });
            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.details.map((detail) => ({
                        field: detail.path.join('.'),
                        message: detail.message,
                    })),
                });
            }
            req.query = value;
            next();
        };
    };
    router.get('/compare', auth_1.authenticateToken, validateQuery(compareVersionsSchema), async (req, res) => {
        try {
            const { version_a_id, version_b_id, diff_type, include_unchanged, algorithm, granularity, context_lines, ignore_whitespace } = req.query;
            const userId = req.user.id;
            const result = await diffService.compareVersions(Number(version_a_id), Number(version_b_id), userId, {
                algorithm: algorithm,
                granularity: granularity,
                contextLines: Number(context_lines),
                includeUnchanged: include_unchanged === 'true',
                ignoreWhitespace: ignore_whitespace === 'true'
            });
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
            let responseData = result.data;
            if (diff_type !== 'all' && responseData) {
                const filteredDiff = {
                    leftVersion: responseData.leftVersion,
                    rightVersion: responseData.rightVersion,
                    statistics: responseData.statistics,
                    computedAt: responseData.computedAt,
                    algorithmUsed: responseData.algorithmUsed
                };
                if (diff_type === 'text' || diff_type === 'all') {
                    filteredDiff.textDiff = responseData.textDiff;
                }
                if (diff_type === 'structural' || diff_type === 'all') {
                    filteredDiff.structuralDiff = responseData.structuralDiff;
                }
                if (diff_type === 'metadata' || diff_type === 'all') {
                    filteredDiff.metadataDiff = responseData.metadataDiff;
                }
                responseData = filteredDiff;
            }
            res.set('Cache-Control', 'public, max-age=60');
            res.set('ETag', `"${responseData?.cacheKey || 'nocache'}"`);
            res.json({
                success: true,
                data: responseData
            });
        }
        catch (error) {
            console.error('Error comparing versions:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    router.get('/:id1/diff/:id2', auth_1.authenticateToken, validateQuery(getDiffSchema), async (req, res) => {
        try {
            const { id1, id2 } = req.params;
            const { format, context_lines } = req.query;
            const userId = req.user.id;
            const result = await diffService.compareVersions(Number(id1), Number(id2), userId, {
                contextLines: Number(context_lines)
            });
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
            let response;
            if (format === 'html') {
                const htmlResult = await diffService.exportDiff(result.data, 'html', {
                    includeMetadata: true,
                    includeStatistics: true
                });
                if (!htmlResult.success) {
                    return res.status(500).json({
                        success: false,
                        error: htmlResult.error
                    });
                }
                res.set('Content-Type', 'text/html');
                return res.send(htmlResult.data);
            }
            else if (format === 'unified') {
                response = generateUnifiedDiff(result.data);
                res.set('Content-Type', 'text/plain');
                return res.send(response);
            }
            else {
                response = result.data;
            }
            res.set('Cache-Control', 'public, max-age=300');
            res.set('ETag', `"${result.data?.cacheKey || 'nocache'}"`);
            res.json({
                success: true,
                data: response
            });
        }
        catch (error) {
            console.error('Error getting diff:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    router.post('/diff/export', auth_1.authenticateToken, (0, validation_1.validateRequest)(exportDiffSchema), async (req, res) => {
        try {
            const { version_ids, format, include_metadata, include_statistics, include_unchanged, template, custom_branding, page_orientation } = req.body;
            const userId = req.user.id;
            const diffResult = await diffService.compareVersions(version_ids[0], version_ids[1], userId, {
                includeUnchanged: include_unchanged
            });
            if (!diffResult.success) {
                return res.status(400).json({
                    success: false,
                    error: diffResult.error
                });
            }
            const exportResult = await diffService.exportDiff(diffResult.data, format, {
                includeMetadata: include_metadata,
                includeStatistics: include_statistics,
                includeUnchanged: include_unchanged,
                template,
                customBranding: custom_branding,
                pageOrientation: page_orientation
            });
            if (!exportResult.success) {
                return res.status(500).json({
                    success: false,
                    error: exportResult.error
                });
            }
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `version-comparison-${version_ids[0]}-${version_ids[1]}-${timestamp}`;
            switch (format) {
                case 'pdf':
                    res.set('Content-Type', 'application/pdf');
                    res.set('Content-Disposition', `attachment; filename="${filename}.pdf"`);
                    break;
                case 'html':
                    res.set('Content-Type', 'text/html');
                    res.set('Content-Disposition', `attachment; filename="${filename}.html"`);
                    break;
                case 'json':
                    res.set('Content-Type', 'application/json');
                    res.set('Content-Disposition', `attachment; filename="${filename}.json"`);
                    break;
                case 'docx':
                    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                    res.set('Content-Disposition', `attachment; filename="${filename}.docx"`);
                    break;
            }
            res.send(exportResult.data);
        }
        catch (error) {
            console.error('Error exporting diff:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    router.get('/:id/changes-summary', auth_1.authenticateToken, validateQuery(changesSummarySchema), async (req, res) => {
        try {
            const { id } = req.params;
            const { compare_with, compare_version_id } = req.query;
            const userId = req.user.id;
            const versionResult = await pool.query('SELECT * FROM content_versions WHERE id = $1', [id]);
            if (versionResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Version not found'
                });
            }
            const targetVersion = versionResult.rows[0];
            let compareId;
            if (compare_with === 'specific' && compare_version_id) {
                compareId = Number(compare_version_id);
            }
            else if (compare_with === 'published') {
                const publishedResult = await pool.query(`SELECT id FROM content_versions
             WHERE site_id = $1 AND content_type = $2 AND content_id = $3
             AND is_current_published = true
             LIMIT 1`, [targetVersion.site_id, targetVersion.content_type, targetVersion.content_id]);
                if (publishedResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'No published version found for comparison'
                    });
                }
                compareId = publishedResult.rows[0].id;
            }
            else {
                const previousResult = await pool.query(`SELECT id FROM content_versions
             WHERE site_id = $1 AND content_type = $2 AND content_id = $3
             AND version_number < $4
             ORDER BY version_number DESC
             LIMIT 1`, [
                    targetVersion.site_id,
                    targetVersion.content_type,
                    targetVersion.content_id,
                    targetVersion.version_number
                ]);
                if (previousResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'No previous version found for comparison'
                    });
                }
                compareId = previousResult.rows[0].id;
            }
            const diffResult = await diffService.compareVersions(compareId, Number(id), userId, {});
            if (!diffResult.success) {
                return res.status(400).json({
                    success: false,
                    error: diffResult.error
                });
            }
            const summary = {
                version_id: Number(id),
                compared_with_id: compareId,
                statistics: diffResult.data.statistics,
                major_changes: diffResult.data.statistics.majorChanges,
                computed_at: diffResult.data.computedAt
            };
            res.set('Cache-Control', 'public, max-age=1800');
            res.json({
                success: true,
                data: summary
            });
        }
        catch (error) {
            console.error('Error getting changes summary:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    router.get('/history/:contentType/:contentId', auth_1.authenticateToken, async (req, res) => {
        try {
            const { contentType, contentId } = req.params;
            const userId = req.user.id;
            const versionsResult = await pool.query(`SELECT v.*, u.email as author_email, u.name as author_name
           FROM content_versions v
           LEFT JOIN users u ON v.created_by = u.id
           WHERE v.content_type = $1 AND v.content_id = $2
           ORDER BY v.version_number DESC`, [contentType, contentId]);
            if (versionsResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No versions found'
                });
            }
            const siteId = versionsResult.rows[0].site_id;
            const accessResult = await pool.query(`SELECT 1 FROM sites
           WHERE id = $1 AND (user_id = $2 OR $2 IN (
             SELECT user_id FROM site_users WHERE site_id = $1
           ))`, [siteId, userId]);
            if (accessResult.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
            const versionsWithSummaries = [];
            for (let i = 0; i < versionsResult.rows.length; i++) {
                const version = versionsResult.rows[i];
                const versionData = { ...version };
                if (i < versionsResult.rows.length - 1) {
                    const prevVersion = versionsResult.rows[i + 1];
                    const diffResult = await diffService.compareVersions(prevVersion.id, version.id, userId, {});
                    if (diffResult.success && diffResult.data) {
                        versionData.changes_from_previous = {
                            total_changes: diffResult.data.statistics.totalChanges,
                            lines_added: diffResult.data.statistics.linesAdded,
                            lines_removed: diffResult.data.statistics.linesRemoved,
                            change_percent: diffResult.data.statistics.changePercent
                        };
                    }
                }
                versionsWithSummaries.push(versionData);
            }
            res.json({
                success: true,
                data: {
                    versions: versionsWithSummaries,
                    total: versionsWithSummaries.length,
                    content_type: contentType,
                    content_id: Number(contentId)
                }
            });
        }
        catch (error) {
            console.error('Error getting version history:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    return router;
}
function generateUnifiedDiff(diff) {
    const lines = [];
    lines.push(`--- Version ${diff.leftVersion.version_number} (${diff.leftVersion.version_type})`);
    lines.push(`+++ Version ${diff.rightVersion.version_number} (${diff.rightVersion.version_type})`);
    lines.push(`@@ Changes: ${diff.statistics.totalChanges} @@`);
    diff.textDiff.hunks.forEach((hunk) => {
        lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
        hunk.changes.forEach((change) => {
            if (change.type === 'unchanged') {
                lines.push(` ${change.content}`);
            }
            else if (change.type === 'add') {
                lines.push(`+${change.content}`);
            }
            else if (change.type === 'remove') {
                lines.push(`-${change.content}`);
            }
        });
    });
    return lines.join('\n');
}
//# sourceMappingURL=versions.js.map