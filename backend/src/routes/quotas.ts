import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { quotaService } from '../services/QuotaService';
import type { QuotaDimension } from '../services/QuotaService';
import Joi from 'joi';

const router = Router();

// Validation schemas
const checkQuotaSchema = Joi.object({
  dimension: Joi.string()
    .valid('sites', 'posts', 'users', 'storage_bytes', 'api_calls')
    .required(),
  amount: Joi.number().integer().min(1).default(1),
});

const incrementQuotaSchema = Joi.object({
  dimension: Joi.string()
    .valid('sites', 'posts', 'users', 'storage_bytes', 'api_calls')
    .required(),
  amount: Joi.number().integer().min(1).default(1),
});

const decrementQuotaSchema = Joi.object({
  dimension: Joi.string()
    .valid('sites', 'posts', 'users', 'storage_bytes', 'api_calls')
    .required(),
  amount: Joi.number().integer().min(1).default(1),
});

const setQuotaOverrideSchema = Joi.object({
  new_limit: Joi.number().integer().min(1).required(),
});

/**
 * GET /api/quotas/:organizationId
 * Get quota status for all dimensions for an organization
 */
router.get('/:organizationId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    if (isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid organization ID',
      });
    }

    const result = await quotaService.getQuotaStatus(organizationId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error getting quota status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quota status',
    });
  }
});

/**
 * POST /api/quotas/:organizationId/check
 * Check if organization can perform action (within quota)
 * Body: { dimension, amount? }
 */
router.post(
  '/:organizationId/check',
  authenticateToken,
  requireAdmin,
  validateRequest(checkQuotaSchema),
  async (req: Request, res: Response) => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (isNaN(organizationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid organization ID',
        });
      }

      const { dimension, amount } = req.body;

      const result = await quotaService.checkQuota({
        organizationId,
        dimension: dimension as QuotaDimension,
        amount,
      });

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error checking quota:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check quota',
      });
    }
  }
);

/**
 * POST /api/quotas/:organizationId/increment
 * Increment quota usage atomically
 * Body: { dimension, amount? }
 */
router.post(
  '/:organizationId/increment',
  authenticateToken,
  requireAdmin,
  validateRequest(incrementQuotaSchema),
  async (req: Request, res: Response) => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (isNaN(organizationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid organization ID',
        });
      }

      const { dimension, amount } = req.body;

      const result = await quotaService.incrementQuota({
        organizationId,
        dimension: dimension as QuotaDimension,
        amount,
      });

      if (!result.success) {
        // Quota exceeded - return 403 Forbidden
        return res.status(403).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error incrementing quota:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to increment quota',
      });
    }
  }
);

/**
 * POST /api/quotas/:organizationId/decrement
 * Decrement quota usage (when deleting resources)
 * Body: { dimension, amount? }
 */
router.post(
  '/:organizationId/decrement',
  authenticateToken,
  requireAdmin,
  validateRequest(decrementQuotaSchema),
  async (req: Request, res: Response) => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (isNaN(organizationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid organization ID',
        });
      }

      const { dimension, amount } = req.body;

      const result = await quotaService.decrementQuota({
        organizationId,
        dimension: dimension as QuotaDimension,
        amount,
      });

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error decrementing quota:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to decrement quota',
      });
    }
  }
);

/**
 * POST /api/quotas/:organizationId/reset
 * Reset monthly quotas for an organization
 */
router.post('/:organizationId/reset', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    if (isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid organization ID',
      });
    }

    const result = await quotaService.resetMonthlyQuotas(organizationId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error resetting monthly quotas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset monthly quotas',
    });
  }
});

/**
 * PUT /api/quotas/:organizationId/:dimension/override
 * Set quota override for Enterprise customers
 * Body: { new_limit }
 */
router.put(
  '/:organizationId/:dimension/override',
  authenticateToken,
  requireAdmin,
  validateRequest(setQuotaOverrideSchema),
  async (req: Request, res: Response) => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const dimension = req.params.dimension;

      if (isNaN(organizationId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid organization ID',
        });
      }

      // Validate dimension
      const validDimensions = ['sites', 'posts', 'users', 'storage_bytes', 'api_calls'];
      if (!validDimensions.includes(dimension)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid dimension',
        });
      }

      const { new_limit } = req.body;

      const result = await quotaService.setQuotaOverride({
        organizationId,
        dimension: dimension as QuotaDimension,
        newLimit: new_limit,
      });

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error setting quota override:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set quota override',
      });
    }
  }
);

/**
 * POST /api/quotas/reset-all
 * Reset all monthly quotas across all organizations (admin only, for scheduled jobs)
 */
router.post('/reset-all', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await quotaService.resetAllMonthlyQuotas();

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error resetting all monthly quotas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset all monthly quotas',
    });
  }
});

export default router;
