import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { quotaService } from '../services/QuotaService';
import type { QuotaDimension } from '../services/QuotaService';
import { ServiceErrorCode } from '../types/versioning';
import Joi from 'joi';

const router = Router();

/**
 * Map ServiceErrorCode to HTTP status code
 */
function getHttpStatusCode(errorCode?: ServiceErrorCode): number {
  if (!errorCode) {
    return 500; // Default to 500 for unknown errors
  }

  switch (errorCode) {
    case ServiceErrorCode.VALIDATION_ERROR:
      return 400;
    case ServiceErrorCode.UNAUTHORIZED:
      return 401;
    case ServiceErrorCode.FORBIDDEN:
    case ServiceErrorCode.QUOTA_EXCEEDED:
      return 403;
    case ServiceErrorCode.NOT_FOUND:
      return 404;
    case ServiceErrorCode.INTERNAL_ERROR:
    case ServiceErrorCode.DATABASE_ERROR:
      return 500;
    case ServiceErrorCode.SERVICE_UNAVAILABLE:
      return 503;
    default:
      return 500;
  }
}

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
      const statusCode = getHttpStatusCode(result.errorCode);
      return res.status(statusCode).json(result);
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
        const statusCode = getHttpStatusCode(result.errorCode);
        return res.status(statusCode).json(result);
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
        // Return appropriate status code based on error type
        // 403 for QUOTA_EXCEEDED, 404 for NOT_FOUND, 500 for INTERNAL_ERROR
        const statusCode = getHttpStatusCode(result.errorCode);
        return res.status(statusCode).json(result);
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
        const statusCode = getHttpStatusCode(result.errorCode);
        return res.status(statusCode).json(result);
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
      const statusCode = getHttpStatusCode(result.errorCode);
      return res.status(statusCode).json(result);
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
        const statusCode = getHttpStatusCode(result.errorCode);
        return res.status(statusCode).json(result);
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
      const statusCode = getHttpStatusCode(result.errorCode);
      return res.status(statusCode).json(result);
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
