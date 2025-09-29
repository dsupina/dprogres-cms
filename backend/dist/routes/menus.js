"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const joi_1 = __importDefault(require("joi"));
const router = (0, express_1.Router)();
const createMenuItemSchema = joi_1.default.object({
    domain_id: joi_1.default.number().integer().positive().optional(),
    site_id: joi_1.default.number().integer().positive().optional(),
    parent_id: joi_1.default.number().integer().positive().allow(null).optional(),
    label: joi_1.default.string().min(1).max(255).required(),
    url: joi_1.default.string().uri().max(500).allow(null, '').optional(),
    page_id: joi_1.default.number().integer().positive().allow(null).optional(),
    position: joi_1.default.number().integer().min(0).optional(),
    is_active: joi_1.default.boolean().optional()
}).custom((value, helpers) => {
    if (!value.domain_id && !value.site_id) {
        return helpers.error('any.required', { message: 'Either domain_id or site_id is required' });
    }
    return value;
});
const updateMenuItemSchema = joi_1.default.object({
    label: joi_1.default.string().min(1).max(255).optional(),
    url: joi_1.default.string().uri().max(500).allow(null, '').optional(),
    page_id: joi_1.default.number().integer().positive().allow(null).optional(),
    position: joi_1.default.number().integer().min(0).optional(),
    is_active: joi_1.default.boolean().optional(),
    parent_id: joi_1.default.number().integer().positive().allow(null).optional()
});
const reorderSchema = joi_1.default.object({
    items: joi_1.default.array().items(joi_1.default.object({
        id: joi_1.default.number().integer().positive().required(),
        position: joi_1.default.number().integer().min(0).required(),
        parent_id: joi_1.default.number().integer().positive().allow(null).required()
    })).required()
});
router.get('/site/:siteId', async (req, res) => {
    try {
        const siteId = parseInt(req.params.siteId);
        if (isNaN(siteId)) {
            return res.status(400).json({ error: 'Invalid site ID' });
        }
        const result = await database_1.pool.query(`SELECT
        mi.*,
        p.title as page_title,
        p.slug as page_slug
      FROM menu_items mi
      LEFT JOIN pages p ON mi.page_id = p.id
      WHERE mi.site_id = $1
      ORDER BY mi.parent_id NULLS FIRST, mi.position ASC`, [siteId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching site menu items:', error);
        res.status(500).json({ error: 'Failed to fetch menu items' });
    }
});
router.get('/site/:siteId/tree', async (req, res) => {
    try {
        const siteId = parseInt(req.params.siteId);
        if (isNaN(siteId)) {
            return res.status(400).json({ error: 'Invalid site ID' });
        }
        const result = await database_1.pool.query(`WITH RECURSIVE menu_tree AS (
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
      ORDER BY parent_id NULLS FIRST, position ASC`, [siteId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching site menu tree:', error);
        res.status(500).json({ error: 'Failed to fetch menu tree' });
    }
});
router.get('/domain/:domainId', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const domainId = parseInt(req.params.domainId);
        if (isNaN(domainId)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const result = await database_1.pool.query(`SELECT
        mi.*,
        p.title as page_title,
        p.slug as page_slug
      FROM menu_items mi
      LEFT JOIN pages p ON mi.page_id = p.id
      WHERE mi.domain_id = $1
      ORDER BY mi.parent_id NULLS FIRST, mi.position ASC`, [domainId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching menu items:', error);
        res.status(500).json({ error: 'Failed to fetch menu items' });
    }
});
router.get('/domain/:domainId/tree', async (req, res) => {
    try {
        const domainId = parseInt(req.params.domainId);
        if (isNaN(domainId)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const result = await database_1.pool.query(`WITH RECURSIVE menu_tree AS (
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
      ORDER BY parent_id NULLS FIRST, position ASC`, [domainId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching menu tree:', error);
        res.status(500).json({ error: 'Failed to fetch menu tree' });
    }
});
router.get('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid menu item ID' });
        }
        const result = await database_1.pool.query('SELECT * FROM menu_items WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error fetching menu item:', error);
        res.status(500).json({ error: 'Failed to fetch menu item' });
    }
});
router.post('/', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(createMenuItemSchema), async (req, res) => {
    try {
        const { domain_id, parent_id, label, url, page_id, position, is_active } = req.body;
        const domainCheck = await database_1.pool.query('SELECT id FROM domains WHERE id = $1', [domain_id]);
        if (domainCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Domain not found' });
        }
        if (parent_id) {
            const parentResult = await database_1.pool.query('SELECT id, depth FROM menu_items WHERE id = $1 AND domain_id = $2', [parent_id, domain_id]);
            if (parentResult.rows.length === 0) {
                return res.status(400).json({ error: 'Parent menu item not found' });
            }
            if (parentResult.rows[0].depth >= 2) {
                return res.status(400).json({ error: 'Maximum nesting depth (3 levels) reached' });
            }
        }
        let finalPosition = position;
        if (finalPosition === undefined) {
            const posResult = await database_1.pool.query('SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM menu_items WHERE domain_id = $1 AND ($2::integer IS NULL AND parent_id IS NULL OR parent_id = $2)', [domain_id, parent_id]);
            finalPosition = posResult.rows[0].next_position;
        }
        const result = await database_1.pool.query(`INSERT INTO menu_items (domain_id, parent_id, label, url, page_id, position, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`, [domain_id, parent_id || null, label, url || null, page_id || null, finalPosition, is_active !== false]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error creating menu item:', error);
        res.status(500).json({ error: 'Failed to create menu item' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(updateMenuItemSchema), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid menu item ID' });
        }
        const { label, url, page_id, position, is_active, parent_id } = req.body;
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
            if (parent_id === id) {
                return res.status(400).json({ error: 'Cannot set item as its own parent' });
            }
            const circularCheck = await database_1.pool.query(`WITH RECURSIVE descendants AS (
            SELECT id FROM menu_items WHERE parent_id = $1
            UNION ALL
            SELECT mi.id FROM menu_items mi
            INNER JOIN descendants d ON mi.parent_id = d.id
          )
          SELECT 1 FROM descendants WHERE id = $2`, [id, parent_id]);
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
        const result = await database_1.pool.query(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid menu item ID' });
        }
        const result = await database_1.pool.query('DELETE FROM menu_items WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }
        res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ error: 'Failed to delete menu item' });
    }
});
router.put('/domain/:domainId/reorder', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(reorderSchema), async (req, res) => {
    const client = await database_1.pool.connect();
    try {
        const domainId = parseInt(req.params.domainId);
        if (isNaN(domainId)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const { items } = req.body;
        const domainCheck = await client.query('SELECT id FROM domains WHERE id = $1', [domainId]);
        if (domainCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Domain not found' });
        }
        const itemIds = items.map((item) => item.id);
        const itemCheck = await client.query('SELECT id FROM menu_items WHERE domain_id = $1 AND id = ANY($2::int[])', [domainId, itemIds]);
        if (itemCheck.rows.length !== items.length) {
            return res.status(400).json({ error: 'Invalid menu items - some items not found or belong to different domain' });
        }
        await client.query('BEGIN');
        for (const item of items) {
            await client.query(`UPDATE menu_items
          SET position = $1, parent_id = $2, updated_at = NOW()
          WHERE id = $3 AND domain_id = $4`, [item.position, item.parent_id, item.id, domainId]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error reordering menu items:', error);
        res.status(500).json({ error: 'Failed to reorder menu items' });
    }
    finally {
        client.release();
    }
});
router.post('/domain/:fromDomainId/duplicate', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    const client = await database_1.pool.connect();
    try {
        const fromDomainId = parseInt(req.params.fromDomainId);
        const { toDomainId } = req.body;
        if (isNaN(fromDomainId) || !toDomainId || isNaN(toDomainId)) {
            return res.status(400).json({ error: 'Invalid domain IDs' });
        }
        if (fromDomainId === toDomainId) {
            return res.status(400).json({ error: 'Source and target domains must be different' });
        }
        const domainsCheck = await client.query('SELECT id FROM domains WHERE id IN ($1, $2)', [fromDomainId, toDomainId]);
        if (domainsCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'One or both domains not found' });
        }
        await client.query('BEGIN');
        await client.query('DELETE FROM menu_items WHERE domain_id = $1', [toDomainId]);
        await client.query(`INSERT INTO menu_items (domain_id, parent_id, label, url, page_id, position, is_active)
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
        ORDER BY depth, position`, [fromDomainId, toDomainId]);
        await client.query('COMMIT');
        res.json({ success: true });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error duplicating menu:', error);
        res.status(500).json({ error: 'Failed to duplicate menu' });
    }
    finally {
        client.release();
    }
});
exports.default = router;
//# sourceMappingURL=menus.js.map