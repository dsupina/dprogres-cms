import express from 'express';
import { Request, Response } from 'express';
import { query, getClient } from '../utils/database';
import { authenticateToken, requireAuthor } from '../middleware/auth';
import { validate, createPostSchema, updatePostSchema } from '../middleware/validation';
import { generateSlug, generateUniqueSlug } from '../utils/slug';
import { Post, CreatePostData, UpdatePostData, QueryParams } from '../types';
import { getContentBlocks, saveContentBlocks, collectMissingBlockFields } from '../utils/contentBlocks';
import { renderBlocksToHtml } from '../utils/blockRendering';
import type { BlockNode } from '../types/content';

const router = express.Router();

// Get all published posts (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      tag,
      featured
    } = req.query as QueryParams;

    const offset = (Number(page) - 1) * Number(limit);

    // Get domain context from request (set by middleware)
    const domain = (req as any).domain;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    let paramCount = 0;

    // Filter by domain if domain context exists
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

    // Ensure public list shows only published posts
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
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single post by slug (public)
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Get domain context from request (set by middleware)
    const domain = (req as any).domain;
    const params: any[] = [slug];

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
        ) as tags,
        EXISTS (
          SELECT 1 FROM content_blocks cb
          WHERE cb.entity_type = 'post' AND cb.entity_id = p.id
        ) as has_blocks
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.slug = $1 AND p.status = 'published'${domainFilter}
      GROUP BY p.id, c.name, c.slug, u.first_name, u.last_name, u.email
    `;

    const result = await query(postQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = result.rows[0];
    const blocks = await getContentBlocks('post', post.id);
    const missingBlockFields = blocks.length > 0 ? collectMissingBlockFields(blocks) : [];
    const postWithBlocks = { ...post, blocks, missingBlockFields };

    // Increment view count
    await query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [post.id]);
    postWithBlocks.view_count = post.view_count + 1;

    // Get related posts
    const relatedQuery = `
      SELECT id, title, slug, excerpt, featured_image, created_at
      FROM posts 
      WHERE status = 'published' 
        AND id != $1 
        AND (category_id = $2 OR category_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 3
    `;

    const relatedResult = await query(relatedQuery, [post.id, post.category_id]);

    // Keep backward compatibility returning both shapes
    res.json({
      data: postWithBlocks,
      post: postWithBlocks,
      relatedPosts: relatedResult.rows
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create post (admin only)
router.post('/', authenticateToken, requireAuthor, validate(createPostSchema), async (req: Request, res: Response) => {
  try {
    const postData: CreatePostData = req.body;
    const authorId = req.user?.userId;

    // Generate slug if not provided
    if (!postData.slug) {
      const existingSlugs = await query('SELECT slug FROM posts WHERE slug LIKE $1', [`${generateSlug(postData.title)}%`]);
      postData.slug = generateUniqueSlug(postData.title, existingSlugs.rows.map(row => row.slug));
    } else {
      // Check if slug already exists
      const existingSlug = await query('SELECT id FROM posts WHERE slug = $1', [postData.slug]);
      if (existingSlug.rows.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    const client = await getClient();
    let newPost;
    const blocks = Array.isArray((postData as any).blocks) ? (postData as any).blocks as BlockNode[] : undefined;
    const htmlContent = blocks ? renderBlocksToHtml(blocks) : postData.content;

    try {
      await client.query('BEGIN');

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
        htmlContent ?? null,
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

      const result = await client.query(insertQuery, values);
      newPost = result.rows[0];

      if (blocks) {
        await saveContentBlocks('post', newPost.id, blocks, client);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (postData.tags && postData.tags.length > 0 && newPost) {
      await handlePostTags(newPost.id, postData.tags);
    }

    const missingBlockFields = blocks ? collectMissingBlockFields(blocks) : [];

    res.status(201).json({
      message: 'Post created successfully',
      data: {
        ...newPost,
        content: htmlContent ?? null,
        blocks: blocks || null,
        missingBlockFields
      }
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update post (admin only)
router.put('/:id', authenticateToken, requireAuthor, validate(updatePostSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const postData: UpdatePostData = req.body;
    const userId = req.user?.userId;

    // Check if post exists and user has permission
    const existingPost = await query('SELECT * FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = existingPost.rows[0];

    // Check if user can edit this post
    if (req.user?.role !== 'admin' && post.author_id !== userId) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    // Handle slug update
    if (postData.slug && postData.slug !== post.slug) {
      const existingSlug = await query('SELECT id FROM posts WHERE slug = $1 AND id != $2', [postData.slug, id]);
      if (existingSlug.rows.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    const rawBlocks = (postData as any).blocks as BlockNode[] | undefined;
    const hasBlocksPayload = Object.prototype.hasOwnProperty.call(postData, 'blocks');
    const blocks = hasBlocksPayload ? (rawBlocks || []) : undefined;
    const htmlContent = hasBlocksPayload ? renderBlocksToHtml(blocks || []) : postData.content;
    const contentValue = hasBlocksPayload ? (htmlContent ?? '') : (typeof postData.content === 'undefined' ? null : postData.content);

    const client = await getClient();
    let updatedPost;

    try {
      await client.query('BEGIN');

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
        contentValue,
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

      const result = await client.query(updateQuery, values);
      updatedPost = result.rows[0];

      if (hasBlocksPayload) {
        await saveContentBlocks('post', Number(id), blocks || [], client);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (postData.tags !== undefined) {
      await handlePostTags(parseInt(id, 10), postData.tags);
    }

    const responseBlocks = hasBlocksPayload
      ? blocks || []
      : await getContentBlocks('post', Number(id));
    const missingBlockFields = responseBlocks.length > 0 ? collectMissingBlockFields(responseBlocks) : [];

    res.json({
      message: 'Post updated successfully',
      data: {
        ...updatedPost,
        content: hasBlocksPayload ? htmlContent ?? '' : updatedPost.content,
        blocks: responseBlocks,
        missingBlockFields
      }
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete post (admin only)
router.delete('/:id', authenticateToken, requireAuthor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Check if post exists and user has permission
    const existingPost = await query('SELECT * FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = existingPost.rows[0];

    // Check if user can delete this post
    if (req.user?.role !== 'admin' && post.author_id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await query('DELETE FROM posts WHERE id = $1', [id]);

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to handle post tags
async function handlePostTags(postId: number, tags: string[]) {
  // Remove existing tags
  await query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

  if (tags.length === 0) return;

  // Process each tag
  for (const tagName of tags) {
    const tagSlug = generateSlug(tagName);
    
    // Create tag if it doesn't exist
    let tagResult = await query('SELECT id FROM tags WHERE slug = $1', [tagSlug]);
    
    if (tagResult.rows.length === 0) {
      tagResult = await query(
        'INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id',
        [tagName, tagSlug]
      );
    }

    const tagId = tagResult.rows[0].id;

    // Link tag to post
    await query(
      'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [postId, tagId]
    );
  }
}

export default router; 