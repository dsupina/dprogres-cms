import { EventEmitter } from 'events';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types/versioning';
import { ServiceErrorCode } from '../types/versioning';

/**
 * Quota dimensions tracked per organization
 */
export type QuotaDimension = 'sites' | 'posts' | 'users' | 'storage_bytes' | 'api_calls';

/**
 * Quota status for a single dimension
 */
export interface QuotaStatus {
  dimension: QuotaDimension;
  current_usage: number;
  quota_limit: number;
  remaining: number;
  percentage_used: number;
  period_start: Date;
  period_end?: Date;
  last_reset_at?: Date;
}

/**
 * Response from checkQuota method
 */
export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  percentage_used: number;
}

/**
 * Input for checking quota
 */
export interface CheckQuotaInput {
  organizationId: number;
  dimension: QuotaDimension;
  amount?: number;
}

/**
 * Input for incrementing quota
 */
export interface IncrementQuotaInput {
  organizationId: number;
  dimension: QuotaDimension;
  amount?: number;
}

/**
 * Input for decrementing quota
 */
export interface DecrementQuotaInput {
  organizationId: number;
  dimension: QuotaDimension;
  amount?: number;
}

/**
 * Input for setting quota override
 */
export interface SetQuotaOverrideInput {
  organizationId: number;
  dimension: QuotaDimension;
  newLimit: number;
}

/**
 * Warning thresholds for quota alerts
 */
export type WarningThreshold = 80 | 90 | 95;

/**
 * Warning event data emitted when quota approaches limit
 */
export interface QuotaWarningEvent {
  organizationId: number;
  dimension: QuotaDimension;
  percentage: WarningThreshold;
  current: number;
  limit: number;
  remaining: number;
  timestamp: Date;
}

/**
 * QuotaService - Manages usage quotas with atomic operations
 *
 * Features:
 * - Check if organization can perform action (within quota)
 * - Increment usage atomically after action
 * - Get current quota status for all dimensions
 * - Reset monthly quotas (API calls)
 * - Set quota overrides (Enterprise)
 * - Calculate quota percentage used
 * - Emit events when approaching limits (80%, 90%, 95%, 100%)
 *
 * Events:
 * - quota:approaching_limit (at 80%, 90%, 95%)
 * - quota:exceeded (at 100%)
 * - quota:reset (monthly reset)
 * - quota:override_set (when limit is manually changed)
 * - quota:incremented (when usage is incremented)
 * - quota:decremented (when usage is decremented)
 * - quota:warning (at 80%, 90%, 95% with spam prevention)
 */
export class QuotaService extends EventEmitter {
  /**
   * Cache to track sent warnings and prevent spam
   * Key format: `${orgId}:${dimension}:${threshold}`
   * Value: timestamp when warning was sent
   */
  private warningCache: Map<string, Date> = new Map();

  /**
   * Warning thresholds in descending order for priority checking
   */
  private static readonly WARNING_THRESHOLDS: WarningThreshold[] = [95, 90, 80];

  /**
   * Generate cache key for warning tracking
   */
  private getWarningCacheKey(orgId: number, dimension: QuotaDimension, threshold: WarningThreshold): string {
    return `${orgId}:${dimension}:${threshold}`;
  }

  /**
   * Check if a warning was already sent for this threshold
   */
  wasWarningSent(orgId: number, dimension: QuotaDimension, threshold: WarningThreshold): boolean {
    const key = this.getWarningCacheKey(orgId, dimension, threshold);
    return this.warningCache.has(key);
  }

  /**
   * Mark a warning as sent for this threshold
   */
  markWarningSent(orgId: number, dimension: QuotaDimension, threshold: WarningThreshold): void {
    const key = this.getWarningCacheKey(orgId, dimension, threshold);
    this.warningCache.set(key, new Date());
  }

  /**
   * Clear all warnings for an organization/dimension (called on quota reset)
   */
  clearWarnings(orgId: number, dimension?: QuotaDimension): void {
    const prefix = dimension ? `${orgId}:${dimension}:` : `${orgId}:`;
    for (const key of this.warningCache.keys()) {
      if (key.startsWith(prefix)) {
        this.warningCache.delete(key);
      }
    }
  }

