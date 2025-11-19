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
        const { page = 1, limit, search, sort = 'name', order = 'asc' } = req.query;
        const domain = req.domain;
        const params = [];
        let paramCount = 0;
        let whereConditions = [];
        if (domain && domain.id) {
            whereConditions.push(`(c.domain_id = $${++paramCount} OR c.domain_id IS NULL)`);
            params.push(domain.id);
        }
        if (search) {
            whereConditions.push(`(c.name ILIKE $${++paramCount} OR c.description ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }
        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';
        let joinCondition = "c.id = p.category_id AND p.status = 'published'";
        if (domain && domain.id) {
            joinCondition += ' AND (p.domain_id = c.domain_id OR p.domain_id IS NULL)';
        }
        const validSortFields = ['name', 'post_count', 'created_at'];
        const sortField = validSortFields.includes(sort) ? sort : 'name';
        const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
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
        if (limit) {
            const offset = (Number(page) - 1) * Number(limit);
            categoriesQuery += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
            params.push(Number(limit), offset);
        }
        const result = await (0, database_1.query)(categoriesQuery, params);
        if (limit) {
            let countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
        FROM categories c
        ${whereClause}
      `;
            const countParams = params.slice(0, params.length - 2);
            const countResult = await (0, database_1.query)(countQuery, countParams);
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
    }
    catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const categoryQuery = `
      SELECT c.*, COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON c.id = p.category_id AND p.status = 'published'
      WHERE c.slug = $1
      GROUP BY c.id
    `;
        const categoryResult = await (0, database_1.query)(categoryQuery, [slug]);
        if (categoryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        const category = categoryResult.rows[0];
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
        const postsResult = await (0, database_1.query)(postsQuery, [category.id, limit, offset]);
        const countResult = await (0, database_1.query)('SELECT COUNT(*) FROM posts WHERE category_id = $1 AND status = $2', [category.id, 'published']);
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
    }
    catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/', auth_1.authenticateToken, auth_1.requireEditor, (0, validation_1.validate)(validation_1.createCategorySchema), async (req, res) => {
    try {
        const categoryData = req.body;
        if (!categoryData.slug) {
            const existingSlugs = await (0, database_1.query)('SELECT slug FROM categories WHERE slug LIKE $1', [`${(0, slug_1.generateSlug)(categoryData.name)}%`]);
            categoryData.slug = (0, slug_1.generateUniqueSlug)(categoryData.name, existingSlugs.rows.map(row => row.slug));
        }
        else {
            const existingSlug = await (0, database_1.query)('SELECT id FROM categories WHERE slug = $1', [categoryData.slug]);
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
        const result = await (0, database_1.query)(insertQuery, values);
        const newCategory = result.rows[0];
        res.status(201).json({
            message: 'Category created successfully',
            data: newCategory
        });
    }
    catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireEditor, (0, validation_1.validate)(validation_1.updateCategorySchema), async (req, res) => {
    try {
        const { id } = req.params;
        const categoryData = req.body;
        const existingCategory = await (0, database_1.query)('SELECT * FROM categories WHERE id = $1', [id]);
        if (existingCategory.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        const category = existingCategory.rows[0];
        if (categoryData.slug && categoryData.slug !== category.slug) {
            const existingSlug = await (0, database_1.query)('SELECT id FROM categories WHERE slug = $1 AND id != $2', [categoryData.slug, id]);
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
        const result = await (0, database_1.query)(updateQuery, values);
        const updatedCategory = result.rows[0];
        res.json({
            message: 'Category updated successfully',
            data: updatedCategory
        });
    }
    catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireEditor, async (req, res) => {
    try {
        const { id } = req.params;
        const existingCategory = await (0, database_1.query)('SELECT * FROM categories WHERE id = $1', [id]);
        if (existingCategory.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        const postsCount = await (0, database_1.query)('SELECT COUNT(*) FROM posts WHERE category_id = $1', [id]);
        const postCount = parseInt(postsCount.rows[0].count);
        if (postCount > 0) {
            return res.status(400).json({
                error: 'Cannot delete category with existing posts',
                postCount
            });
        }
        await (0, database_1.query)('DELETE FROM categories WHERE id = $1', [id]);
        res.json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=categories.js.map