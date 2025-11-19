import express from 'express';
import { Request, Response } from 'express';
import { query } from '../utils/database';
import { authenticateToken, requireEditor } from '../middleware/auth';
import { validate, createCategorySchema, updateCategorySchema } from '../middleware/validation';
import { generateSlug, generateUniqueSlug } from '../utils/slug';
import { CreateCategoryData, UpdateCategoryData } from '../types';

const router = express.Router();

// Get all categories (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Extract query parameters
    const {
      page = 1,
      limit,
      search,
      sort = 'name',
      order = 'asc'
    } = req.query;

    // Get domain context from request (set by middleware)
    const domain = (req as any).domain;
    const params: any[] = [];
    let paramCount = 0;

    // Build WHERE clause for domain filtering
    let whereConditions: string[] = [];
    if (domain && domain.id) {
      whereConditions.push(`(c.domain_id = $${++paramCount} OR c.domain_id IS NULL)`);
      params.push(domain.id);
    }

    // Add search filter
    if (search) {
      whereConditions.push(`(c.name ILIKE $${++paramCount} OR c.description ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Build JOIN condition for post count
    let joinCondition = "c.id = p.category_id AND p.status = 'published'";
    if (domain && domain.id) {
      joinCondition += ' AND (p.domain_id = c.domain_id OR p.domain_id IS NULL)';
    }

    // Validate sort field
    const validSortFields = ['name', 'post_count', 'created_at'];
    const sortField = validSortFields.includes(sort as string) ? sort as string : 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Build query
    let categoriesQuery = `
      SELECT
        c.*,
        COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON ${joinCondition}
      ${whereClause}
      GROUP BY c.id
      ORDER BY ${sortField === 'post_count' ? 'post_count' : `c.${sortField}`} ${sortOrder}
    `;

    // Add pagination if limit is provided
    if (limit) {
      const offset = (Number(page) - 1) * Number(limit);
      categoriesQuery += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      params.push(Number(limit), offset);
    }

    const result = await query(categoriesQuery, params);

    // If pagination is used, get total count
    if (limit) {
      let countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
        FROM categories c
        ${whereClause}
      `;
      // Remove pagination params (limit and offset) for count query
      const countParams = params.slice(0, params.length - 2);
      const countResult = await query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalCount / Number(limit));

      return res.json({
        data: result.rows,
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

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single category with posts (public)
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    // Get category
    const categoryQuery = `
      SELECT c.*, COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON c.id = p.category_id AND p.status = 'published'
      WHERE c.slug = $1
      GROUP BY c.id
    `;

    const categoryResult = await query(categoryQuery, [slug]);

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = categoryResult.rows[0];

    // Get posts in category
    const postsQuery = `
      SELECT 
        p.id, p.title, p.slug, p.excerpt, p.featured_image, p.created_at,
        p.view_count, p.featured,
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
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.category_id = $1 AND p.status = 'published'
      GROUP BY p.id, u.first_name, u.last_name, u.email
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const postsResult = await query(postsQuery, [category.id, limit, offset]);

    // Get total count for pagination
    const countResult = await query(
      'SELECT COUNT(*) FROM posts WHERE category_id = $1 AND status = $2',
      [category.id, 'published']
    );

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / Number(limit));

    res.json({
      category,
      posts: postsResult.rows,
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
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category (admin only)
router.post('/', authenticateToken, requireEditor, validate(createCategorySchema), async (req: Request, res: Response) => {
  try {
    const categoryData: CreateCategoryData = req.body;

    // Generate slug if not provided
    if (!categoryData.slug) {
      const existingSlugs = await query('SELECT slug FROM categories WHERE slug LIKE $1', [`${generateSlug(categoryData.name)}%`]);
      categoryData.slug = generateUniqueSlug(categoryData.name, existingSlugs.rows.map(row => row.slug));
    } else {
      // Check if slug already exists
      const existingSlug = await query('SELECT id FROM categories WHERE slug = $1', [categoryData.slug]);
      if (existingSlug.rows.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    const insertQuery = `
      INSERT INTO categories (name, slug, description, seo_indexed)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [
      categoryData.name,
      categoryData.slug,
      categoryData.description,
      categoryData.seo_indexed !== false
    ];

    const result = await query(insertQuery, values);
    const newCategory = result.rows[0];

    res.status(201).json({
      message: 'Category created successfully',
      data: newCategory
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category (admin only)
router.put('/:id', authenticateToken, requireEditor, validate(updateCategorySchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryData: UpdateCategoryData = req.body;

    // Check if category exists
    const existingCategory = await query('SELECT * FROM categories WHERE id = $1', [id]);
    if (existingCategory.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = existingCategory.rows[0];

    // Handle slug update
    if (categoryData.slug && categoryData.slug !== category.slug) {
      const existingSlug = await query('SELECT id FROM categories WHERE slug = $1 AND id != $2', [categoryData.slug, id]);
      if (existingSlug.rows.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    const updateQuery = `
      UPDATE categories SET 
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        description = COALESCE($3, description),
        seo_indexed = COALESCE($4, seo_indexed)
      WHERE id = $5
      RETURNING *
    `;

    const values = [
      categoryData.name,
      categoryData.slug,
      categoryData.description,
      categoryData.seo_indexed,
      id
    ];

    const result = await query(updateQuery, values);
    const updatedCategory = result.rows[0];

    res.json({
      message: 'Category updated successfully',
      data: updatedCategory
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category (admin only)
router.delete('/:id', authenticateToken, requireEditor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const existingCategory = await query('SELECT * FROM categories WHERE id = $1', [id]);
    if (existingCategory.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has posts
    const postsCount = await query('SELECT COUNT(*) FROM posts WHERE category_id = $1', [id]);
    const postCount = parseInt(postsCount.rows[0].count);

    if (postCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with existing posts',
        postCount
      });
    }

    await query('DELETE FROM categories WHERE id = $1', [id]);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 