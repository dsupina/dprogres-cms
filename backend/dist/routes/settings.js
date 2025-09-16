"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const result = await (0, database_1.query)('SELECT key, value FROM site_settings');
        const settings = {};
        result.rows.forEach((row) => {
            settings[row.key] = row.value;
        });
        if (settings['site_name']) {
            settings['site_title'] = settings['site_name'];
        }
        res.json(settings);
    }
    catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/', auth_1.authenticateToken, async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can update settings' });
        }
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Settings object is required' });
        }
        for (const [key, value] of Object.entries(settings)) {
            await (0, database_1.query)('INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', [key, value]);
        }
        const providedName = settings['site_title'] || settings['site_name'];
        if (providedName) {
            await (0, database_1.query)('INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', ['site_name', providedName]);
            await (0, database_1.query)('INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', ['site_title', providedName]);
        }
        res.json({ message: 'Settings updated successfully' });
    }
    catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await (0, database_1.query)('SELECT value FROM site_settings WHERE key = $1', [key]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        res.json({ key, value: result.rows[0].value });
    }
    catch (error) {
        console.error('Get setting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map