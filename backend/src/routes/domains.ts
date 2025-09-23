import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { DomainService } from '../services/domainService';

const router = Router();

// Validation schemas
const createDomainSchema = Joi.object({
  hostname: Joi.string()
    .pattern(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/)
    .min(3)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Invalid hostname format',
      'string.min': 'Hostname must be at least 3 characters',
      'string.max': 'Hostname must not exceed 255 characters'
    }),
  ip_address: Joi.string().ip().optional(),
  is_active: Joi.boolean().optional(),
  is_default: Joi.boolean().optional()
});

const updateDomainSchema = Joi.object({
  hostname: Joi.string()
    .pattern(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/)
    .min(3)
    .max(255)
    .optional(),
  ip_address: Joi.string().ip().optional().allow(null),
  is_active: Joi.boolean().optional(),
  is_default: Joi.boolean().optional(),
  settings: Joi.object().optional()
});

const verifyDomainSchema = Joi.object({
  token: Joi.string().required()
});

// Get all domains (admin only)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const domains = await DomainService.getAllDomains();
    res.json(domains);
  } catch (error) {
    console.error('Failed to fetch domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Get domain by ID (admin only)
router.get('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    const domain = await DomainService.getDomainById(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json(domain);
  } catch (error) {
    console.error('Failed to fetch domain:', error);
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

// Create domain (admin only)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  validateRequest(createDomainSchema),
  async (req: Request, res: Response) => {
    try {
      const domain = await DomainService.createDomain(req.body);
      res.status(201).json(domain);
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation
        return res.status(409).json({ error: 'Domain already exists' });
      }
      console.error('Failed to create domain:', error);
      res.status(500).json({ error: 'Failed to create domain' });
    }
  }
);

// Update domain (admin only)
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  validateRequest(updateDomainSchema),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid domain ID' });
      }

      const domain = await DomainService.updateDomain(id, req.body);
      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      res.json(domain);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Domain already exists' });
      }
      console.error('Failed to update domain:', error);
      res.status(500).json({ error: 'Failed to update domain' });
    }
  }
);

// Delete domain (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    // Check if domain is default
    const domain = await DomainService.getDomainById(id);
    if (domain?.is_default) {
      return res.status(400).json({ error: 'Cannot delete default domain' });
    }

    const deleted = await DomainService.deleteDomain(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete domain:', error);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// Verify domain ownership (admin only)
router.post(
  '/:id/verify',
  authenticateToken,
  requireAdmin,
  validateRequest(verifyDomainSchema),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid domain ID' });
      }

      const verified = await DomainService.verifyDomain(id, req.body.token);
      if (!verified) {
        return res.status(400).json({ error: 'Verification failed' });
      }

      res.json({ message: 'Domain verified successfully' });
    } catch (error) {
      console.error('Failed to verify domain:', error);
      res.status(500).json({ error: 'Failed to verify domain' });
    }
  }
);

// Get verification instructions (admin only)
router.get('/:id/verification-instructions', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    const domain = await DomainService.getDomainById(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const txtRecord = DomainService.generateVerificationTxtRecord(domain);

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
  } catch (error) {
    console.error('Failed to get verification instructions:', error);
    res.status(500).json({ error: 'Failed to get verification instructions' });
  }
});

// Cache stats endpoint (admin only, for debugging)
router.get('/cache/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = DomainService.getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Clear cache (admin only, for debugging)
router.post('/cache/clear', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    DomainService.clearCache();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Failed to clear cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;