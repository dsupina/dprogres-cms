import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createMenuItemSchema = Joi.object({
  domain_id: Joi.number().integer().positive().optional(), // Legacy support
  site_id: Joi.number().integer().positive().optional(), // New field
  parent_id: Joi.number().integer().positive().allow(null).optional(),
  label: Joi.string().min(1).max(255).required(),
  url: Joi.string().uri().max(500).allow(null, '').optional(),
  page_id: Joi.number().integer().positive().allow(null).optional(),
  position: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional()
}).custom((value, helpers) => {
  // Require either domain_id or site_id
  if (!value.domain_id && !value.site_id) {
    return helpers.error('any.required', { message: 'Either domain_id or site_id is required' });
  }
  return value;
});

const updateMenuItemSchema = Joi.object({
  label: Joi.string().min(1).max(255).optional(),
  url: Joi.string().uri().max(500).allow(null, '').optional(),
  page_id: Joi.number().integer().positive().allow(null).optional(),
  position: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
  parent_id: Joi.number().integer().positive().allow(null).optional()
});

const reorderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id: Joi.number().integer().positive().required(),
      position: Joi.number().integer().min(0).required(),
      parent_id: Joi.number().integer().positive().allow(null).required()
    })
  ).required()
});

// Get menu items for a site
router.get('/site/:siteId', async (req: Request, res: Response) => {
  try {
    const siteId = parseInt(req.params.siteId);

    if (isNaN(siteId)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }

    const result = await pool.query(
      `SELECT
        mi.*,
        p.title as page_title,
        p.slug as page_slug
      FROM menu_items mi
      LEFT JOIN pages p ON mi.page_id = p.id
      WHERE mi.site_id = $1
      ORDER BY mi.parent_id NULLS FIRST, mi.position ASC`,
      [siteId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching site menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Get menu tree for a site (public endpoint)
router.get('/site/:siteId/tree', async (req: Request, res: Response) => {
  try {
    const siteId = parseInt(req.params.siteId);

    if (isNaN(siteId)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }

    const result = await pool.query(
      `WITH RECURSIVE menu_tree AS (
        SELECT
          mi.*,
          p.title as page_title,
          p.slug as page_slug,
          0 as level
        FROM menu_items mi
        LEFT JOIN pages p ON mi.page_id = p.id
        WHERE mi.site_id = $1 AND mi.parent_id IS NULL AND mi.is_active = true

        UNION ALL

        SELECT
          mi.*,
          p.title as page_title,
          p.slug as page_slug,
          mt.level + 1
        FROM menu_items mi
        LEFT JOIN pages p ON mi.page_id = p.id
        INNER JOIN menu_tree mt ON mi.parent_id = mt.id
        WHERE mi.is_active = true AND mt.level < 3
      )
      SELECT * FROM menu_tree
      ORDER BY parent_id NULLS FIRST, position ASC`,
      [siteId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching site menu tree:', error);
    res.status(500).json({ error: 'Failed to fetch menu tree' });
  }
});

// Get menu items for a domain (legacy support)
router.get('/domain/:domainId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const domainId = parseInt(req.params.domainId);

    if (isNaN(domainId)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    const result = await pool.query(
      `SELECT
        mi.*,
        p.title as page_title,
        p.slug as page_slug
      FROM menu_items mi
      LEFT JOIN pages p ON mi.page_id = p.id
      WHERE mi.domain_id = $1
      ORDER BY mi.parent_id NULLS FIRST, mi.position ASC`,
      [domainId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Get menu tree for a domain (public endpoint)
router.get('/domain/:domainId/tree', async (req: Request, res: Response) => {
  try {
    const domainId = parseInt(req.params.domainId);

    if (isNaN(domainId)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    const result = await pool.query(
      `WITH RECURSIVE menu_tree AS (
        SELECT
          mi.*,
          p.title as page_title,
          p.slug as page_slug,
          0 as level
        FROM menu_items mi
        LEFT JOIN pages p ON mi.page_id = p.id
        WHERE mi.domain_id = $1 AND mi.parent_id IS NULL AND mi.is_active = true

        UNION ALL

        SELECT
          mi.*,
          p.title as page_title,
          p.slug as page_slug,
          mt.level + 1
        FROM menu_items mi
        LEFT JOIN pages p ON mi.page_id = p.id
        INNER JOIN menu_tree mt ON mi.parent_id = mt.id
        WHERE mi.is_active = true AND mt.level < 3
      )
      SELECT * FROM menu_tree
      ORDER BY parent_id NULLS FIRST, position ASC`,
      [domainId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching menu tree:', error);
    res.status(500).json({ error: 'Failed to fetch menu tree' });
  }
});

// Get single menu item
router.get('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid menu item ID' });
    }

    const result = await pool.query(
      'SELECT * FROM menu_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

// Create menu item
router.post('/',
  authenticateToken,
  requireAdmin,
  validateRequest(createMenuItemSchema),
  async (req: Request, res: Response) => {
    try {
      const { domain_id, parent_id, label, url, page_id, position, is_active } = req.body;

      // Validate domain exists
      const domainCheck = await pool.query(
        'SELECT id FROM domains WHERE id = $1',
        [domain_id]
      );

      if (domainCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Domain not found' });
      }

      // Validate parent exists if provided
      if (parent_id) {
        const parentResult = await pool.query(
          'SELECT id, depth FROM menu_items WHERE id = $1 AND domain_id = $2',
          [parent_id, domain_id]
        );

        if (parentResult.rows.length === 0) {
          return res.status(400).json({ error: 'Parent menu item not found' });
        }

        // Check depth limit (parent at depth 2 means child would be at depth 3, which is max)
        if (parentResult.rows[0].depth >= 2) {
          return res.status(400).json({ error: 'Maximum nesting depth (3 levels) reached' });
        }
      }

      // Get next position if not provided
      let finalPosition = position;
      if (finalPosition === undefined) {
        const posResult = await pool.query(
          'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM menu_items WHERE domain_id = $1 AND ($2::integer IS NULL AND parent_id IS NULL OR parent_id = $2)',
          [domain_id, parent_id]
        );
        finalPosition = posResult.rows[0].next_position;
      }

      // Insert menu item
      const result = await pool.query(
        `INSERT INTO menu_items (domain_id, parent_id, label, url, page_id, position, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [domain_id, parent_id || null, label, url || null, page_id || null, finalPosition, is_active !== false]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating menu item:', error);
      res.status(500).json({ error: 'Failed to create menu item' });
    }
  }
);

// Update menu item
router.put('/:id',
  authenticateToken,
  requireAdmin,
  validateRequest(updateMenuItemSchema),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid menu item ID' });
      }

      const { label, url, page_id, position, is_active, parent_id } = req.body;

      // Build update query dynamically
      const updates = [];
      const values = [];
      let valueIndex = 1;

      if (label !== undefined) {
        updates.push(`label = $${valueIndex++}`);
        values.push(label);
      }
      if (url !== undefined) {
        updates.push(`url = $${valueIndex++}`);
        values.push(url);
      }
      if (page_id !== undefined) {
        updates.push(`page_id = $${valueIndex++}`);
        values.push(page_id);
      }
      if (position !== undefined) {
        updates.push(`position = $${valueIndex++}`);
        values.push(position);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${valueIndex++}`);
        values.push(is_active);
      }
      if (parent_id !== undefined) {
        // Validate no circular reference
        if (parent_id === id) {
          return res.status(400).json({ error: 'Cannot set item as its own parent' });
        }

        // Check if the new parent is a descendant
        const circularCheck = await pool.query(
          `WITH RECURSIVE descendants AS (
            SELECT id FROM menu_items WHERE parent_id = $1
            UNION ALL
            SELECT mi.id FROM menu_items mi
            INNER JOIN descendants d ON mi.parent_id = d.id
          )
          SELECT 1 FROM descendants WHERE id = $2`,
          [id, parent_id]
        );

        if (circularCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Circular reference detected' });
        }

        updates.push(`parent_id = $${valueIndex++}`);
        values.push(parent_id);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE menu_items SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Menu item not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating menu item:', error);
      res.status(500).json({ error: 'Failed to update menu item' });
    }
  }
);

// Delete menu item
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid menu item ID' });
    }

    const result = await pool.query(
      'DELETE FROM menu_items WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// Reorder menu items
router.put('/domain/:domainId/reorder',
  authenticateToken,
  requireAdmin,
  validateRequest(reorderSchema),
  async (req: Request, res: Response) => {
    const client = await pool.connect();

    try {
      const domainId = parseInt(req.params.domainId);

      if (isNaN(domainId)) {
        return res.status(400).json({ error: 'Invalid domain ID' });
      }

      const { items } = req.body;

      // Validate domain exists
      const domainCheck = await client.query(
        'SELECT id FROM domains WHERE id = $1',
        [domainId]
      );

      if (domainCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Domain not found' });
      }

      // Validate all item IDs exist and belong to this domain
      const itemIds = items.map((item: any) => item.id);
      const itemCheck = await client.query(
        'SELECT id FROM menu_items WHERE domain_id = $1 AND id = ANY($2::int[])',
        [domainId, itemIds]
      );

      if (itemCheck.rows.length !== items.length) {
        return res.status(400).json({ error: 'Invalid menu items - some items not found or belong to different domain' });
      }

      await client.query('BEGIN');

      // Update each item's position and parent
      for (const item of items) {
        await client.query(
          `UPDATE menu_items
          SET position = $1, parent_id = $2, updated_at = NOW()
          WHERE id = $3 AND domain_id = $4`,
          [item.position, item.parent_id, item.id, domainId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error reordering menu items:', error);
      res.status(500).json({ error: 'Failed to reorder menu items' });
    } finally {
      client.release();
    }
  }
);

// Duplicate menu from one domain to another
router.post('/domain/:fromDomainId/duplicate',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    const client = await pool.connect();

    try {
      const fromDomainId = parseInt(req.params.fromDomainId);
      const { toDomainId } = req.body;

      if (isNaN(fromDomainId) || !toDomainId || isNaN(toDomainId)) {
        return res.status(400).json({ error: 'Invalid domain IDs' });
      }

      if (fromDomainId === toDomainId) {
        return res.status(400).json({ error: 'Source and target domains must be different' });
      }

      // Validate both domains exist
      const domainsCheck = await client.query(
        'SELECT id FROM domains WHERE id IN ($1, $2)',
        [fromDomainId, toDomainId]
      );

      if (domainsCheck.rows.length !== 2) {
        return res.status(400).json({ error: 'One or both domains not found' });
      }

      await client.query('BEGIN');

      // Delete existing menu items in target domain
      await client.query(
        'DELETE FROM menu_items WHERE domain_id = $1',
        [toDomainId]
      );

      // Copy menu structure
      await client.query(
        `INSERT INTO menu_items (domain_id, parent_id, label, url, page_id, position, is_active)
        SELECT
          $2,
          CASE
            WHEN parent_id IS NULL THEN NULL
            ELSE (
              SELECT new_items.id
              FROM menu_items old_items
              INNER JOIN menu_items new_items ON new_items.domain_id = $2
                AND new_items.label = old_items.label
                AND new_items.position = old_items.position
              WHERE old_items.id = menu_items.parent_id
            )
          END,
          label,
          url,
          page_id,
          position,
          is_active
        FROM menu_items
        WHERE domain_id = $1
        ORDER BY depth, position`,
        [fromDomainId, toDomainId]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error duplicating menu:', error);
      res.status(500).json({ error: 'Failed to duplicate menu' });
    } finally {
      client.release();
    }
  }
);

export default router;