  /**
   * Check quota status and emit warnings at thresholds (80%, 90%, 95%)
   * Only emits one warning per threshold to prevent spam
   */
  async checkAndWarn(orgId: number, dimension: QuotaDimension): Promise<void> {
    const statusResult = await this.getQuotaStatusForDimension(orgId, dimension);

    if (!statusResult.success || !statusResult.data) {
      return;
    }

    const { current_usage, quota_limit, remaining, percentage_used } = statusResult.data;

    // Check thresholds in descending order, emit only the highest applicable threshold
    for (const threshold of QuotaService.WARNING_THRESHOLDS) {
      if (percentage_used >= threshold && !this.wasWarningSent(orgId, dimension, threshold)) {
        const warningEvent: QuotaWarningEvent = {
          organizationId: orgId,
          dimension,
          percentage: threshold,
          current: current_usage,
          limit: quota_limit,
          remaining,
          timestamp: new Date(),
        };

        this.emit('quota:warning', warningEvent);
        this.markWarningSent(orgId, dimension, threshold);

        // Only emit the highest threshold warning
        break;
      }
    }
  }

  /**
   * Check if organization can perform action (within quota)
   * Does NOT increment - use incrementQuota after successful action
   */
  async checkQuota(input: CheckQuotaInput): Promise<ServiceResponse<QuotaCheckResult>> {
    try {
      const { organizationId, dimension, amount = 1 } = input;

      // Get current quota status
      const { rows } = await pool.query(
        `SELECT current_usage, quota_limit
         FROM usage_quotas
         WHERE organization_id = $1 AND dimension = $2`,
        [organizationId, dimension]
      );

      if (rows.length === 0) {
        return {
          success: false,
          error: `No quota record found for organization ${organizationId} and dimension ${dimension}`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      const currentUsage = parseInt(rows[0].current_usage);
      const quotaLimit = parseInt(rows[0].quota_limit);
      const wouldBeUsage = currentUsage + amount;
      const allowed = wouldBeUsage <= quotaLimit;
      const remaining = quotaLimit - currentUsage;
      const percentageUsed = (currentUsage / quotaLimit) * 100;

      return {
        success: true,
        data: {
          allowed,
          current: currentUsage,
          limit: quotaLimit,
          remaining: Math.max(0, remaining),
          percentage_used: Math.round(percentageUsed * 100) / 100,
        },
      };
    } catch (error: any) {
      console.error('Error checking quota:', error);
      return {
        success: false,
        error: error.message || 'Failed to check quota',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Increment quota usage atomically using database function
   * Returns true if increment was successful (within limit), false if quota exceeded
   */
  async incrementQuota(input: IncrementQuotaInput): Promise<ServiceResponse<boolean>> {
    try {
      const { organizationId, dimension, amount = 1 } = input;

      // First, check if quota record exists to distinguish from quota exceeded
      const { rows: checkRows } = await pool.query(
        'SELECT current_usage, quota_limit FROM usage_quotas WHERE organization_id = $1 AND dimension = $2',
        [organizationId, dimension]
      );

      if (checkRows.length === 0) {
        return {
          success: false,
          error: `No quota record found for organization ${organizationId} and dimension ${dimension}. Quota may not be initialized.`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      // Use database function for atomic check-and-increment
      const { rows } = await pool.query(
        'SELECT check_and_increment_quota($1, $2, $3) as allowed',
        [organizationId, dimension, amount]
      );

      const allowed = rows[0].allowed;

      if (!allowed) {
        // Emit quota exceeded event
        this.emit('quota:exceeded', {
          organizationId,
          dimension,
          timestamp: new Date(),
        });

        return {
          success: false,
          error: `Quota exceeded for dimension: ${dimension}`,
          errorCode: ServiceErrorCode.QUOTA_EXCEEDED,
        };
      }

      // Get updated quota status for events
      const statusResult = await this.getQuotaStatusForDimension(organizationId, dimension);

      if (statusResult.success && statusResult.data) {
        const percentageUsed = statusResult.data.percentage_used;

        // Emit event at exactly 100% (limit fully consumed)
        if (percentageUsed === 100) {
          this.emit('quota:limit_reached', {
            organizationId,
            dimension,
            current: statusResult.data.current_usage,
            limit: statusResult.data.quota_limit,
            remaining: statusResult.data.remaining,
            timestamp: new Date(),
          });
        }

        // Check and emit warnings with spam prevention (SF-012)
        await this.checkAndWarn(organizationId, dimension);

        // Emit incremented event
        this.emit('quota:incremented', {
          organizationId,
          dimension,
          amount,
          current: statusResult.data.current_usage,
          timestamp: new Date(),
        });
      }

      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      console.error('Error incrementing quota:', error);
      return {
        success: false,
        error: error.message || 'Failed to increment quota',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Decrement quota usage (when deleting resources)
   * Uses SELECT FOR UPDATE to prevent race conditions
   */
  async decrementQuota(input: DecrementQuotaInput): Promise<ServiceResponse<boolean>> {
    let client;

    try {
      const { organizationId, dimension, amount = 1 } = input;

      // Acquire connection inside try block to handle connection failures
      client = await pool.connect();
      await client.query('BEGIN');

      // Lock row and get current usage
      const { rows } = await client.query(
        `SELECT current_usage
         FROM usage_quotas
         WHERE organization_id = $1 AND dimension = $2
         FOR UPDATE`,
        [organizationId, dimension]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `No quota record found for organization ${organizationId} and dimension ${dimension}`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      const currentUsage = parseInt(rows[0].current_usage);
      const newUsage = Math.max(0, currentUsage - amount);

      // Update usage
      await client.query(
        `UPDATE usage_quotas
         SET current_usage = $1,
             updated_at = NOW()
         WHERE organization_id = $2 AND dimension = $3`,
        [newUsage, organizationId, dimension]
      );

      await client.query('COMMIT');

      // Emit decremented event
      this.emit('quota:decremented', {
        organizationId,
        dimension,
        amount,
        current: newUsage,
        timestamp: new Date(),
      });

      return {
        success: true,
        data: true,
      };
    } catch (error: any) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          // Rollback may fail if connection was lost
          console.error('Error rolling back transaction:', rollbackError);
        }
      }
      console.error('Error decrementing quota:', error);
      return {
        success: false,
        error: error.message || 'Failed to decrement quota',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Get quota status for a single dimension
   * Private helper method
   */
  private async getQuotaStatusForDimension(
    organizationId: number,
    dimension: QuotaDimension
  ): Promise<ServiceResponse<QuotaStatus>> {
    try {
      const { rows } = await pool.query(
        `SELECT dimension, current_usage, quota_limit, period_start, period_end, last_reset_at
         FROM usage_quotas
         WHERE organization_id = $1 AND dimension = $2`,
        [organizationId, dimension]
      );

      if (rows.length === 0) {
        return {
          success: false,
          error: `No quota found for dimension: ${dimension}`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      const row = rows[0];
      const currentUsage = parseInt(row.current_usage);
      const quotaLimit = parseInt(row.quota_limit);
      const remaining = quotaLimit - currentUsage;
      const percentageUsed = (currentUsage / quotaLimit) * 100;

      return {
        success: true,
        data: {
          dimension: row.dimension,
          current_usage: currentUsage,
          quota_limit: quotaLimit,
          remaining: Math.max(0, remaining),
          percentage_used: Math.round(percentageUsed * 100) / 100,
          period_start: row.period_start,
          period_end: row.period_end,
          last_reset_at: row.last_reset_at,
        },
      };
    } catch (error: any) {
      console.error('Error getting quota status for dimension:', error);
      return {
        success: false,
        error: error.message || 'Failed to get quota status',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Get current quota status for all dimensions
   */
  async getQuotaStatus(organizationId: number): Promise<ServiceResponse<Record<QuotaDimension, QuotaStatus>>> {
    try {
      const { rows } = await pool.query(
        `SELECT dimension, current_usage, quota_limit, period_start, period_end, last_reset_at
         FROM usage_quotas
         WHERE organization_id = $1
         ORDER BY dimension`,
        [organizationId]
      );

      if (rows.length === 0) {
        return {
          success: false,
          error: `No quota records found for organization ${organizationId}`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      const quotaStatus: Record<string, QuotaStatus> = {};

      for (const row of rows) {
        const currentUsage = parseInt(row.current_usage);
        const quotaLimit = parseInt(row.quota_limit);
        const remaining = quotaLimit - currentUsage;
        const percentageUsed = (currentUsage / quotaLimit) * 100;

        quotaStatus[row.dimension] = {
          dimension: row.dimension,
          current_usage: currentUsage,
          quota_limit: quotaLimit,
          remaining: Math.max(0, remaining),
          percentage_used: Math.round(percentageUsed * 100) / 100,
          period_start: row.period_start,
          period_end: row.period_end,
          last_reset_at: row.last_reset_at,
        };
      }

      return {
        success: true,
        data: quotaStatus as Record<QuotaDimension, QuotaStatus>,
      };
    } catch (error: any) {
      console.error('Error getting quota status:', error);
      return {
        success: false,
        error: error.message || 'Failed to get quota status',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Reset monthly quotas for an organization
   * Only resets dimensions with period_end set (api_calls) AND period expired
   * Advances period_end by 1 month to prevent repeated resets
   */
  async resetMonthlyQuotas(organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const { rows } = await pool.query(
        `UPDATE usage_quotas
         SET current_usage = 0,
             last_reset_at = NOW(),
             period_start = NOW(),
             period_end = period_end + INTERVAL '1 month',
             updated_at = NOW()
         WHERE organization_id = $1
           AND dimension = 'api_calls'
           AND period_end IS NOT NULL
           AND period_end < NOW()
         RETURNING dimension`,
        [organizationId]
      );

      const resetCount = rows.length;

      // Clear warning cache for reset dimensions (SF-012)
      for (const row of rows) {
        this.clearWarnings(organizationId, row.dimension);
      }

      // Emit reset event
      this.emit('quota:reset', {
        organizationId,
        dimensions: rows.map((r) => r.dimension),
        timestamp: new Date(),
      });

      return {
        success: true,
        data: resetCount,
      };
    } catch (error: any) {
      console.error('Error resetting monthly quotas:', error);
      return {
        success: false,
        error: error.message || 'Failed to reset monthly quotas',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Reset all monthly quotas across all organizations (scheduled job)
   * Calls the database function
   */
  async resetAllMonthlyQuotas(): Promise<ServiceResponse<number>> {
    try {
      const { rows } = await pool.query('SELECT reset_monthly_quotas() as rows_updated');
      const rowsUpdated = rows[0].rows_updated;

      // Emit global reset event
      this.emit('quota:global_reset', {
        rowsUpdated,
        timestamp: new Date(),
      });

      return {
        success: true,
        data: rowsUpdated,
      };
    } catch (error: any) {
      console.error('Error resetting all monthly quotas:', error);
      return {
        success: false,
        error: error.message || 'Failed to reset all monthly quotas',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }

  /**
   * Set quota override for Enterprise customers
   * Allows manual adjustment of quota limits
   */
  async setQuotaOverride(input: SetQuotaOverrideInput): Promise<ServiceResponse<QuotaStatus>> {
    try {
      const { organizationId, dimension, newLimit } = input;

      if (newLimit <= 0) {
        return {
          success: false,
          error: 'Quota limit must be greater than 0',
          errorCode: ServiceErrorCode.VALIDATION_ERROR,
        };
      }

      // Update quota limit
      const { rows } = await pool.query(
        `UPDATE usage_quotas
         SET quota_limit = $1,
             updated_at = NOW()
         WHERE organization_id = $2 AND dimension = $3
         RETURNING dimension, current_usage, quota_limit, period_start, period_end, last_reset_at`,
        [newLimit, organizationId, dimension]
      );

      if (rows.length === 0) {
        return {
          success: false,
          error: `No quota record found for organization ${organizationId} and dimension ${dimension}`,
          errorCode: ServiceErrorCode.NOT_FOUND,
        };
      }

      const row = rows[0];
      const currentUsage = parseInt(row.current_usage);
      const quotaLimit = parseInt(row.quota_limit);
      const remaining = quotaLimit - currentUsage;
      const percentageUsed = (currentUsage / quotaLimit) * 100;

      const quotaStatus: QuotaStatus = {
        dimension: row.dimension,
        current_usage: currentUsage,
        quota_limit: quotaLimit,
        remaining: Math.max(0, remaining),
        percentage_used: Math.round(percentageUsed * 100) / 100,
        period_start: row.period_start,
        period_end: row.period_end,
        last_reset_at: row.last_reset_at,
      };

      // Clear warning cache when limit changes (SF-012)
      // This allows warnings to fire again based on new limit
      this.clearWarnings(organizationId, dimension);

      // Emit override set event
      this.emit('quota:override_set', {
        organizationId,
        dimension,
        newLimit,
        timestamp: new Date(),
      });

      return {
        success: true,
        data: quotaStatus,
      };
    } catch (error: any) {
      console.error('Error setting quota override:', error);
      return {
        success: false,
        error: error.message || 'Failed to set quota override',
        errorCode: ServiceErrorCode.INTERNAL_ERROR,
      };
    }
  }
}

// Export singleton instance
export const quotaService = new QuotaService();
