/**
 * Quota Enforcement Middleware
 *
 * Enforces usage quotas before resource creation to prevent exceeding plan limits.
 *
 * Features:
 * - Checks quotas before POST/PUT operations
 * - Returns 402 Payment Required when quota exceeded
 * - Includes upgrade URL in error response
 * - Skips quota check for Enterprise tier
 * - Logs quota exceeded events
 * - Caches subscription tier lookups (5min TTL)
 *
 * Usage:
 *   router.post('/sites', auth, enforceQuota('sites'), createSite);
 *
 * Related: SF-010 Quota Enforcement Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../utils/database';
import { quotaService } from '../services/QuotaService';
import type { QuotaDimension } from '../services/QuotaService';
import { subscriptionCache, type SubscriptionTier } from '../utils/subscriptionCache';
import { ServiceErrorCode } from '../types/versioning';
import fs from 'fs';
import path from 'path';

/**
 * Get billing portal URL from environment or use default
 */
function getBillingPortalUrl(): string {
  return process.env.BILLING_PORTAL_URL || '/billing/upgrade';
}

/**
 * Fetch subscription tier from database (with caching)
 */
async function getSubscriptionTier(organizationId: number): Promise<SubscriptionTier | null> {
  // Check cache first
  const cached = subscriptionCache.getTier(organizationId);
  if (cached) {
    return cached;
  }

  try {
    // Query active subscription
    const { rows } = await pool.query(
      `SELECT plan_tier, status
       FROM subscriptions
       WHERE organization_id = $1
         AND status NOT IN ('canceled', 'incomplete_expired')
       LIMIT 1`,
      [organizationId]
    );

    if (rows.length === 0) {
      // No active subscription = free tier
      const freeTier: SubscriptionTier = {
        planTier: 'free',
        status: 'active',
      };
      subscriptionCache.setTier(organizationId, freeTier);
      return freeTier;
    }

    const tier: SubscriptionTier = {
      planTier: rows[0].plan_tier as 'free' | 'starter' | 'pro' | 'enterprise',
      status: rows[0].status,
    };

    // Cache the result
    subscriptionCache.setTier(organizationId, tier);

    return tier;
  } catch (error) {
    console.error('Error fetching subscription tier:', error);
    // On error, assume free tier (fail-safe)
    return {
      planTier: 'free',
      status: 'active',
    };
  }
}

/**
 * Enforce quota middleware factory
 *
 * @param dimension - Quota dimension to enforce (sites, posts, users, storage_bytes)
 * @returns Express middleware
 */
export function enforceQuota(dimension: QuotaDimension) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // P1 bug fix: Support legacy JWTs without organizationId claim (SF-010)
      // Extract organizationId from JWT, fallback to database lookup for legacy tokens
      let organizationId = req.user?.organizationId;

      if (!organizationId && req.user?.userId) {
        // Legacy JWT without organizationId - look up from database
        try {
          const { rows } = await pool.query(
            'SELECT organization_id FROM users WHERE id = $1',
            [req.user.userId]
          );
          if (rows.length > 0 && rows[0].organization_id) {
            organizationId = rows[0].organization_id;
            // Cache in request for subsequent middleware
            req.user.organizationId = organizationId;
          }
        } catch (dbError) {
          console.error('[QuotaEnforcement] Failed to lookup organizationId:', dbError);
        }
      }

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: 'Organization ID is required for quota enforcement',
          errorCode: ServiceErrorCode.VALIDATION_ERROR,
        });
      }

      // Get subscription tier
      const tier = await getSubscriptionTier(organizationId);

      if (!tier) {
        // Shouldn't happen due to fail-safe, but handle gracefully
        console.error(`No subscription tier found for organization ${organizationId}`);
        return res.status(500).json({
          success: false,
          error: 'Unable to determine subscription tier',
          errorCode: ServiceErrorCode.INTERNAL_ERROR,
        });
      }

      // Enterprise tier bypasses quota checks
      if (tier.planTier === 'enterprise') {
        console.log(`[QuotaEnforcement] Enterprise tier - bypassing quota check for org ${organizationId}, dimension ${dimension}`);
        // P1 bug fix: Store enterprise flag so route handlers can skip increment/decrement (SF-010)
        (req as any).isEnterpriseTier = true;
        return next();
      }

      // Check quota
      const result = await quotaService.checkQuota({
        organizationId,
        dimension,
        amount: 1,
      });

      if (!result.success) {
        // Service error (not quota exceeded, but something went wrong)
        console.error(`[QuotaEnforcement] Service error checking quota: ${result.error}`);
        return res.status(500).json({
          success: false,
          error: result.error,
          errorCode: result.errorCode || ServiceErrorCode.INTERNAL_ERROR,
        });
      }

      // Check if quota allows the action
      if (!result.data?.allowed) {
        // Quota exceeded - log event
        console.warn(`[QuotaEnforcement] Quota exceeded for org ${organizationId}, dimension ${dimension}`, {
          current: result.data?.current,
          limit: result.data?.limit,
          tier: tier.planTier,
        });

        // Return 402 Payment Required
        return res.status(402).json({
          success: false,
          error: `Quota exceeded for ${dimension}`,
          errorCode: ServiceErrorCode.QUOTA_EXCEEDED,
          quota: {
            dimension,
            current: result.data?.current || 0,
            limit: result.data?.limit || 0,
            remaining: result.data?.remaining || 0,
            percentageUsed: result.data?.percentage_used || 100,
          },
          tier: tier.planTier,
          upgradeUrl: getBillingPortalUrl(),
          message: `You have reached your ${tier.planTier} plan limit for ${dimension}. Upgrade to increase your quota.`,
        });
      }

      // Quota check passed - allow request to proceed
      console.log(`[QuotaEnforcement] Quota check passed for org ${organizationId}, dimension ${dimension}`, {
        current: result.data?.current,
        limit: result.data?.limit,
        remaining: result.data?.remaining,
      });

      next();
    } catch (error: any) {
      console.error('[QuotaEnforcement] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        error: 'Quota enforcement failed',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      });
    }
  };
}

