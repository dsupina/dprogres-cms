/**
 * MonitoringService (SF-026)
 *
 * Central service for metrics tracking, alerting, and error reporting.
 * Handles webhook failure alerts, payment failure notifications,
 * quota enforcement errors, and API response time monitoring.
 *
 * Features:
 * - In-memory metrics collection with configurable retention
 * - Threshold-based alerting with cooldown periods
 * - Multi-channel notifications (Email, Slack, Sentry)
 * - Billing metrics aggregation for dashboard
 * - System health checks
 *
 * Events emitted:
 * - monitoring:alert_triggered - When an alert threshold is breached
 * - monitoring:metric_recorded - When a metric is recorded
 * - monitoring:health_check - When health check is performed
 *
 * @example
 * ```typescript
 * import { monitoringService } from './services/MonitoringService';
 *
 * // Initialize the service
 * monitoringService.initialize();
 *
 * // Record a webhook metric
 * monitoringService.recordWebhookMetric({
 *   eventId: 'evt_123',
 *   eventType: 'invoice.payment_succeeded',
 *   processingTimeMs: 150,
 *   success: true,
 *   timestamp: new Date(),
 * });
 *
 * // Get billing metrics
 * const metrics = await monitoringService.getBillingMetrics();
 * ```
 */

import { EventEmitter } from 'events';
import { pool } from '../utils/database';
import { emailService } from './EmailService';
import type {
  MetricCategory,
  WebhookMetric,
  WebhookStats,
  WebhookFailure,
  WebhookEventType,
  AlertConfig,
  AlertEvent,
  AlertSeverity,
  AlertChannel,
  BillingMetrics,
  PaymentMetrics,
  HealthStatus,
  ComponentHealth,
  SlackAlertPayload,
  MonitoringConfig,
} from '../types/monitoring';
import { DEFAULT_ALERTS } from '../types/monitoring';

/**
 * ServiceResponse pattern for consistency
 */
interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Internal alert cooldown tracker
 */
interface AlertCooldown {
  alertId: string;
  lastTriggeredAt: Date;
  count: number;
}

export class MonitoringService extends EventEmitter {
  private initialized: boolean = false;
  private config: MonitoringConfig;

  // In-memory metric storage
  private webhookMetrics: WebhookMetric[] = [];
  private apiMetrics: { responseTimeMs: number; timestamp: Date }[] = [];
  private errorMetrics: Map<MetricCategory, { timestamp: Date; error: string }[]> = new Map();

  // Alert management
  private alerts: Map<string, AlertConfig> = new Map();
  private alertCooldowns: Map<string, AlertCooldown> = new Map();

  // Health tracking
  private componentErrors: Map<string, { error: string; timestamp: Date }> = new Map();

  // Cleanup timer
  private cleanupTimer?: NodeJS.Timeout;

  // Default retention: 24 hours
  private readonly DEFAULT_RETENTION_HOURS = 24;
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    super();
    this.config = {
      enabled: true,
      metricsRetentionHours: this.DEFAULT_RETENTION_HOURS,
      alertCooldownMinutes: 30,
    };

