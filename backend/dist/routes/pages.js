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
        const domain = req.domain;
        const params = [];
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
        const result = await (0, database_1.query)(pagesQuery, params);
        res.json({ data: result.rows });
    }
    catch (error) {
        console.error('Get pages error:', error);
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
            domainFilter = ' AND (domain_id = $2 OR domain_id IS NULL)';
            params.push(domain.id);
        }
        const pageQuery = `
      SELECT * FROM pages
      WHERE slug = $1 AND published = true${domainFilter}
    `;
        const result = await (0, database_1.query)(pageQuery, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found' });
        }
        const page = result.rows[0];
        res.json({ page });
    }
    catch (error) {
        console.error('Get page error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/', auth_1.authenticateToken, auth_1.requireEditor, (0, validation_1.validate)(validation_1.createPageSchema), async (req, res) => {
    try {
        const pageData = req.body;
        if (!pageData.slug) {
            const existingSlugs = await (0, database_1.query)('SELECT slug FROM pages WHERE slug LIKE $1', [`${(0, slug_1.generateSlug)(pageData.title)}%`]);
            pageData.slug = (0, slug_1.generateUniqueSlug)(pageData.title, existingSlugs.rows.map(row => row.slug));
        }
        else {
            const existingSlug = await (0, database_1.query)('SELECT id FROM pages WHERE slug = $1', [pageData.slug]);
            if (existingSlug.rows.length > 0) {
                return res.status(400).json({ error: 'Slug already exists' });
            }
        }
        const domain = req.domain;
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
        const result = await (0, database_1.query)(insertQuery, values);
        const newPage = result.rows[0];
        res.status(201).json({
            message: 'Page created successfully',
            data: newPage
        });
    }
    catch (error) {
        console.error('Create page error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireEditor, (0, validation_1.validate)(validation_1.updatePageSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const pageData = req.body;
        const existingPage = await (0, database_1.query)('SELECT * FROM pages WHERE id = $1', [id]);
        if (existingPage.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found' });
        }
        const page = existingPage.rows[0];
        if (pageData.slug && pageData.slug !== page.slug) {
            const existingSlug = await (0, database_1.query)('SELECT id FROM pages WHERE slug = $1 AND id != $2', [pageData.slug, id]);
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
        const result = await (0, database_1.query)(updateQuery, values);
        const updatedPage = result.rows[0];
        res.json({
            message: 'Page updated successfully',
            data: updatedPage
        });
    }
    catch (error) {
        console.error('Update page error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireEditor, async (req, res) => {
    try {
        const { id } = req.params;
        const existingPage = await (0, database_1.query)('SELECT * FROM pages WHERE id = $1', [id]);
        if (existingPage.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found' });
        }
        await (0, database_1.query)('DELETE FROM pages WHERE id = $1', [id]);
        res.json({ message: 'Page deleted successfully' });
    }
    catch (error) {
        console.error('Delete page error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=pages.js.map