/**
 * Enforce storage quota based on actual uploaded file size(s)
 *
 * This middleware MUST run after multer processes the file upload.
 * It checks the storage quota using the actual file size and deletes
 * uploaded files if quota is exceeded.
 *
 * Usage:
 *   router.post('/upload',
 *     auth,
 *     upload.single('file'),                      // Multer processes file first
 *     enforceStorageQuota({ derivatives: true }), // Check quota with derivatives
 *     uploadHandler                               // Finally handle upload
 *   );
 *
 * @param options - Configuration options
 * @param options.derivatives - Whether derivatives (webp, thumbnails) will be created (default: false)
 * @returns Express middleware
 */
export function enforceStorageQuota(options?: { derivatives?: boolean }) {
  const createDerivatives = options?.derivatives ?? false;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // P1 bug fix: Support legacy JWTs without organizationId claim (SF-010)
      // Extract organizationId from JWT, fallback to database lookup for legacy tokens
      let organizationId = req.user?.organizationId;

      if (!organizationId && req.user?.userId) {
        // Legacy JWT without organizationId - look up from database
        try {
          const { rows } = await pool.query(
            'SELECT organization_id FROM users WHERE id = $1',
            [req.user.userId]
          );
          if (rows.length > 0 && rows[0].organization_id) {
            organizationId = rows[0].organization_id;
            // Cache in request for subsequent middleware
            req.user.organizationId = organizationId;
          }
        } catch (dbError) {
          console.error('[QuotaEnforcement] Failed to lookup organizationId:', dbError);
        }
      }

      if (!organizationId) {
        // Clean up uploaded files before returning error (P2 bug fix)
        const uploadedFiles: string[] = [];
        if (req.file) {
          uploadedFiles.push(req.file.path);
        } else if (req.files) {
          const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
          uploadedFiles.push(...files.map(f => f.path));
        }
        cleanupFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          error: 'Organization ID is required for quota enforcement',
          errorCode: ServiceErrorCode.VALIDATION_ERROR,
        });
      }

      // P1 bug fix: Calculate ESTIMATED total file size including derivatives (SF-010)
      // For images with Sharp processing: webp + thumbnail derivatives
      // Estimate: webp ~70% of original, thumbnail ~10%, total = 1.8x original
      // For images without derivatives (multi-upload): use original size only
      let totalBytes = 0;
      const uploadedFiles: string[] = [];

      /**
       * Estimate total storage for file including derivatives (if applicable)
       * With derivatives (single upload): original + webp (~70%) + thumbnail (~10%) = 1.8x
       * Without derivatives (multi-upload): original only = 1.0x
       * Non-images: always 1.0x (no derivatives)
       */
      const estimateStorageSize = (file: Express.Multer.File): number => {
        const isImage = file.mimetype.startsWith('image/');
        const imageMultiplier = createDerivatives && isImage ? 1.8 : 1.0;
        return Math.ceil(file.size * imageMultiplier);
      };

      if (req.file) {
        // Single file upload
        totalBytes = estimateStorageSize(req.file);
        uploadedFiles.push(req.file.path);
      } else if (req.files) {
        // Multiple file upload
        const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
        totalBytes = files.reduce((sum, file) => sum + estimateStorageSize(file), 0);
        uploadedFiles.push(...files.map(f => f.path));
      } else {
        // No files uploaded - let the route handler deal with this
        return next();
      }

      // Get subscription tier
      const tier = await getSubscriptionTier(organizationId);

      if (!tier) {
        // Shouldn't happen due to fail-safe, but handle gracefully
        console.error(`No subscription tier found for organization ${organizationId}`);
        // Clean up uploaded files
        cleanupFiles(uploadedFiles);
        return res.status(500).json({
          success: false,
          error: 'Unable to determine subscription tier',
          errorCode: ServiceErrorCode.INTERNAL_ERROR,
        });
      }

      // Enterprise tier bypasses quota checks
      if (tier.planTier === 'enterprise') {
        console.log(`[QuotaEnforcement] Enterprise tier - bypassing storage quota check for org ${organizationId}`);
        // P1 bug fix: Store enterprise flag so route handlers can skip increment/decrement (SF-010)
        (req as any).isEnterpriseTier = true;
        return next();
      }

      // Check storage quota with actual file size
      const result = await quotaService.checkQuota({
        organizationId,
        dimension: 'storage_bytes',
        amount: totalBytes,
      });

      if (!result.success) {
        // Service error
        console.error(`[QuotaEnforcement] Service error checking storage quota: ${result.error}`);
        // Clean up uploaded files
        cleanupFiles(uploadedFiles);
        return res.status(500).json({
          success: false,
          error: result.error,
          errorCode: result.errorCode || ServiceErrorCode.INTERNAL_ERROR,
        });
      }

      // Check if quota allows the upload
      if (!result.data?.allowed) {
        // Storage quota exceeded - clean up uploaded files
        console.warn(`[QuotaEnforcement] Storage quota exceeded for org ${organizationId}`, {
          uploadSize: totalBytes,
          current: result.data?.current,
          limit: result.data?.limit,
          tier: tier.planTier,
        });

        // Delete uploaded files since quota exceeded
        cleanupFiles(uploadedFiles);

        // Return 402 Payment Required
        return res.status(402).json({
          success: false,
          error: `Storage quota exceeded`,
          errorCode: ServiceErrorCode.QUOTA_EXCEEDED,
          quota: {
            dimension: 'storage_bytes',
            uploadSize: totalBytes,
            current: result.data?.current || 0,
            limit: result.data?.limit || 0,
            remaining: result.data?.remaining || 0,
            percentageUsed: result.data?.percentage_used || 100,
          },
          tier: tier.planTier,
          upgradeUrl: getBillingPortalUrl(),
          message: `You have reached your ${tier.planTier} plan storage limit. Upgrade to increase your quota.`,
        });
      }

      // Quota check passed - allow upload to proceed
      console.log(`[QuotaEnforcement] Storage quota check passed for org ${organizationId}`, {
        uploadSize: totalBytes,
        current: result.data?.current,
        limit: result.data?.limit,
        remaining: result.data?.remaining,
      });

      next();
    } catch (error: any) {
      console.error('[QuotaEnforcement] Unexpected error in storage quota check:', error);

      // Clean up uploaded files on error
      const uploadedFiles: string[] = [];
      if (req.file) {
        uploadedFiles.push(req.file.path);
      } else if (req.files) {
        const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
        uploadedFiles.push(...files.map(f => f.path));
      }
      cleanupFiles(uploadedFiles);

      return res.status(500).json({
        success: false,
        error: 'Storage quota enforcement failed',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      });
    }
  };
}

/**
 * Helper function to delete uploaded files
 * @param filePaths - Array of file paths to delete
 */
function cleanupFiles(filePaths: string[]): void {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[QuotaEnforcement] Deleted uploaded file: ${filePath}`);
      }
    } catch (error) {
      console.error(`[QuotaEnforcement] Failed to delete file ${filePath}:`, error);
    }
  }
}

/**
 * Invalidate subscription tier cache (call after subscription changes)
 */
export function invalidateSubscriptionCache(organizationId: number): void {
  subscriptionCache.invalidateTier(organizationId);
}
