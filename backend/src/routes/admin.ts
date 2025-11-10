import express from 'express';
import { Request, Response } from 'express';
import { query } from '../utils/database';
import { authenticateToken } from '../middleware/auth';
import {
  listPublishingTargets,
  getPublishingTargetById,
  createPublishingTarget,
  updatePublishingTarget,
  deletePublishingTarget,
  listPublishingSchedules,
  createPublishingSchedule,
  removePublishingSchedule,
  getDistributionMetrics,
  getDistributionQueue,
} from '../db/distribution';
import DistributionService from '../services/DistributionService';

const router = express.Router();
const distributionService = new DistributionService();

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

// Admin posts endpoint - returns ALL posts (including drafts)
router.get('/posts', async (req: Request, res: Response) => {
  try {
    // Only admin and editor can access all posts
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      page = 1,
      limit = 10,
      search,
      status,
      category,
      author
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    let paramCount = 0;

    // If not admin, only show user's own posts
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
      query(postsQuery, params),
      query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
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
  } catch (error) {
    console.error('Admin get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single post by ID (admin edit view)
router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const result = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM posts p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Admin get post by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin categories endpoint - returns ALL categories with counts
router.get('/categories', async (req: Request, res: Response) => {
  try {
    // Only admin and editor can access all categories
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

    const result = await query(categoriesQuery);
    
    res.json({
      data: result.rows
    });
  } catch (error) {
    console.error('Admin get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin pages endpoint - returns ALL pages (including unpublished)
router.get('/pages', async (req: Request, res: Response) => {
  try {
    // Only admin and editor can access all pages
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      page = 1,
      limit = 10,
      search,
      template,
      published
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = "WHERE 1=1";
    const params: any[] = [];
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
      query(pagesQuery, params),
      query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
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
  } catch (error) {
    console.error('Admin get pages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single page by ID (admin edit view)
router.get('/pages/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const result = await query(
      `SELECT * FROM pages WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Admin get page by id error:', error);
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

// Distribution targets
router.get('/distribution/targets', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const targets = await listPublishingTargets();
    res.json({ data: targets });
  } catch (error) {
    console.error('List publishing targets error:', error);
    res.status(500).json({ error: 'Failed to load publishing targets' });
  }
});

router.post('/distribution/targets', async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create publishing targets' });
    }

    const { name, channel, credentials, default_payload, is_active, rate_limit_per_hour } = req.body;
    if (!name || !channel) {
      return res.status(400).json({ error: 'Name and channel are required' });
    }

    const target = await createPublishingTarget({
      name,
      channel,
      credentials,
      default_payload,
      is_active,
      rate_limit_per_hour,
    });

    res.status(201).json({ data: target });
  } catch (error: any) {
    console.error('Create publishing target error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'A target with that name and channel already exists' });
    }
    res.status(500).json({ error: 'Failed to create publishing target' });
  }
});

router.put('/distribution/targets/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const targetId = Number(req.params.id);
    if (Number.isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid target id' });
    }

    const updated = await updatePublishingTarget(targetId, req.body || {});
    if (!updated) {
      return res.status(404).json({ error: 'Publishing target not found' });
    }

    res.json({ data: updated });
  } catch (error) {
    console.error('Update publishing target error:', error);
    res.status(500).json({ error: 'Failed to update publishing target' });
  }
});

router.delete('/distribution/targets/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete publishing targets' });
    }

    const targetId = Number(req.params.id);
    if (Number.isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid target id' });
    }

    const deleted = await deletePublishingTarget(targetId);
    if (!deleted) {
      return res.status(404).json({ error: 'Publishing target not found' });
    }

    res.json({ message: 'Publishing target deleted' });
  } catch (error) {
    console.error('Delete publishing target error:', error);
    res.status(500).json({ error: 'Failed to delete publishing target' });
  }
});

// Publishing schedules
router.get('/distribution/schedules', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const postId = req.query.postId ? Number(req.query.postId) : undefined;
    const status = req.query.status as any;
    const schedules = await listPublishingSchedules({
      postId: postId && !Number.isNaN(postId) ? postId : undefined,
      status,
    });

    res.json({ data: schedules });
  } catch (error) {
    console.error('List publishing schedules error:', error);
    res.status(500).json({ error: 'Failed to load publishing schedules' });
  }
});

router.post('/distribution/schedules', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { post_id, postId, target_id, targetId, scheduled_for, scheduledFor, status, options } = req.body;
    const resolvedPostId = Number(post_id ?? postId);
    const resolvedTargetId = Number(target_id ?? targetId);
    const resolvedDate = scheduled_for ?? scheduledFor;

    if (!resolvedPostId || Number.isNaN(resolvedPostId)) {
      return res.status(400).json({ error: 'postId is required' });
    }

    if (!resolvedTargetId || Number.isNaN(resolvedTargetId)) {
      return res.status(400).json({ error: 'targetId is required' });
    }

    if (!resolvedDate) {
      return res.status(400).json({ error: 'scheduledFor is required' });
    }

    const when = new Date(resolvedDate);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled date' });
    }

    const schedule = await createPublishingSchedule({
      post_id: resolvedPostId,
      target_id: resolvedTargetId,
      scheduled_for: when,
      status,
      options,
    });

    res.status(201).json({ data: schedule });
  } catch (error) {
    console.error('Create publishing schedule error:', error);
    res.status(500).json({ error: 'Failed to create publishing schedule' });
  }
});

router.delete('/distribution/schedules/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scheduleId = Number(req.params.id);
    if (Number.isNaN(scheduleId)) {
      return res.status(400).json({ error: 'Invalid schedule id' });
    }

    const removed = await removePublishingSchedule(scheduleId);
    if (!removed) {
      return res.status(404).json({ error: 'Publishing schedule not found' });
    }

    res.json({ message: 'Publishing schedule removed' });
  } catch (error) {
    console.error('Delete publishing schedule error:', error);
    res.status(500).json({ error: 'Failed to remove publishing schedule' });
  }
});

router.post('/distribution/schedules/:id/dispatch', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scheduleId = Number(req.params.id);
    if (Number.isNaN(scheduleId)) {
      return res.status(400).json({ error: 'Invalid schedule id' });
    }

    const { requestAiAssets, customMessage } = req.body || {};
    const result = await distributionService.dispatchSchedule(scheduleId, { requestAiAssets, customMessage });

    res.json({ data: result });
  } catch (error) {
    console.error('Dispatch schedule error:', error);
    res.status(500).json({ error: 'Failed to dispatch schedule' });
  }
});

router.post('/distribution/dispatch', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { postId, targetIds, requestAiAssets = true, customMessage } = req.body;
    const resolvedPostId = Number(postId);
    const ids: number[] = Array.isArray(targetIds) ? targetIds.map((id: any) => Number(id)).filter((id: number) => !Number.isNaN(id)) : [];

    if (!resolvedPostId || Number.isNaN(resolvedPostId)) {
      return res.status(400).json({ error: 'postId is required' });
    }

    if (!ids.length) {
      return res.status(400).json({ error: 'At least one targetId is required' });
    }

    const dispatches = await Promise.all(
      ids.map(async (targetId) => {
        const target = await getPublishingTargetById(targetId);
        if (!target || !target.is_active) {
          return { targetId, error: 'Target inactive or missing' };
        }
        try {
          const result = await distributionService.dispatchImmediate(resolvedPostId, targetId, { requestAiAssets, customMessage });
          return { targetId, result };
        } catch (error: any) {
          return { targetId, error: error.message || 'Dispatch failed' };
        }
      })
    );

    res.json({ data: dispatches });
  } catch (error) {
    console.error('Immediate dispatch error:', error);
    res.status(500).json({ error: 'Failed to dispatch targets' });
  }
});

// Distribution metrics and queue
router.get('/distribution/metrics', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor', 'author'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const postId = req.query.postId ? Number(req.query.postId) : undefined;
    const metrics = await getDistributionMetrics({ postId: postId && !Number.isNaN(postId) ? postId : undefined });

    res.json({ data: metrics });
  } catch (error) {
    console.error('Distribution metrics error:', error);
    res.status(500).json({ error: 'Failed to load distribution metrics' });
  }
});

router.get('/distribution/queue', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const queue = await getDistributionQueue(Number.isNaN(limit) ? 50 : limit);
    res.json({ data: queue });
  } catch (error) {
    console.error('Distribution queue error:', error);
    res.status(500).json({ error: 'Failed to load distribution queue' });
  }
});

router.post('/distribution/logs/:id/feedback', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logId = Number(req.params.id);
    if (Number.isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log id' });
    }

    const feedback = req.body?.feedback ?? req.body;
    if (!feedback || typeof feedback !== 'object') {
      return res.status(400).json({ error: 'Feedback payload is required' });
    }

    const updated = await distributionService.updateFeedback(logId, feedback);
    if (!updated) {
      return res.status(404).json({ error: 'Distribution log not found' });
    }

    res.json({ data: updated });
  } catch (error) {
    console.error('Distribution feedback error:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

router.post('/distribution/logs/:id/retry', async (req: Request, res: Response) => {
  try {
    if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logId = Number(req.params.id);
    if (Number.isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log id' });
    }

    const dispatchNow = req.body?.dispatch !== false;
    const retryLog = await distributionService.resendFromLog(logId, dispatchNow);
    if (!retryLog) {
      return res.status(404).json({ error: 'Distribution log not found' });
    }

    res.json({ data: retryLog });
  } catch (error) {
    console.error('Distribution retry error:', error);
    res.status(500).json({ error: 'Failed to retry distribution' });
  }
});

export default router;