"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const slug_1 = require("../utils/slug");
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search, category, tag, featured } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const domain = req.domain;
        let whereClause = "WHERE 1=1";
        const params = [];
        let paramCount = 0;
        if (domain && domain.id) {
            whereClause += ` AND (p.domain_id = $${++paramCount} OR p.domain_id IS NULL)`;
            params.push(domain.id);
        }
        if (search) {
            whereClause += ` AND (p.title ILIKE $${++paramCount} OR p.excerpt ILIKE $${paramCount} OR p.content ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }
        if (category) {
            whereClause += ` AND c.slug = $${++paramCount}`;
            params.push(category);
        }
        if (tag) {
            whereClause += ` AND EXISTS (
        SELECT 1 FROM post_tags pt 
        JOIN tags t ON pt.tag_id = t.id 
        WHERE pt.post_id = p.id AND t.slug = $${++paramCount}
      )`;
            params.push(tag);
        }
        if (featured !== undefined) {
            whereClause += ` AND p.featured = $${++paramCount}`;
            params.push(String(featured) === 'true');
        }
        whereClause += ` AND p.status = 'published'`;
        const postsQuery = `
      SELECT 
        p.id, p.title, p.slug, p.excerpt, p.content, p.featured_image, p.featured,
        p.created_at, p.updated_at, p.view_count,
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
      AND p.status = 'published'
      GROUP BY p.id, c.name, c.slug, u.first_name, u.last_name, u.email
      ORDER BY p.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
        params.push(limit, offset);
        const countQuery = `
      SELECT COUNT(DISTINCT p.id)
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
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
        console.error('Get posts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const domain = req.domain;
        const params = [slug];
        let domainFilter = '';
        if (domain && domain.id) {
            domainFilter = ' AND (p.domain_id = $2 OR p.domain_id IS NULL)';
            params.push(domain.id);
        }
        const postQuery = `
      SELECT
        p.*,
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
      WHERE p.slug = $1 AND p.status = 'published'${domainFilter}
      GROUP BY p.id, c.name, c.slug, u.first_name, u.last_name, u.email
    `;
        const result = await (0, database_1.query)(postQuery, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = result.rows[0];
        await (0, database_1.query)('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [post.id]);
        post.view_count = post.view_count + 1;
        const relatedQuery = `
      SELECT id, title, slug, excerpt, featured_image, created_at
      FROM posts 
      WHERE status = 'published' 
        AND id != $1 
        AND (category_id = $2 OR category_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 3
    `;
        const relatedResult = await (0, database_1.query)(relatedQuery, [post.id, post.category_id]);
        res.json({
            data: post,
            post,
            relatedPosts: relatedResult.rows
        });
    }
    catch (error) {
        console.error('Get post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/', auth_1.authenticateToken, auth_1.requireAuthor, (0, validation_1.validate)(validation_1.createPostSchema), async (req, res) => {
    try {
        const postData = req.body;
        const authorId = req.user?.userId;
        if (!postData.slug) {
            const existingSlugs = await (0, database_1.query)('SELECT slug FROM posts WHERE slug LIKE $1', [`${(0, slug_1.generateSlug)(postData.title)}%`]);
            postData.slug = (0, slug_1.generateUniqueSlug)(postData.title, existingSlugs.rows.map(row => row.slug));
        }
        else {
            const existingSlug = await (0, database_1.query)('SELECT id FROM posts WHERE slug = $1', [postData.slug]);
            if (existingSlug.rows.length > 0) {
                return res.status(400).json({ error: 'Slug already exists' });
            }
        }
        const insertQuery = `
      INSERT INTO posts (
        title, slug, excerpt, content, featured_image, status, category_id, 
        author_id, meta_title, meta_description, seo_indexed, scheduled_at, featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
        const values = [
            postData.title,
            postData.slug,
            postData.excerpt,
            postData.content,
            postData.featured_image,
            postData.status || 'draft',
            postData.category_id,
            authorId,
            postData.meta_title,
            postData.meta_description,
            postData.seo_indexed !== false,
            postData.scheduled_at,
            postData.featured || false
        ];
        const result = await (0, database_1.query)(insertQuery, values);
        const newPost = result.rows[0];
        if (postData.tags && postData.tags.length > 0) {
            await handlePostTags(newPost.id, postData.tags);
        }
        res.status(201).json({
            message: 'Post created successfully',
            data: newPost
        });
    }
    catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireAuthor, (0, validation_1.validate)(validation_1.updatePostSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const postData = req.body;
        const userId = req.user?.userId;
        const existingPost = await (0, database_1.query)('SELECT * FROM posts WHERE id = $1', [id]);
        if (existingPost.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = existingPost.rows[0];
        if (req.user?.role !== 'admin' && post.author_id !== userId) {
            return res.status(403).json({ error: 'You can only edit your own posts' });
        }
        if (postData.slug && postData.slug !== post.slug) {
            const existingSlug = await (0, database_1.query)('SELECT id FROM posts WHERE slug = $1 AND id != $2', [postData.slug, id]);
            if (existingSlug.rows.length > 0) {
                return res.status(400).json({ error: 'Slug already exists' });
            }
        }
        const updateQuery = `
      UPDATE posts SET 
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        excerpt = COALESCE($3, excerpt),
        content = COALESCE($4, content),
        featured_image = COALESCE($5, featured_image),
        status = COALESCE($6, status),
        category_id = COALESCE($7, category_id),
        meta_title = COALESCE($8, meta_title),
        meta_description = COALESCE($9, meta_description),
        seo_indexed = COALESCE($10, seo_indexed),
        scheduled_at = COALESCE($11, scheduled_at),
        featured = COALESCE($12, featured),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `;
        const values = [
            postData.title,
            postData.slug,
            postData.excerpt,
            postData.content,
            postData.featured_image,
            postData.status,
            postData.category_id,
            postData.meta_title,
            postData.meta_description,
            postData.seo_indexed,
            postData.scheduled_at,
            postData.featured,
            id
        ];
        const result = await (0, database_1.query)(updateQuery, values);
        const updatedPost = result.rows[0];
        if (postData.tags !== undefined) {
            await handlePostTags(parseInt(id), postData.tags);
        }
        res.json({
            message: 'Post updated successfully',
            data: updatedPost
        });
    }
    catch (error) {
        console.error('Update post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireAuthor, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const existingPost = await (0, database_1.query)('SELECT * FROM posts WHERE id = $1', [id]);
        if (existingPost.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = existingPost.rows[0];
        if (req.user?.role !== 'admin' && post.author_id !== userId) {
            return res.status(403).json({ error: 'You can only delete your own posts' });
        }
        await (0, database_1.query)('DELETE FROM posts WHERE id = $1', [id]);
        res.json({ message: 'Post deleted successfully' });
    }
    catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
async function handlePostTags(postId, tags) {
    await (0, database_1.query)('DELETE FROM post_tags WHERE post_id = $1', [postId]);
    if (tags.length === 0)
        return;
    for (const tagName of tags) {
        const tagSlug = (0, slug_1.generateSlug)(tagName);
        let tagResult = await (0, database_1.query)('SELECT id FROM tags WHERE slug = $1', [tagSlug]);
        if (tagResult.rows.length === 0) {
            tagResult = await (0, database_1.query)('INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id', [tagName, tagSlug]);
        }
        const tagId = tagResult.rows[0].id;
        await (0, database_1.query)('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, tagId]);
    }
}
exports.default = router;
//# sourceMappingURL=posts.js.map