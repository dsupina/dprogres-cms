"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const domainService_1 = require("../services/domainService");
const router = (0, express_1.Router)();
const createDomainSchema = joi_1.default.object({
    hostname: joi_1.default.string()
        .pattern(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/)
        .min(3)
        .max(255)
        .required()
        .messages({
        'string.pattern.base': 'Invalid hostname format',
        'string.min': 'Hostname must be at least 3 characters',
        'string.max': 'Hostname must not exceed 255 characters'
    }),
    ip_address: joi_1.default.string().ip().optional(),
    is_active: joi_1.default.boolean().optional(),
    is_default: joi_1.default.boolean().optional()
});
const updateDomainSchema = joi_1.default.object({
    hostname: joi_1.default.string()
        .pattern(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/)
        .min(3)
        .max(255)
        .optional(),
    ip_address: joi_1.default.string().ip().optional().allow(null),
    is_active: joi_1.default.boolean().optional(),
    is_default: joi_1.default.boolean().optional(),
    settings: joi_1.default.object().optional()
});
const verifyDomainSchema = joi_1.default.object({
    token: joi_1.default.string().required()
});
router.get('/', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const domains = await domainService_1.DomainService.getAllDomains();
        res.json(domains);
    }
    catch (error) {
        console.error('Failed to fetch domains:', error);
        res.status(500).json({ error: 'Failed to fetch domains' });
    }
});
router.get('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const domain = await domainService_1.DomainService.getDomainById(id);
        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        res.json(domain);
    }
    catch (error) {
        console.error('Failed to fetch domain:', error);
        res.status(500).json({ error: 'Failed to fetch domain' });
    }
});
router.post('/', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(createDomainSchema), async (req, res) => {
    try {
        const domain = await domainService_1.DomainService.createDomain(req.body);
        res.status(201).json(domain);
    }
    catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Domain already exists' });
        }
        console.error('Failed to create domain:', error);
        res.status(500).json({ error: 'Failed to create domain' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(updateDomainSchema), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const domain = await domainService_1.DomainService.updateDomain(id, req.body);
        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        res.json(domain);
    }
    catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Domain already exists' });
        }
        console.error('Failed to update domain:', error);
        res.status(500).json({ error: 'Failed to update domain' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const domain = await domainService_1.DomainService.getDomainById(id);
        if (domain?.is_default) {
            return res.status(400).json({ error: 'Cannot delete default domain' });
        }
        const deleted = await domainService_1.DomainService.deleteDomain(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        res.status(204).send();
    }
    catch (error) {
        console.error('Failed to delete domain:', error);
        res.status(500).json({ error: 'Failed to delete domain' });
    }
});
router.post('/:id/verify', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(verifyDomainSchema), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const verified = await domainService_1.DomainService.verifyDomain(id, req.body.token);
        if (!verified) {
            return res.status(400).json({ error: 'Verification failed' });
        }
        res.json({ message: 'Domain verified successfully' });
    }
    catch (error) {
        console.error('Failed to verify domain:', error);
        res.status(500).json({ error: 'Failed to verify domain' });
    }
});
router.get('/:id/verification-instructions', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const domain = await domainService_1.DomainService.getDomainById(id);
        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        const txtRecord = domainService_1.DomainService.generateVerificationTxtRecord(domain);
        res.json({
            domain: domain.hostname,
            verified: domain.verified_at != null,
            instructions: {
                method: 'DNS TXT Record',
                record_name: '_cms-verification',
                record_value: txtRecord,
                ttl: 3600,
                note: 'Add this TXT record to your domain\'s DNS settings'
            }
        });
    }
    catch (error) {
        console.error('Failed to get verification instructions:', error);
        res.status(500).json({ error: 'Failed to get verification instructions' });
    }
});
router.get('/cache/stats', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const stats = domainService_1.DomainService.getCacheStats();
        res.json(stats);
    }
    catch (error) {
        console.error('Failed to get cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});
router.post('/cache/clear', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        domainService_1.DomainService.clearCache();
        res.json({ message: 'Cache cleared successfully' });
    }
    catch (error) {
        console.error('Failed to clear cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});
exports.default = router;
//# sourceMappingURL=domains.js.map