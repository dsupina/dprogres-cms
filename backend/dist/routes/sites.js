"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const siteService_1 = require("../services/siteService");
const joi_1 = __importDefault(require("joi"));
const router = (0, express_1.Router)();
const createSiteSchema = joi_1.default.object({
    domain_id: joi_1.default.number().integer().positive().required(),
    name: joi_1.default.string().min(1).max(255).required(),
    base_path: joi_1.default.string().pattern(/^\/([a-z0-9-_\/]*)?$/).default('/'),
    title: joi_1.default.string().max(255).optional(),
    description: joi_1.default.string().optional(),
    is_default: joi_1.default.boolean().optional(),
    is_active: joi_1.default.boolean().optional(),
    settings: joi_1.default.object().optional()
});
const updateSiteSchema = joi_1.default.object({
    name: joi_1.default.string().min(1).max(255).optional(),
    base_path: joi_1.default.string().pattern(/^\/([a-z0-9-_\/]*)?$/).optional(),
    title: joi_1.default.string().max(255).optional(),
    description: joi_1.default.string().allow('').optional(),
    is_default: joi_1.default.boolean().optional(),
    is_active: joi_1.default.boolean().optional(),
    settings: joi_1.default.object().optional()
});
router.get('/', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const domainId = req.query.domain_id ? parseInt(req.query.domain_id) : undefined;
        const sites = await siteService_1.siteService.getAllSites(domainId);
        res.json(sites);
    }
    catch (error) {
        console.error('Error fetching sites:', error);
        res.status(500).json({ error: 'Failed to fetch sites' });
    }
});
router.get('/domain/:domainId', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const domainId = parseInt(req.params.domainId);
        if (isNaN(domainId)) {
            return res.status(400).json({ error: 'Invalid domain ID' });
        }
        const sites = await siteService_1.siteService.getSitesByDomain(domainId);
        res.json(sites);
    }
    catch (error) {
        console.error('Error fetching domain sites:', error);
        res.status(500).json({ error: 'Failed to fetch domain sites' });
    }
});
router.get('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid site ID' });
        }
        const site = await siteService_1.siteService.getSiteById(id);
        if (!site) {
            return res.status(404).json({ error: 'Site not found' });
        }
        res.json(site);
    }
    catch (error) {
        console.error('Error fetching site:', error);
        res.status(500).json({ error: 'Failed to fetch site' });
    }
});
router.post('/', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(createSiteSchema), async (req, res) => {
    try {
        const site = await siteService_1.siteService.createSite(req.body);
        res.status(201).json(site);
    }
    catch (error) {
        console.error('Error creating site:', error);
        if (error.message === 'Domain not found') {
            return res.status(404).json({ error: 'Domain not found' });
        }
        if (error.constraint === 'unique_domain_base_path') {
            return res.status(409).json({
                error: 'A site with this base path already exists for this domain'
            });
        }
        res.status(500).json({ error: 'Failed to create site' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireAdmin, (0, validation_1.validateRequest)(updateSiteSchema), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid site ID' });
        }
        const site = await siteService_1.siteService.updateSite(id, req.body);
        if (!site) {
            return res.status(404).json({ error: 'Site not found' });
        }
        res.json(site);
    }
    catch (error) {
        console.error('Error updating site:', error);
        if (error.constraint === 'unique_domain_base_path') {
            return res.status(409).json({
                error: 'A site with this base path already exists for this domain'
            });
        }
        res.status(500).json({ error: 'Failed to update site' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid site ID' });
        }
        const deleted = await siteService_1.siteService.deleteSite(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Site not found' });
        }
        res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting site:', error);
        if (error.message === 'Cannot delete the last site for a domain') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to delete site' });
    }
});
router.get('/context/current', async (req, res) => {
    try {
        const hostname = req.get('host')?.split(':')[0];
        if (!hostname) {
            return res.status(400).json({ error: 'No hostname in request' });
        }
        const path = req.query.path || '/';
        const site = await siteService_1.siteService.resolveSiteByHostAndPath(hostname, path);
        if (!site) {
            return res.status(404).json({ error: 'No site found for this domain' });
        }
        res.json({
            siteId: site.id,
            siteName: site.name,
            siteTitle: site.title,
            basePath: site.base_path,
            domainId: site.domain_id
        });
    }
    catch (error) {
        console.error('Error getting site context:', error);
        res.status(500).json({ error: 'Failed to get site context' });
    }
});
exports.default = router;
//# sourceMappingURL=sites.js.map