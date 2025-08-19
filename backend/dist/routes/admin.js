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