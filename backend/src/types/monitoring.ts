/**
 * Monitoring & Alerting Types (SF-026)
 *
 * Type definitions for the monitoring system including metrics,
 * alerts, and health checks.
 */

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert channels for notifications
 */
export type AlertChannel = 'email' | 'slack' | 'sentry';

/**
 * Metric categories for tracking
 */
export type MetricCategory =
  | 'webhook'
  | 'payment'
  | 'quota'
  | 'api'
  | 'database'
  | 'email';

/**
 * Webhook event types for metrics
 */
export type WebhookEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'customer.updated'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'customer.subscription.trial_will_end'
  | 'invoice.upcoming'
  | 'unknown';

/**
 * Individual metric entry
 */
export interface MetricEntry {
  category: MetricCategory;
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string | number>;
}

/**
 * Webhook processing metric
 */
export interface WebhookMetric {
  eventId: string;
  eventType: WebhookEventType;
  processingTimeMs: number;
  success: boolean;
  error?: string;
  timestamp: Date;
  organizationId?: number;
  retryCount?: number;
}

/**
 * Aggregated webhook statistics
 */
export interface WebhookStats {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  avgProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  failureRate: number;
  eventTypeBreakdown: Record<string, { count: number; failures: number }>;
  recentFailures: WebhookFailure[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Webhook failure entry for alerting
 */
export interface WebhookFailure {
  eventId: string;
  eventType: WebhookEventType;
  error: string;
  timestamp: Date;
  organizationId?: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  id: string;
  name: string;
  description: string;
  category: MetricCategory;
  threshold: number;
  windowMinutes: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  cooldownMinutes: number; // Prevent alert spam
}

/**
 * Alert event when threshold is breached
 */
export interface AlertEvent {
  alertId: string;
  alertName: string;
  severity: AlertSeverity;
  category: MetricCategory;
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Alert history entry
 */
export interface AlertHistoryEntry {
  id: number;
  alertId: string;
  alertName: string;
  severity: AlertSeverity;
  message: string;
  channels: AlertChannel[];
  sentAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: number;
}

/**
 * Billing metrics for dashboard
 */
export interface BillingMetrics {
  mrr: number; // Monthly Recurring Revenue in cents
  arr: number; // Annual Recurring Revenue in cents
  subscriptionCount: number;
  subscriptionsByTier: Record<string, number>;
  subscriptionsByStatus: Record<string, number>;
  churnRate: number; // Percentage
  trialCount: number;
  conversionRate: number; // Trial to paid percentage
  avgRevenuePerUser: number; // ARPU in cents
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Payment metrics
 */
export interface PaymentMetrics {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  successRate: number;
  totalRevenue: number; // In cents
  avgPaymentAmount: number; // In cents
  periodStart: Date;
  periodEnd: Date;
}

/**
 * System health status
 */
export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    database: ComponentHealth;
    stripe: ComponentHealth;
    email: ComponentHealth;
    webhooks: ComponentHealth;
  };
  lastChecked: Date;
}

/**
 * Individual component health
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  lastError?: string;
  lastErrorAt?: Date;
  successRate?: number;
}

/**
 * Slack webhook payload for alerts
 */
export interface SlackAlertPayload {
  channel?: string;
  username?: string;
  icon_emoji?: string;
  attachments: SlackAttachment[];
}

/**
 * Slack message attachment
 */
export interface SlackAttachment {
  color: string;
  title: string;
  text: string;
  fields?: SlackField[];
  footer?: string;
  ts?: number;
}

/**
 * Slack attachment field
 */
export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

/**
 * Monitoring service configuration
 */
export interface MonitoringConfig {
  enabled: boolean;
  sentryDsn?: string;
  slackWebhookUrl?: string;
  alertEmail?: string;
  metricsRetentionHours: number;
  alertCooldownMinutes: number;
}

/**
 * Default alert configurations
 */
export const DEFAULT_ALERTS: AlertConfig[] = [
  {
    id: 'webhook_failure_rate',
    name: 'Webhook Failure Alert',
    description: 'Alert when webhook failures exceed threshold',
    category: 'webhook',
    threshold: 5, // >5 failures in window
    windowMinutes: 60, // 1 hour
    severity: 'critical',
    channels: ['email', 'slack', 'sentry'],
    enabled: true,
    cooldownMinutes: 30,
  },
  {
    id: 'payment_failure_rate',
    name: 'Payment Failure Alert',
    description: 'Alert when payment failures exceed threshold',
    category: 'payment',
    threshold: 3, // >3 failures in window
    windowMinutes: 60, // 1 hour
    severity: 'critical',
    channels: ['email', 'slack'],
    enabled: true,
    cooldownMinutes: 60,
  },
  {
    id: 'quota_enforcement_errors',
    name: 'Quota Enforcement Error Alert',
    description: 'Alert on quota enforcement system errors',
    category: 'quota',
    threshold: 10, // >10 errors in window
    windowMinutes: 60, // 1 hour
    severity: 'warning',
    channels: ['email'],
    enabled: true,
    cooldownMinutes: 120,
  },
  {
    id: 'api_response_time',
    name: 'API Response Time Alert',
    description: 'Alert when API p95 response time exceeds threshold',
    category: 'api',
    threshold: 300, // >300ms p95
    windowMinutes: 5,
    severity: 'warning',
    channels: ['slack'],
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    id: 'database_connection_errors',
    name: 'Database Connection Error Alert',
    description: 'Alert on database connection failures',
    category: 'database',
    threshold: 3, // >3 errors in window
    windowMinutes: 5,
    severity: 'critical',
    channels: ['email', 'slack', 'sentry'],
    enabled: true,
    cooldownMinutes: 10,
  },
  {
    id: 'email_delivery_failures',
    name: 'Email Delivery Failure Alert',
    description: 'Alert when SendGrid delivery failures exceed threshold',
    category: 'email',
    threshold: 5, // >5 failures in window
    windowMinutes: 60,
    severity: 'warning',
    channels: ['slack'],
    enabled: true,
    cooldownMinutes: 60,
  },
];
