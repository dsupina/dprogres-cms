import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { enforceQuota, isEnterpriseTier } from '../middleware/quota';
import { siteService } from '../services/siteService';
import { quotaService } from '../services/QuotaService';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createSiteSchema = Joi.object({
  domain_id: Joi.number().integer().positive().required(),
  name: Joi.string().min(1).max(255).required(),
  base_path: Joi.string().pattern(/^\/([a-z0-9-_\/]*)?$/).default('/'),
  title: Joi.string().max(255).optional(),
  description: Joi.string().optional(),
  is_default: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  settings: Joi.object().optional()
});

const updateSiteSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  base_path: Joi.string().pattern(/^\/([a-z0-9-_\/]*)?$/).optional(),
  title: Joi.string().max(255).optional(),
  description: Joi.string().allow('').optional(),
  is_default: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  settings: Joi.object().optional()
});

// Get all sites (admin only)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const domainId = req.query.domain_id ? parseInt(req.query.domain_id as string) : undefined;
    const sites = await siteService.getAllSites(domainId);
    res.json(sites);
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// Get sites for a specific domain
router.get('/domain/:domainId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const domainId = parseInt(req.params.domainId);

    if (isNaN(domainId)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    const sites = await siteService.getSitesByDomain(domainId);
    res.json(sites);
  } catch (error) {
    console.error('Error fetching domain sites:', error);
    res.status(500).json({ error: 'Failed to fetch domain sites' });
  }
});

// Get single site by ID
router.get('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }

    const site = await siteService.getSiteById(id);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json(site);
  } catch (error) {
    console.error('Error fetching site:', error);
    res.status(500).json({ error: 'Failed to fetch site' });
  }
});

// Create new site
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  enforceQuota('sites'),
  validateRequest(createSiteSchema),
  async (req: Request, res: Response) => {
    try {
      const site = await siteService.createSite(req.body);

      // P1 bug fix: Skip quota tracking for enterprise tier (SF-010)
      // Increment quota after successful creation (SF-010)
      const organizationId = req.user?.organizationId;
      const isEnterprise = (req as any).isEnterpriseTier;

      if (organizationId && !isEnterprise) {
        const incrementResult = await quotaService.incrementQuota({
          organizationId,
          dimension: 'sites',
          amount: 1
        });

        // P1 bug fix: Rollback site creation if quota increment fails (SF-010)
        if (!incrementResult.success || !incrementResult.data) {
          console.error('[CRITICAL] Quota increment failed, rolling back site creation:', {
            siteId: site.id,
            organizationId,
            error: incrementResult.error,
          });

          // Rollback: Delete site (cascades to related records via foreign key constraints)
          try {
            await siteService.deleteSite(site.id);
          } catch (dbError) {
            console.error('[CRITICAL] Failed to delete site during rollback:', dbError);
          }

          return res.status(500).json({
            error: 'Site creation failed due to quota tracking error',
            details: incrementResult.error,
          });
        }
      }

      res.status(201).json(site);
    } catch (error: any) {
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
  }
);

// Update site
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  validateRequest(updateSiteSchema),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid site ID' });
      }

      const site = await siteService.updateSite(id, req.body);

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      res.json(site);
    } catch (error: any) {
      console.error('Error updating site:', error);

      if (error.constraint === 'unique_domain_base_path') {
        return res.status(409).json({
          error: 'A site with this base path already exists for this domain'
        });
      }

      res.status(500).json({ error: 'Failed to update site' });
    }
  }
);

// Delete site
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }

    const deleted = await siteService.deleteSite(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // P1 bug fix: Skip quota tracking for enterprise tier (SF-010)
    // Decrement site quota after deletion (SF-010)
    const organizationId = req.user?.organizationId;
    const isEnterprise = organizationId ? await isEnterpriseTier(organizationId) : false;

    if (organizationId && !isEnterprise) {
      const decrementResult = await quotaService.decrementQuota({
        organizationId,
        dimension: 'sites',
        amount: 1,
      });

      if (!decrementResult.success) {
        // Log error but don't fail the deletion - site is already deleted
        console.error('[WARNING] Site deleted but quota decrement failed:', {
          siteId: id,
          organizationId,
          error: decrementResult.error,
        });
      }
    }

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting site:', error);

    if (error.message === 'Cannot delete the last site for a domain') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// Get site context for current request (public endpoint for frontend)
router.get('/context/current', async (req: Request, res: Response) => {
  try {
    const hostname = req.get('host')?.split(':')[0];

    if (!hostname) {
      return res.status(400).json({ error: 'No hostname in request' });
    }

    // Use the full path from the referer or a query param
    const path = req.query.path as string || '/';

    const site = await siteService.resolveSiteByHostAndPath(hostname, path);

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
  } catch (error) {
    console.error('Error getting site context:', error);
    res.status(500).json({ error: 'Failed to get site context' });
  }
});

export default router;