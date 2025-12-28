/**
 * Metrics API Routes (SF-026)
 *
 * Provides endpoints for the monitoring dashboard including:
 * - Billing metrics (MRR, subscriptions, churn)
 * - Webhook statistics
 * - Payment metrics
 * - System health status
 * - Alert configuration
 *
 * All endpoints require admin authentication.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { monitoringService } from '../services/MonitoringService';
import Joi from 'joi';

const router = Router();

/**
 * GET /api/metrics/billing
 * Get billing metrics for dashboard (MRR, subscriptions, churn)
 *
 * Response:
 * - mrr: Monthly Recurring Revenue in cents
 * - arr: Annual Recurring Revenue in cents
 * - subscriptionCount: Total active subscriptions
 * - subscriptionsByTier: Breakdown by plan tier
 * - subscriptionsByStatus: Breakdown by status
 * - churnRate: Percentage of churned subscriptions (30 days)
 * - trialCount: Active trials
 * - conversionRate: Trial to paid conversion rate
 * - avgRevenuePerUser: ARPU in cents
 */
router.get('/billing', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await monitoringService.getBillingMetrics();

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Format for display
    const data = result.data!;
    res.json({
      success: true,
      data: {
        ...data,
        mrr_display: `$${(data.mrr / 100).toFixed(2)}`,
        arr_display: `$${(data.arr / 100).toFixed(2)}`,
        arpu_display: `$${(data.avgRevenuePerUser / 100).toFixed(2)}`,
        churn_rate_display: `${data.churnRate.toFixed(1)}%`,
        conversion_rate_display: `${data.conversionRate.toFixed(1)}%`,
      },
    });
  } catch (error: any) {
    console.error('Error getting billing metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve billing metrics',
    });
  }
});

/**
 * GET /api/metrics/webhooks
 * Get webhook processing statistics
 *
 * Query params:
 * - window: Time window in minutes (default: 60)
 *
 * Response:
 * - totalProcessed: Total webhooks processed
 * - successCount: Successful webhooks
 * - failureCount: Failed webhooks
 * - failureRate: Percentage of failures
 * - avgProcessingTimeMs: Average processing time
 * - p95ProcessingTimeMs: 95th percentile processing time
 * - eventTypeBreakdown: Stats per event type
 * - recentFailures: Last 10 failures with details
 */
router.get('/webhooks', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const windowMinutes = Math.min(Math.max(parseInt(req.query.window as string) || 60, 5), 1440);

    const stats = monitoringService.getWebhookStats(windowMinutes);

    res.json({
      success: true,
      data: {
        ...stats,
        failure_rate_display: `${stats.failureRate.toFixed(1)}%`,
        avg_time_display: `${stats.avgProcessingTimeMs}ms`,
        p95_time_display: `${stats.p95ProcessingTimeMs}ms`,
        window_minutes: windowMinutes,
      },
    });
  } catch (error: any) {
    console.error('Error getting webhook stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve webhook statistics',
    });
  }
});

/**
 * GET /api/metrics/payments
 * Get payment metrics
 *
 * Query params:
 * - days: Number of days to look back (default: 30, max: 365)
 *
 * Response:
 * - totalPayments: Total payment attempts
 * - successfulPayments: Successful payments
 * - failedPayments: Failed payments
 * - successRate: Payment success rate percentage
 * - totalRevenue: Total revenue in cents
 * - avgPaymentAmount: Average payment in cents
 */
router.get('/payments', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);

    const result = await monitoringService.getPaymentMetrics(days);

    if (!result.success) {
      return res.status(500).json(result);
    }

    const data = result.data!;
    res.json({
      success: true,
      data: {
        ...data,
        success_rate_display: `${data.successRate.toFixed(1)}%`,
        total_revenue_display: `$${(data.totalRevenue / 100).toFixed(2)}`,
        avg_payment_display: `$${(data.avgPaymentAmount / 100).toFixed(2)}`,
        days,
      },
    });
  } catch (error: any) {
    console.error('Error getting payment metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment metrics',
    });
  }
});

