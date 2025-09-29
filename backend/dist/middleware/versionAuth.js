"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkContentAccess = exports.checkPublishPermission = exports.checkVersionAccess = void 0;
const database_1 = __importDefault(require("../utils/database"));
const checkVersionAccess = async (req, res, next) => {
    try {
        const { versionId } = req.params;
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (userRole === 'admin' || userRole === 'editor') {
            return next();
        }
        const versionQuery = `
      SELECT created_by, version_type
      FROM content_versions
      WHERE id = $1
    `;
        const result = await database_1.default.query(versionQuery, [versionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Version not found' });
        }
        const version = result.rows[0];
        if (version.created_by !== userId && req.method !== 'GET') {
            return res.status(403).json({
                error: 'You do not have permission to modify this version'
            });
        }
        if (version.version_type === 'published' && req.method !== 'GET' && userRole === 'author') {
            return res.status(403).json({
                error: 'Authors cannot modify published versions'
            });
        }
        next();
    }
    catch (error) {
        console.error('Error checking version access:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.checkVersionAccess = checkVersionAccess;
const checkPublishPermission = async (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'editor') {
        return res.status(403).json({
            error: 'You do not have permission to publish content'
        });
    }
    next();
};
exports.checkPublishPermission = checkPublishPermission;
const checkContentAccess = async (req, res, next) => {
    try {
        const { contentType, contentId } = req.params;
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (userRole === 'admin' || userRole === 'editor') {
            return next();
        }
        const tableName = contentType === 'post' ? 'posts' : 'pages';
        const contentQuery = `
      SELECT author_id
      FROM ${tableName}
      WHERE id = $1
    `;
        const result = await database_1.default.query(contentQuery, [contentId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: `${contentType} not found` });
        }
        const content = result.rows[0];
        if (content.author_id !== userId) {
            return res.status(403).json({
                error: `You do not have permission to create versions for this ${contentType}`
            });
        }
        next();
    }
    catch (error) {
        console.error('Error checking content access:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.checkContentAccess = checkContentAccess;
//# sourceMappingURL=versionAuth.js.map