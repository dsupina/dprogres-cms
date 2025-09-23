import express from 'express';
import { Request, Response } from 'express';
import { query } from '../utils/database';
import { authenticateToken, requireEditor } from '../middleware/auth';
import { validate, createPageSchema, updatePageSchema } from '../middleware/validation';
import { generateSlug, generateUniqueSlug } from '../utils/slug';
import { CreatePageData, UpdatePageData } from '../types';

const router = express.Router();

// Get all published pages (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get domain context from request (set by middleware)
    const domain = (req as any).domain;
    const params: any[] = [];

    let domainFilter = '';
    if (domain && domain.id) {
      domainFilter = ' AND (domain_id = $1 OR domain_id IS NULL)';
      params.push(domain.id);
    }

    const pagesQuery = `
      SELECT id, title, slug, template, created_at, updated_at
      FROM pages
      WHERE published = true${domainFilter}
      ORDER BY title ASC
    `;

    const result = await query(pagesQuery, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Get pages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single page by slug (public)
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Get domain context from request (set by middleware)
    const domain = (req as any).domain;
    const params: any[] = [slug];

    let domainFilter = '';
    if (domain && domain.id) {
      domainFilter = ' AND (domain_id = $2 OR domain_id IS NULL)';
      params.push(domain.id);
    }

    const pageQuery = `
      SELECT * FROM pages
      WHERE slug = $1 AND published = true${domainFilter}
    `;

    const result = await query(pageQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const page = result.rows[0];
    res.json({ page });
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create page (admin only)
router.post('/', authenticateToken, requireEditor, validate(createPageSchema), async (req: Request, res: Response) => {
  try {
    const pageData: CreatePageData = req.body;

    // Generate slug if not provided
    if (!pageData.slug) {
      const existingSlugs = await query('SELECT slug FROM pages WHERE slug LIKE $1', [`${generateSlug(pageData.title)}%`]);
      pageData.slug = generateUniqueSlug(pageData.title, existingSlugs.rows.map(row => row.slug));
    } else {
      // Check if slug already exists
      const existingSlug = await query('SELECT id FROM pages WHERE slug = $1', [pageData.slug]);
      if (existingSlug.rows.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    // Get domain from request context
    const domain = (req as any).domain;

    const insertQuery = `
      INSERT INTO pages (
        title, slug, content, template, meta_title, meta_description,
        seo_indexed, published, domain_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      pageData.title,
      pageData.slug,
      pageData.content,
      pageData.template,
      pageData.meta_title,
      pageData.meta_description,
      pageData.seo_indexed !== false,
      pageData.published || false,
      domain ? domain.id : null
    ];

    const result = await query(insertQuery, values);
    const newPage = result.rows[0];

    res.status(201).json({
      message: 'Page created successfully',
      data: newPage
    });
  } catch (error) {
    console.error('Create page error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update page (admin only)
router.put('/:id', authenticateToken, requireEditor, validate(updatePageSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pageData: UpdatePageData = req.body;

    // Check if page exists
    const existingPage = await query('SELECT * FROM pages WHERE id = $1', [id]);
    if (existingPage.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const page = existingPage.rows[0];

    // Handle slug update
    if (pageData.slug && pageData.slug !== page.slug) {
      const existingSlug = await query('SELECT id FROM pages WHERE slug = $1 AND id != $2', [pageData.slug, id]);
      if (existingSlug.rows.length > 0) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    const updateQuery = `
      UPDATE pages SET
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        content = COALESCE($3, content),
        template = COALESCE($4, template),
        meta_title = COALESCE($5, meta_title),
        meta_description = COALESCE($6, meta_description),
        seo_indexed = COALESCE($7, seo_indexed),
        published = COALESCE($8, published),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `;

    const values = [
      pageData.title,
      pageData.slug,
      pageData.content,
      pageData.template,
      pageData.meta_title,
      pageData.meta_description,
      pageData.seo_indexed,
      pageData.published,
      id
    ];

    const result = await query(updateQuery, values);
    const updatedPage = result.rows[0];

    res.json({
      message: 'Page updated successfully',
      data: updatedPage
    });
  } catch (error) {
    console.error('Update page error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete page (admin only)
router.delete('/:id', authenticateToken, requireEditor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if page exists
    const existingPage = await query('SELECT * FROM pages WHERE id = $1', [id]);
    if (existingPage.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    await query('DELETE FROM pages WHERE id = $1', [id]);

    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Delete page error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 