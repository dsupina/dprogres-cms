import express from 'express';
import { Request, Response } from 'express';
import { query } from '../utils/database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All admin routes require authentication
router.use(authenticateToken);

// Admin dashboard stats
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // Only admin and editor can access dashboard
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get total counts
    const [postsResult, pagesResult, categoriesResult, usersResult] = await Promise.all([
      query('SELECT COUNT(*) as count FROM posts'),
      query('SELECT COUNT(*) as count FROM pages'),
      query('SELECT COUNT(*) as count FROM categories'),
      query('SELECT COUNT(*) as count FROM users')
    ]);

    // Get recent posts
    const recentPostsResult = await query(
      'SELECT p.id, p.title, p.status, p.created_at, u.first_name, u.last_name FROM posts p LEFT JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT 5'
    );

    // Get posts by status
    const postsByStatusResult = await query(
      'SELECT status, COUNT(*) as count FROM posts GROUP BY status'
    );

    const postsByStatus: { [key: string]: number } = {};
    postsByStatusResult.rows.forEach((row) => {
      postsByStatus[row.status] = parseInt(row.count);
    });

    // Get popular posts (by view count)
    const popularPostsResult = await query(
      'SELECT p.id, p.title, p.view_count, p.created_at FROM posts p WHERE p.status = \'published\' ORDER BY p.view_count DESC LIMIT 5'
    );

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
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin only)
router.get('/users', async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can view users' });
    }

    const result = await query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role (admin only)
router.put('/users/:id/role', async (req: Request, res: Response) => {
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

    const result = await query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, role',
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User role updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can delete users' });
    }

    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk actions for posts
router.post('/posts/bulk', async (req: Request, res: Response) => {
  try {
    const { action, postIds } = req.body;

    if (!action || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ error: 'Action and post IDs are required' });
    }

    const userId = req.user?.userId;
    const userRole = req.user?.role;

    let query_str = '';
    let values: any[] = [];

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
        // Only admin can delete, or author can delete their own posts
        if (userRole === 'admin') {
          query_str = 'DELETE FROM posts WHERE id = ANY($1)';
          values = [postIds];
        } else {
          query_str = 'DELETE FROM posts WHERE id = ANY($1) AND author_id = $2';
          values = [postIds, userId];
        }
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    await query(query_str, values);

    res.json({ message: `Bulk ${action} completed successfully` });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 