    // Initialize error metric categories
    this.errorMetrics.set('webhook', []);
    this.errorMetrics.set('payment', []);
    this.errorMetrics.set('quota', []);
    this.errorMetrics.set('api', []);
    this.errorMetrics.set('database', []);
    this.errorMetrics.set('email', []);
  }

  /**
   * Initialize the monitoring service
   */
  initialize(config?: Partial<MonitoringConfig>): void {
    if (this.initialized) {
      return;
    }

    // Apply configuration
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Load from environment
    this.config.sentryDsn = this.config.sentryDsn || process.env.SENTRY_DSN;
    this.config.slackWebhookUrl = this.config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.config.alertEmail = this.config.alertEmail || process.env.ALERT_EMAIL || process.env.SENDGRID_FROM_EMAIL;

    // Load default alerts
    for (const alert of DEFAULT_ALERTS) {
      this.alerts.set(alert.id, alert);
    }

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref(); // Don't block process exit

    this.initialized = true;
    console.log('[MonitoringService] Initialized with config:', {
      sentryConfigured: !!this.config.sentryDsn,
      slackConfigured: !!this.config.slackWebhookUrl,
      alertEmail: this.config.alertEmail,
      retentionHours: this.config.metricsRetentionHours,
    });
  }

  /**
   * Cleanup old metrics based on retention policy
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.metricsRetentionHours * 60 * 60 * 1000);

    // Cleanup webhook metrics
    this.webhookMetrics = this.webhookMetrics.filter((m) => m.timestamp > cutoff);

    // Cleanup API metrics
    this.apiMetrics = this.apiMetrics.filter((m) => m.timestamp > cutoff);

    // Cleanup error metrics
    for (const [category, errors] of this.errorMetrics) {
      this.errorMetrics.set(
        category,
        errors.filter((e) => e.timestamp > cutoff)
      );
    }

    console.log('[MonitoringService] Cleaned up old metrics, retention:', this.config.metricsRetentionHours, 'hours');
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.webhookMetrics = [];
    this.apiMetrics = [];
    this.errorMetrics.clear();
    this.alertCooldowns.clear();
    this.initialized = false;
  }

  // ============================================
  // Webhook Metrics
  // ============================================

  /**
   * Record a webhook processing metric
   */
  recordWebhookMetric(metric: WebhookMetric): void {
    if (!this.config.enabled) return;

    this.webhookMetrics.push(metric);
    this.emit('monitoring:metric_recorded', { category: 'webhook', metric });

    // Check for failures and potential alerts
    if (!metric.success) {
      this.recordError('webhook', metric.error || 'Unknown webhook error');
      this.checkAlertThreshold('webhook');
    }
  }

  /**
   * Get webhook statistics for a time period
   */
  getWebhookStats(windowMinutes: number = 60): WebhookStats {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const metrics = this.webhookMetrics.filter((m) => m.timestamp > cutoff);

    const successCount = metrics.filter((m) => m.success).length;
    const failureCount = metrics.filter((m) => !m.success).length;
    const totalProcessed = metrics.length;

    // Calculate processing times
    const processingTimes = metrics.map((m) => m.processingTimeMs).sort((a, b) => a - b);
    const avgProcessingTimeMs =
      processingTimes.length > 0
        ? processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length
        : 0;
    // Use nearest-rank method for p95: ceil(n * 0.95) - 1, clamped to valid range
    const p95Index = processingTimes.length > 0
      ? Math.min(Math.ceil(processingTimes.length * 0.95) - 1, processingTimes.length - 1)
      : 0;
    const p95ProcessingTimeMs = processingTimes[p95Index] || 0;

    // Event type breakdown
    const eventTypeBreakdown: Record<string, { count: number; failures: number }> = {};
    for (const metric of metrics) {
      const type = metric.eventType;
      if (!eventTypeBreakdown[type]) {
        eventTypeBreakdown[type] = { count: 0, failures: 0 };
      }
      eventTypeBreakdown[type].count++;
      if (!metric.success) {
        eventTypeBreakdown[type].failures++;
      }
    }

    // Recent failures
    const recentFailures: WebhookFailure[] = metrics
      .filter((m) => !m.success)
      .slice(-10)
      .map((m) => ({
        eventId: m.eventId,
        eventType: m.eventType,
        error: m.error || 'Unknown error',
        timestamp: m.timestamp,
        organizationId: m.organizationId,
      }));

    return {
      totalProcessed,
      successCount,
      failureCount,
      avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
      p95ProcessingTimeMs: Math.round(p95ProcessingTimeMs),
      failureRate: totalProcessed > 0 ? (failureCount / totalProcessed) * 100 : 0,
      eventTypeBreakdown,
      recentFailures,
      periodStart: cutoff,
      periodEnd: new Date(),
    };
  }

  // ============================================
  // Error Tracking
  // ============================================

  /**
   * Record an error for a category
   */
  recordError(category: MetricCategory, error: string): void {
    if (!this.config.enabled) return;

    const errors = this.errorMetrics.get(category) || [];
    errors.push({ timestamp: new Date(), error });
    this.errorMetrics.set(category, errors);

    // Update component health
    this.componentErrors.set(category, { error, timestamp: new Date() });

    // Check alert threshold
    this.checkAlertThreshold(category);
  }

  /**
   * Get error count for a category in a time window
   */
  getErrorCount(category: MetricCategory, windowMinutes: number = 60): number {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const errors = this.errorMetrics.get(category) || [];
    return errors.filter((e) => e.timestamp > cutoff).length;
  }

  // ============================================
  // API Metrics
  // ============================================

  /**
   * Record an API response time
   */
  recordApiResponseTime(responseTimeMs: number): void {
    if (!this.config.enabled) return;

    this.apiMetrics.push({ responseTimeMs, timestamp: new Date() });

    // Check if p95 exceeds threshold
    if (this.apiMetrics.length >= 20) {
      // Need enough samples
      const p95 = this.getApiP95ResponseTime(5);
      const alert = this.alerts.get('api_response_time');
      if (alert && p95 > alert.threshold) {
        this.checkAlertThreshold('api');
      }
    }
  }

  /**
   * Get API p95 response time
   */
  getApiP95ResponseTime(windowMinutes: number = 5): number {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const times = this.apiMetrics
      .filter((m) => m.timestamp > cutoff)
      .map((m) => m.responseTimeMs)
      .sort((a, b) => a - b);

    if (times.length === 0) return 0;

    // Use nearest-rank method for p95: ceil(n * 0.95) - 1, clamped to valid range
    const p95Index = Math.min(Math.ceil(times.length * 0.95) - 1, times.length - 1);
    return times[p95Index] || times[times.length - 1];
  }

  // ============================================
  // Alert System
  // ============================================

  /**
   * Check if an alert threshold is breached
   */
  private checkAlertThreshold(category: MetricCategory): void {
    // Find alerts for this category
    const categoryAlerts = Array.from(this.alerts.values()).filter(
      (a) => a.category === category && a.enabled
    );

    for (const alert of categoryAlerts) {
      let currentValue: number;

      // API response time alert uses p95 latency, not error count
      if (alert.id === 'api_response_time') {
        currentValue = this.getApiP95ResponseTime(alert.windowMinutes);
      } else {
        currentValue = this.getErrorCount(category, alert.windowMinutes);
      }

      if (currentValue > alert.threshold) {
        this.triggerAlert(alert, currentValue);
      }
    }
  }

  /**
   * Trigger an alert if not in cooldown
   */
  private async triggerAlert(alert: AlertConfig, currentValue: number): Promise<void> {
    const cooldown = this.alertCooldowns.get(alert.id);
    const now = new Date();

    // Check cooldown
    if (cooldown) {
      const cooldownExpiry = new Date(
        cooldown.lastTriggeredAt.getTime() + alert.cooldownMinutes * 60 * 1000
      );
      if (now < cooldownExpiry) {
        console.log(`[MonitoringService] Alert ${alert.id} in cooldown, skipping`);
        return;
      }
    }

    // Create alert event
    const alertEvent: AlertEvent = {
      alertId: alert.id,
      alertName: alert.name,
      severity: alert.severity,
      category: alert.category,
      message: `${alert.name}: ${currentValue} occurrences in last ${alert.windowMinutes} minutes (threshold: ${alert.threshold})`,
      currentValue,
      threshold: alert.threshold,
      timestamp: now,
      context: {
        windowMinutes: alert.windowMinutes,
        recentErrors: (this.errorMetrics.get(alert.category) || []).slice(-5),
      },
    };

    // Update cooldown
    this.alertCooldowns.set(alert.id, {
      alertId: alert.id,
      lastTriggeredAt: now,
      count: (cooldown?.count || 0) + 1,
    });

    // Emit event
    this.emit('monitoring:alert_triggered', alertEvent);

    // Send to configured channels
    await this.sendAlertToChannels(alert.channels, alertEvent);

    console.log(`[MonitoringService] Alert triggered: ${alert.name}`, alertEvent);
  }

  /**
   * Send alert to configured channels
   */
  private async sendAlertToChannels(
    channels: AlertChannel[],
    event: AlertEvent
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    if (channels.includes('email') && this.config.alertEmail) {
      promises.push(this.sendEmailAlert(event));
    }

    if (channels.includes('slack') && this.config.slackWebhookUrl) {
      promises.push(this.sendSlackAlert(event));
    }

    if (channels.includes('sentry') && this.config.sentryDsn) {
      promises.push(this.sendSentryAlert(event));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send alert via email
   */
  private async sendEmailAlert(event: AlertEvent): Promise<void> {
    const severityEmoji =
      event.severity === 'critical' ? '🚨' : event.severity === 'warning' ? '⚠️' : 'ℹ️';
    const severityColor =
      event.severity === 'critical' ? '#dc2626' : event.severity === 'warning' ? '#f59e0b' : '#2563eb';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fff; border-radius: 8px; padding: 24px; border-left: 4px solid ${severityColor};">
    <h1 style="color: ${severityColor}; margin: 0 0 16px 0; font-size: 20px;">
      ${severityEmoji} ${event.alertName}
    </h1>
    <p style="color: #333; margin: 0 0 16px 0; font-size: 14px;">${event.message}</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #666;">Severity</td><td style="padding: 8px 0; font-weight: 600;">${event.severity.toUpperCase()}</td></tr>
      <tr><td style="padding: 8px 0; color: #666;">Category</td><td style="padding: 8px 0;">${event.category}</td></tr>
      <tr><td style="padding: 8px 0; color: #666;">Current Value</td><td style="padding: 8px 0;">${event.currentValue}</td></tr>
      <tr><td style="padding: 8px 0; color: #666;">Threshold</td><td style="padding: 8px 0;">${event.threshold}</td></tr>
      <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0;">${event.timestamp.toISOString()}</td></tr>
    </table>
  </div>
  <p style="color: #999; font-size: 12px; margin-top: 16px; text-align: center;">
    DProgres CMS Monitoring Alert
  </p>
</body>
</html>`;

    const text = `
${severityEmoji} ${event.alertName}

${event.message}

Severity: ${event.severity.toUpperCase()}
Category: ${event.category}
Current Value: ${event.currentValue}
Threshold: ${event.threshold}
Time: ${event.timestamp.toISOString()}

---
DProgres CMS Monitoring Alert
`;

    try {
      await emailService.sendEmail({
        to: [{ email: this.config.alertEmail! }],
        subject: `[${event.severity.toUpperCase()}] ${event.alertName}`,
        html,
        text,
      });
      console.log(`[MonitoringService] Email alert sent to ${this.config.alertEmail}`);
    } catch (error) {
      console.error('[MonitoringService] Failed to send email alert:', error);
    }
  }

  /**
   * Send alert via Slack webhook
   */
  private async sendSlackAlert(event: AlertEvent): Promise<void> {
    const color =
      event.severity === 'critical' ? '#dc2626' : event.severity === 'warning' ? '#f59e0b' : '#2563eb';

    const payload: SlackAlertPayload = {
      username: 'DProgres CMS Alerts',
      icon_emoji: event.severity === 'critical' ? ':rotating_light:' : ':warning:',
      attachments: [
        {
          color,
          title: event.alertName,
          text: event.message,
          fields: [
            { title: 'Severity', value: event.severity.toUpperCase(), short: true },
            { title: 'Category', value: event.category, short: true },
            { title: 'Current Value', value: String(event.currentValue), short: true },
            { title: 'Threshold', value: String(event.threshold), short: true },
          ],
          footer: 'DProgres CMS Monitoring',
          ts: Math.floor(event.timestamp.getTime() / 1000),
        },
      ],
    };

    try {
      const response = await fetch(this.config.slackWebhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status}`);
      }

      console.log('[MonitoringService] Slack alert sent');
    } catch (error) {
      console.error('[MonitoringService] Failed to send Slack alert:', error);
    }
  }

  /**
   * Send alert to Sentry (captures as an error event)
   */
  private async sendSentryAlert(event: AlertEvent): Promise<void> {
    // Sentry integration is handled in index.ts
    // Here we just log the context for the global error handler
    console.error(`[SENTRY_ALERT] ${event.alertName}:`, {
      alertId: event.alertId,
      severity: event.severity,
      category: event.category,
      currentValue: event.currentValue,
      threshold: event.threshold,
      message: event.message,
    });
  }

  // ============================================
  // Billing Metrics
  // ============================================

  /**
   * Get billing metrics for dashboard
   */
  async getBillingMetrics(): Promise<ServiceResponse<BillingMetrics>> {
    try {
      // MRR calculation: Sum of monthly amount for ACTIVE subscriptions only
      // For annual subscriptions, divide by 12
      // Status counts include ALL subscriptions for accurate dashboard reporting
      // MRR only includes ACTIVE paid subscriptions (not trialing or past_due)
      // trialing = hasn't paid yet, past_due = payment failed
      const { rows: mrrRows } = await pool.query(`
        SELECT
          ROUND(SUM(CASE
            WHEN status = 'active' AND billing_cycle = 'annual' THEN amount_cents / 12.0
            WHEN status = 'active' THEN amount_cents
            ELSE 0
          END))::integer as mrr,
          COUNT(*) as total_subscriptions,
          COUNT(*) FILTER (WHERE plan_tier = 'free') as free_count,
          COUNT(*) FILTER (WHERE plan_tier = 'starter') as starter_count,
          COUNT(*) FILTER (WHERE plan_tier = 'pro') as pro_count,
          COUNT(*) FILTER (WHERE plan_tier = 'enterprise') as enterprise_count,
          COUNT(*) FILTER (WHERE status = 'active') as active_count,
          COUNT(*) FILTER (WHERE status = 'trialing') as trialing_count,
          COUNT(*) FILTER (WHERE status = 'past_due') as past_due_count,
          COUNT(*) FILTER (WHERE status = 'canceled') as canceled_count
        FROM subscriptions
      `);

      const mrrData = mrrRows[0];
      const mrr = parseInt(mrrData.mrr) || 0;

      // Churn rate: Canceled in last 30 days / Active at start of period
      const { rows: churnRows } = await pool.query(`
        WITH period_start AS (
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE created_at < NOW() - INTERVAL '30 days'
            AND (canceled_at IS NULL OR canceled_at > NOW() - INTERVAL '30 days')
        ),
        churned AS (
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE canceled_at > NOW() - INTERVAL '30 days'
            AND status = 'canceled'
        )
        SELECT
          COALESCE(churned.count, 0) as churned,
          COALESCE(period_start.count, 1) as base
        FROM churned, period_start
      `);

      const churnRate =
        churnRows[0].base > 0 ? (churnRows[0].churned / churnRows[0].base) * 100 : 0;

      // Trial conversion rate
      const { rows: conversionRows } = await pool.query(`
        WITH trials AS (
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE trial_end IS NOT NULL
            AND trial_end < NOW()
        ),
        converted AS (
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE trial_end IS NOT NULL
            AND trial_end < NOW()
            AND status = 'active'
        )
        SELECT
          COALESCE(converted.count, 0) as converted,
          COALESCE(trials.count, 1) as total
        FROM converted, trials
      `);

      const conversionRate =
        conversionRows[0].total > 0
          ? (conversionRows[0].converted / conversionRows[0].total) * 100
          : 0;

      // ARPU - only calculate if there are active subscribers, otherwise 0
      const activeCount = parseInt(mrrData.active_count) || 0;
      const arpu = activeCount > 0 ? mrr / activeCount : 0;

      return {
        success: true,
        data: {
          mrr,
          arr: mrr * 12,
          subscriptionCount: parseInt(mrrData.total_subscriptions) || 0,
          subscriptionsByTier: {
            free: parseInt(mrrData.free_count) || 0,
            starter: parseInt(mrrData.starter_count) || 0,
            pro: parseInt(mrrData.pro_count) || 0,
            enterprise: parseInt(mrrData.enterprise_count) || 0,
          },
          subscriptionsByStatus: {
            active: parseInt(mrrData.active_count) || 0,
            trialing: parseInt(mrrData.trialing_count) || 0,
            past_due: parseInt(mrrData.past_due_count) || 0,
            canceled: parseInt(mrrData.canceled_count) || 0,
          },
          churnRate: Math.round(churnRate * 100) / 100,
          trialCount: parseInt(mrrData.trialing_count) || 0,
          conversionRate: Math.round(conversionRate * 100) / 100,
          avgRevenuePerUser: Math.round(arpu),
          periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
        },
      };
    } catch (error: any) {
      console.error('[MonitoringService] Error getting billing metrics:', error);
      this.recordError('database', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get payment metrics for dashboard
   *
   * Combines two data sources:
   * 1. Database: Finalized invoice statuses (paid, uncollectible)
   * 2. In-memory: Recent payment failures still in retry (invoice.payment_failed events)
   *
   * This ensures we capture in-progress failures during Stripe's retry window,
   * not just final outcomes after all retries are exhausted.
   */
  async getPaymentMetrics(days: number = 30): Promise<ServiceResponse<PaymentMetrics>> {
    try {
      // Get finalized payment results from database
      // - 'paid' = successful payment
      // - 'uncollectible' = all retries exhausted, payment failed
      const { rows } = await pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE status IN ('paid', 'uncollectible')) as finalized_attempts,
          COUNT(*) FILTER (WHERE status = 'paid') as successful,
          COUNT(*) FILTER (WHERE status = 'uncollectible') as finalized_failed,
          SUM(CASE WHEN status = 'paid' THEN amount_paid_cents ELSE 0 END) as revenue,
          AVG(CASE WHEN status = 'paid' THEN amount_paid_cents ELSE NULL END) as avg_amount
        FROM invoices
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `
      );

      const data = rows[0];
      const finalizedAttempts = parseInt(data.finalized_attempts) || 0;
      const successful = parseInt(data.successful) || 0;
      const finalizedFailed = parseInt(data.finalized_failed) || 0;

      // Get in-progress payment failures from in-memory tracking
      // These are invoice.payment_failed events where invoice is still 'open' (in retry)
      // Convert days to minutes for the in-memory query
      const windowMinutes = days * 24 * 60;
      const inProgressFailures = this.getErrorCount('payment', windowMinutes);

      // Combine metrics:
      // - Total attempts = finalized (paid + uncollectible) + in-progress failures
      // - Failed = finalized failures + in-progress failures
      // Note: Some in-progress failures may eventually succeed, so this is a
      // point-in-time snapshot that captures active issues
      const totalAttempts = finalizedAttempts + inProgressFailures;
      const totalFailed = finalizedFailed + inProgressFailures;

      return {
        success: true,
        data: {
          totalPayments: totalAttempts,
          successfulPayments: successful,
          failedPayments: totalFailed,
          // Success rate accounts for both finalized and in-progress failures
          successRate: totalAttempts > 0 ? (successful / totalAttempts) * 100 : 0,
          totalRevenue: parseInt(data.revenue) || 0,
          avgPaymentAmount: Math.round(parseFloat(data.avg_amount) || 0),
          periodStart: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
        },
      };
    } catch (error: any) {
      console.error('[MonitoringService] Error getting payment metrics:', error);
      this.recordError('database', error.message);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // Health Checks
  // ============================================

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<ServiceResponse<HealthStatus>> {
    const components: HealthStatus['components'] = {
      database: await this.checkDatabaseHealth(),
      stripe: this.checkStripeHealth(),
      email: this.checkEmailHealth(),
      webhooks: this.checkWebhooksHealth(),
    };

    // Determine overall health
    const statuses = Object.values(components).map((c) => c.status);
    let overall: HealthStatus['overall'] = 'healthy';
    if (statuses.includes('unhealthy')) {
      overall = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overall = 'degraded';
    }

    const status: HealthStatus = {
      overall,
      components,
      lastChecked: new Date(),
    };

    this.emit('monitoring:health_check', status);

    return { success: true, data: status };
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await pool.query('SELECT 1');
      const latencyMs = Date.now() - start;

      return {
        status: latencyMs > 100 ? 'degraded' : 'healthy',
        latencyMs,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        lastError: error.message,
        lastErrorAt: new Date(),
      };
    }
  }

  /**
   * Check Stripe health (based on recent errors)
   */
  private checkStripeHealth(): ComponentHealth {
    const errorCount = this.getErrorCount('payment', 5);
    const webhookErrors = this.getErrorCount('webhook', 5);

    if (errorCount > 5 || webhookErrors > 5) {
      return {
        status: 'unhealthy',
        lastError: 'High error rate',
        lastErrorAt: this.componentErrors.get('payment')?.timestamp,
      };
    }
    if (errorCount > 2 || webhookErrors > 2) {
      return { status: 'degraded' };
    }
    return { status: 'healthy' };
  }

  /**
   * Check email health
   */
  private checkEmailHealth(): ComponentHealth {
    const errorCount = this.getErrorCount('email', 60);

    if (errorCount > 10) {
      return {
        status: 'unhealthy',
        lastError: 'High email failure rate',
        lastErrorAt: this.componentErrors.get('email')?.timestamp,
      };
    }
    if (errorCount > 3) {
      return { status: 'degraded' };
    }
    return { status: 'healthy' };
  }

  /**
   * Check webhooks health
   */
  private checkWebhooksHealth(): ComponentHealth {
    const stats = this.getWebhookStats(60);

    if (stats.failureRate > 20) {
      return {
        status: 'unhealthy',
        successRate: 100 - stats.failureRate,
        lastError: stats.recentFailures[0]?.error,
        lastErrorAt: stats.recentFailures[0]?.timestamp,
      };
    }
    if (stats.failureRate > 5) {
      return {
        status: 'degraded',
        successRate: 100 - stats.failureRate,
      };
    }
    return {
      status: 'healthy',
      successRate: 100 - stats.failureRate,
      latencyMs: stats.avgProcessingTimeMs,
    };
  }

  // ============================================
  // Alert Management
  // ============================================

  /**
   * Get all configured alerts
   */
  getAlerts(): AlertConfig[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Update alert configuration
   */
  updateAlert(alertId: string, updates: Partial<AlertConfig>): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    this.alerts.set(alertId, { ...alert, ...updates });
    return true;
  }

  /**
   * Get alert cooldown status
   */
  getAlertCooldowns(): Map<string, AlertCooldown> {
    return new Map(this.alertCooldowns);
  }

  /**
   * Reset alert cooldown (for testing or manual reset)
   */
  resetAlertCooldown(alertId: string): boolean {
    return this.alertCooldowns.delete(alertId);
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();
