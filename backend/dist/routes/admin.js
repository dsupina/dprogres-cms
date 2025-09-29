"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.get('/dashboard', async (req, res) => {
    try {
        if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const [postsResult, pagesResult, categoriesResult, usersResult] = await Promise.all([
            (0, database_1.query)('SELECT COUNT(*) as count FROM posts'),
            (0, database_1.query)('SELECT COUNT(*) as count FROM pages'),
            (0, database_1.query)('SELECT COUNT(*) as count FROM categories'),
            (0, database_1.query)('SELECT COUNT(*) as count FROM users')
        ]);
        const recentPostsResult = await (0, database_1.query)('SELECT p.id, p.title, p.status, p.created_at, u.first_name, u.last_name FROM posts p LEFT JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT 5');
        const postsByStatusResult = await (0, database_1.query)('SELECT status, COUNT(*) as count FROM posts GROUP BY status');
        const postsByStatus = {};
        postsByStatusResult.rows.forEach((row) => {
            postsByStatus[row.status] = parseInt(row.count);
        });
        const popularPostsResult = await (0, database_1.query)('SELECT p.id, p.title, p.view_count, p.created_at FROM posts p WHERE p.status = \'published\' ORDER BY p.view_count DESC LIMIT 5');
        const stats = {
            totalPosts: parseInt(postsResult.rows[0].count),
            totalPages: parseInt(pagesResult.rows[0].count),
            totalCategories: parseInt(categoriesResult.rows[0].count),
            totalUsers: parseInt(usersResult.rows[0].count),
            postsByStatus,
            recentPosts: recentPostsResult.rows,
            popularPosts: popularPostsResult.rows
        };
        res.json(stats);
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/posts', async (req, res) => {
    try {
        if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const { page = 1, limit = 10, search, status, category, author } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let whereClause = "WHERE 1=1";
        const params = [];
        let paramCount = 0;
        if (req.user.role === 'author') {
            whereClause += ` AND p.author_id = $${++paramCount}`;
            params.push(req.user.userId);
        }
        if (search) {
            whereClause += ` AND (p.title ILIKE $${++paramCount} OR p.excerpt ILIKE $${paramCount} OR p.content ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }
        if (status) {
            whereClause += ` AND p.status = $${++paramCount}`;
            params.push(status);
        }
        if (category) {
            whereClause += ` AND c.slug = $${++paramCount}`;
            params.push(category);
        }
        if (author) {
            whereClause += ` AND p.author_id = $${++paramCount}`;
            params.push(author);
        }
        const postsQuery = `
      SELECT 
        p.id, p.title, p.slug, p.excerpt, p.featured_image, p.status,
        p.created_at, p.updated_at, p.view_count, p.featured,
        c.name as category_name, c.slug as category_slug,
        u.first_name, u.last_name, u.email as author_email,
        COALESCE(
          JSON_AGG(
            CASE WHEN t.id IS NOT NULL THEN 
              JSON_BUILD_OBJECT('id', t.id, 'name', t.name, 'slug', t.slug)
            END
          ) FILTER (WHERE t.id IS NOT NULL), 
          '[]'
        ) as tags
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      ${whereClause}
      GROUP BY p.id, c.name, c.slug, u.first_name, u.last_name, u.email
      ORDER BY p.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
        params.push(limit, offset);
        const countQuery = `
      SELECT COUNT(DISTINCT p.id)
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.author_id = u.id
      ${whereClause}
    `;
        const [postsResult, countResult] = await Promise.all([
            (0, database_1.query)(postsQuery, params),
            (0, database_1.query)(countQuery, params.slice(0, -2))
        ]);
        const posts = postsResult.rows;
        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / Number(limit));
        res.json({
            data: posts,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                totalCount,
                totalPages,
                hasNextPage: Number(page) < totalPages,
                hasPreviousPage: Number(page) > 1
            }
        });
    }
    catch (error) {
        console.error('Admin get posts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/posts/:id', async (req, res) => {
    try {
        if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM posts p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json({ data: result.rows[0] });
    }
    catch (error) {
        console.error('Admin get post by id error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/categories', async (req, res) => {
    try {
        if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const categoriesQuery = `
      SELECT 
        c.*,
        COUNT(p.id) as total_posts,
        COUNT(CASE WHEN p.status = 'published' THEN 1 END) as published_posts,
        COUNT(CASE WHEN p.status = 'draft' THEN 1 END) as draft_posts
      FROM categories c
      LEFT JOIN posts p ON c.id = p.category_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `;
        const result = await (0, database_1.query)(categoriesQuery);
        res.json({
            data: result.rows
        });
    }
    catch (error) {
        console.error('Admin get categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/pages', async (req, res) => {
    try {
        if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const { page = 1, limit = 10, search, template, published } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let whereClause = "WHERE 1=1";
        const params = [];
        let paramCount = 0;
        if (search) {
            whereClause += ` AND (p.title ILIKE $${++paramCount} OR p.content ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }
        if (template) {
            whereClause += ` AND p.template = $${++paramCount}`;
            params.push(template);
        }
        if (published !== undefined) {
            whereClause += ` AND p.published = $${++paramCount}`;
            params.push(String(published) === 'true');
        }
        const pagesQuery = `
      SELECT 
        p.id, p.title, p.slug, p.template, p.published,
        p.meta_title, p.meta_description, p.seo_indexed,
        p.created_at, p.updated_at
      FROM pages p
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
        params.push(limit, offset);
        const countQuery = `
      SELECT COUNT(*)
      FROM pages p
      ${whereClause}
    `;
        const [pagesResult, countResult] = await Promise.all([
            (0, database_1.query)(pagesQuery, params),
            (0, database_1.query)(countQuery, params.slice(0, -2))
        ]);
        const pages = pagesResult.rows;
        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / Number(limit));
        res.json({
            data: pages,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                totalCount,
                totalPages,
                hasNextPage: Number(page) < totalPages,
                hasPreviousPage: Number(page) > 1
            }
        });
    }
    catch (error) {
        console.error('Admin get pages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/pages/:id', async (req, res) => {
    try {
        if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT * FROM pages WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found' });
        }
        res.json({ data: result.rows[0] });
    }
    catch (error) {
        console.error('Admin get page by id error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/users', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can view users' });
        }
        const result = await (0, database_1.query)('SELECT id, email, first_name, last_name, role, created_at FROM users ORDER BY created_at DESC');
        res.json({ users: result.rows });
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/users/:id/role', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can update user roles' });
        }
        const { id } = req.params;
        const { role } = req.body;
        const validRoles = ['admin', 'editor', 'author'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        const result = await (0, database_1.query)('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, role', [role, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            message: 'User role updated successfully',
            user: result.rows[0]
        });
    }
    catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/users/:id', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can delete users' });
        }
        const { id } = req.params;
        if (parseInt(id) === req.user.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        const result = await (0, database_1.query)('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/posts/bulk', async (req, res) => {
    try {
        const { action, postIds } = req.body;
        if (!action || !Array.isArray(postIds) || postIds.length === 0) {
            return res.status(400).json({ error: 'Action and post IDs are required' });
        }
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        let query_str = '';
        let values = [];
        switch (action) {
            case 'publish':
                query_str = 'UPDATE posts SET status = \'published\', updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1)';
                values = [postIds];
                break;
            case 'draft':
                query_str = 'UPDATE posts SET status = \'draft\', updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1)';
                values = [postIds];
                break;
            case 'delete':
                if (userRole === 'admin') {
                    query_str = 'DELETE FROM posts WHERE id = ANY($1)';
                    values = [postIds];
                }
                else {
                    query_str = 'DELETE FROM posts WHERE id = ANY($1) AND author_id = $2';
                    values = [postIds, userId];
                }
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        await (0, database_1.query)(query_str, values);
        res.json({ message: `Bulk ${action} completed successfully` });
    }
    catch (error) {
        console.error('Bulk action error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map