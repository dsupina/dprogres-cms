import { EventEmitter } from 'events';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types/versioning';

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
 */
export class QuotaService extends EventEmitter {
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
        };
      }

      // Get updated quota status to check thresholds
      const statusResult = await this.getQuotaStatusForDimension(organizationId, dimension);

      if (statusResult.success && statusResult.data) {
        const percentageUsed = statusResult.data.percentage_used;

        // Emit approaching limit events at thresholds
        if (percentageUsed >= 95) {
          this.emit('quota:approaching_limit', {
            organizationId,
            dimension,
            percentage: 95,
            current: statusResult.data.current_usage,
            limit: statusResult.data.quota_limit,
            timestamp: new Date(),
          });
        } else if (percentageUsed >= 90) {
          this.emit('quota:approaching_limit', {
            organizationId,
            dimension,
            percentage: 90,
            current: statusResult.data.current_usage,
            limit: statusResult.data.quota_limit,
            timestamp: new Date(),
          });
        } else if (percentageUsed >= 80) {
          this.emit('quota:approaching_limit', {
            organizationId,
            dimension,
            percentage: 80,
            current: statusResult.data.current_usage,
            limit: statusResult.data.quota_limit,
            timestamp: new Date(),
          });
        }

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
      };
    }
  }

  /**
   * Decrement quota usage (when deleting resources)
   * Uses SELECT FOR UPDATE to prevent race conditions
   */
  async decrementQuota(input: DecrementQuotaInput): Promise<ServiceResponse<boolean>> {
    const client = await pool.connect();

    try {
      const { organizationId, dimension, amount = 1 } = input;

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
      await client.query('ROLLBACK');
      console.error('Error decrementing quota:', error);
      return {
        success: false,
        error: error.message || 'Failed to decrement quota',
      };
    } finally {
      client.release();
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
      };
    }
  }

  /**
   * Reset monthly quotas for an organization
   * Only resets dimensions with period_end set (api_calls)
   */
  async resetMonthlyQuotas(organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const { rows } = await pool.query(
        `UPDATE usage_quotas
         SET current_usage = 0,
             last_reset_at = NOW(),
             period_start = NOW(),
             updated_at = NOW()
         WHERE organization_id = $1
           AND dimension = 'api_calls'
           AND period_end IS NOT NULL
         RETURNING dimension`,
        [organizationId]
      );

      const resetCount = rows.length;

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
      };
    }
  }
}

// Export singleton instance
export const quotaService = new QuotaService();
