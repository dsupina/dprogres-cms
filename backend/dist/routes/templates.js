"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.use((req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Only admin can manage templates' });
    }
    next();
});
router.get('/', async (_req, res) => {
    try {
        const result = await (0, database_1.query)('SELECT * FROM page_templates ORDER BY created_at DESC');
        res.json({ data: result.rows });
    }
    catch (error) {
        console.error('List templates error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)('SELECT * FROM page_templates WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Template not found' });
        res.json({ data: result.rows[0] });
    }
    catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/', (0, validation_1.validate)(validation_1.createTemplateSchema), async (req, res) => {
    try {
        const { key, name, description, enabled = true, schema = {}, default_data = {} } = req.body;
        const exists = await (0, database_1.query)('SELECT id FROM page_templates WHERE key = $1', [key]);
        if (exists.rows.length > 0)
            return res.status(400).json({ error: 'Key already exists' });
        const insert = await (0, database_1.query)(`INSERT INTO page_templates (key, name, description, enabled, schema, default_data)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [key, name, description || null, enabled, schema, default_data]);
        res.status(201).json({ message: 'Template created', data: insert.rows[0] });
    }
    catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', (0, validation_1.validate)(validation_1.updateTemplateSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await (0, database_1.query)('SELECT * FROM page_templates WHERE id = $1', [id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Template not found' });
        if (req.body.key && req.body.key !== existing.rows[0].key) {
            const dup = await (0, database_1.query)('SELECT id FROM page_templates WHERE key = $1 AND id != $2', [req.body.key, id]);
            if (dup.rows.length > 0)
                return res.status(400).json({ error: 'Key already exists' });
        }
        const update = await (0, database_1.query)(`UPDATE page_templates SET
        key = COALESCE($1, key),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        enabled = COALESCE($4, enabled),
        schema = COALESCE($5, schema),
        default_data = COALESCE($6, default_data),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`, [req.body.key, req.body.name, req.body.description, req.body.enabled, req.body.schema, req.body.default_data, id]);
        res.json({ message: 'Template updated', data: update.rows[0] });
    }
    catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const del = await (0, database_1.query)('DELETE FROM page_templates WHERE id = $1 RETURNING id', [id]);
        if (del.rows.length === 0)
            return res.status(404).json({ error: 'Template not found' });
        res.json({ message: 'Template deleted' });
    }
    catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=templates.js.map