/**
 * GET /api/metrics/health
 * Get system health status
 *
 * Response:
 * - overall: 'healthy' | 'degraded' | 'unhealthy'
 * - components: Health status of each component
 *   - database
 *   - stripe
 *   - email
 *   - webhooks
 */
router.get('/health', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await monitoringService.getHealthStatus();

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('Error getting health status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve health status',
    });
  }
});

/**
 * GET /api/metrics/alerts
 * Get configured alerts and their status
 *
 * Response:
 * - alerts: Array of alert configurations
 * - cooldowns: Current cooldown status for each alert
 */
router.get('/alerts', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const alerts = monitoringService.getAlerts();
    const cooldowns = monitoringService.getAlertCooldowns();

    // Convert cooldowns Map to object
    const cooldownsObj: Record<string, any> = {};
    for (const [id, cooldown] of cooldowns) {
      cooldownsObj[id] = {
        lastTriggeredAt: cooldown.lastTriggeredAt,
        count: cooldown.count,
      };
    }

    res.json({
      success: true,
      data: {
        alerts,
        cooldowns: cooldownsObj,
      },
    });
  } catch (error: any) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alerts',
    });
  }
});

/**
 * PATCH /api/metrics/alerts/:alertId
 * Update alert configuration
 *
 * Body:
 * - enabled?: boolean
 * - threshold?: number
 * - windowMinutes?: number
 * - cooldownMinutes?: number
 * - channels?: AlertChannel[]
 */
const updateAlertSchema = Joi.object({
  enabled: Joi.boolean(),
  threshold: Joi.number().integer().min(1),
  windowMinutes: Joi.number().integer().min(1).max(1440),
  cooldownMinutes: Joi.number().integer().min(1).max(1440),
  channels: Joi.array().items(Joi.string().valid('email', 'slack', 'sentry')),
});

router.patch('/alerts/:alertId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { error, value } = updateAlertSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }

    const updated = monitoringService.updateAlert(alertId, value);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update alert',
    });
  }
});

/**
 * POST /api/metrics/alerts/:alertId/reset
 * Reset alert cooldown (for testing or manual intervention)
 */
router.post('/alerts/:alertId/reset', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;

    const reset = monitoringService.resetAlertCooldown(alertId);

    res.json({
      success: true,
      message: reset ? 'Alert cooldown reset' : 'No cooldown was active',
    });
  } catch (error: any) {
    console.error('Error resetting alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset alert cooldown',
    });
  }
});

/**
 * GET /api/metrics/summary
 * Get a summary of all key metrics for dashboard overview
 */
router.get('/summary', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    // Fetch all metrics in parallel
    const [billing, payments, health, webhooks] = await Promise.all([
      monitoringService.getBillingMetrics(),
      monitoringService.getPaymentMetrics(30),
      monitoringService.getHealthStatus(),
      Promise.resolve(monitoringService.getWebhookStats(60)),
    ]);

    res.json({
      success: true,
      data: {
        billing: billing.success ? {
          mrr: billing.data!.mrr,
          mrr_display: `$${(billing.data!.mrr / 100).toFixed(0)}`,
          subscriptions: billing.data!.subscriptionCount,
          churn_rate: billing.data!.churnRate,
        } : null,
        payments: payments.success ? {
          success_rate: payments.data!.successRate,
          revenue_30d: payments.data!.totalRevenue,
          revenue_display: `$${(payments.data!.totalRevenue / 100).toFixed(0)}`,
        } : null,
        health: health.success ? {
          overall: health.data!.overall,
          components: Object.fromEntries(
            Object.entries(health.data!.components).map(([k, v]) => [k, v.status])
          ),
        } : null,
        webhooks: {
          processed_1h: webhooks.totalProcessed,
          failure_rate: webhooks.failureRate,
          avg_time_ms: webhooks.avgProcessingTimeMs,
        },
        generated_at: new Date(),
      },
    });
  } catch (error: any) {
    console.error('Error getting metrics summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics summary',
    });
  }
});

export default router;
