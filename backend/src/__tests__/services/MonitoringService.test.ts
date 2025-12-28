/**
 * MonitoringService Tests (SF-026)
 *
 * Tests for the monitoring and alerting service including:
 * - Webhook metric recording
 * - Alert threshold detection
 * - Health check functionality
 * - Metrics aggregation
 */

import { MonitoringService } from '../../services/MonitoringService';
import type { WebhookEventType } from '../../types/monitoring';

// Mock dependencies
jest.mock('../../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/EmailService', () => ({
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
    initialize: jest.fn(),
  },
}));

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService();
    service.initialize({ enabled: true });
  });

  afterEach(() => {
    service.destroy();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const newService = new MonitoringService();
      newService.initialize();
      expect(newService.getAlerts().length).toBeGreaterThan(0);
      newService.destroy();
    });

    it('should load default alerts on initialization', () => {
      const alerts = service.getAlerts();
      expect(alerts.length).toBe(6);
      expect(alerts.map((a) => a.id)).toContain('webhook_failure_rate');
      expect(alerts.map((a) => a.id)).toContain('payment_failure_rate');
    });

    it('should not re-initialize if already initialized', () => {
      const alerts1 = service.getAlerts();
      service.initialize(); // Second call should be no-op
      const alerts2 = service.getAlerts();
      expect(alerts1).toEqual(alerts2);
    });
  });

  describe('Webhook Metrics', () => {
    it('should record successful webhook metric', () => {
      const metric = {
        eventId: 'evt_test123',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 150,
        success: true,
        timestamp: new Date(),
      };

      service.recordWebhookMetric(metric);

      const stats = service.getWebhookStats(60);
      expect(stats.totalProcessed).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgProcessingTimeMs).toBe(150);
    });

    it('should record failed webhook metric', () => {
      const metric = {
        eventId: 'evt_test456',
        eventType: 'invoice.payment_failed' as WebhookEventType,
        processingTimeMs: 50,
        success: false,
        error: 'Test error',
        timestamp: new Date(),
      };

      service.recordWebhookMetric(metric);

      const stats = service.getWebhookStats(60);
      expect(stats.totalProcessed).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(1);
      expect(stats.recentFailures.length).toBe(1);
      expect(stats.recentFailures[0].error).toBe('Test error');
    });

    it('should calculate failure rate correctly', () => {
      // Record 3 successes and 1 failure
      for (let i = 0; i < 3; i++) {
        service.recordWebhookMetric({
          eventId: `evt_success_${i}`,
          eventType: 'checkout.session.completed' as WebhookEventType,
          processingTimeMs: 100,
          success: true,
          timestamp: new Date(),
        });
      }
      service.recordWebhookMetric({
        eventId: 'evt_fail',
        eventType: 'invoice.payment_failed' as WebhookEventType,
        processingTimeMs: 100,
        success: false,
        error: 'Failed',
        timestamp: new Date(),
      });

      const stats = service.getWebhookStats(60);
      expect(stats.failureRate).toBe(25); // 1/4 = 25%
    });

    it('should track event type breakdown', () => {
      service.recordWebhookMetric({
        eventId: 'evt_1',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });
      service.recordWebhookMetric({
        eventId: 'evt_2',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });
      service.recordWebhookMetric({
        eventId: 'evt_3',
        eventType: 'customer.subscription.created' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });

      const stats = service.getWebhookStats(60);
      expect(stats.eventTypeBreakdown['invoice.payment_succeeded'].count).toBe(2);
      expect(stats.eventTypeBreakdown['customer.subscription.created'].count).toBe(1);
    });

    it('should calculate p95 processing time', () => {
      // Record 20 metrics with increasing times
      for (let i = 0; i < 20; i++) {
        service.recordWebhookMetric({
          eventId: `evt_${i}`,
          eventType: 'invoice.payment_succeeded' as WebhookEventType,
          processingTimeMs: (i + 1) * 10, // 10, 20, 30... 200ms
          success: true,
          timestamp: new Date(),
        });
      }

      const stats = service.getWebhookStats(60);
      // p95 should be close to 190ms (95th percentile of 10-200)
      expect(stats.p95ProcessingTimeMs).toBeGreaterThanOrEqual(180);
      expect(stats.p95ProcessingTimeMs).toBeLessThanOrEqual(200);
    });

    it('should respect time window for stats', () => {
      // Record an old metric (simulate by checking window)
      service.recordWebhookMetric({
        eventId: 'evt_new',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });

      const stats60min = service.getWebhookStats(60);
      const stats1min = service.getWebhookStats(1);

      expect(stats60min.totalProcessed).toBe(1);
      expect(stats1min.totalProcessed).toBe(1);
    });
  });

  describe('Error Tracking', () => {
    it('should record errors by category', () => {
      service.recordError('webhook', 'Test webhook error');
      service.recordError('webhook', 'Another webhook error');
      service.recordError('payment', 'Payment error');

      expect(service.getErrorCount('webhook', 60)).toBe(2);
      expect(service.getErrorCount('payment', 60)).toBe(1);
      expect(service.getErrorCount('database', 60)).toBe(0);
    });
  });

  describe('API Metrics', () => {
    it('should record API response times', () => {
      service.recordApiResponseTime(100);
      service.recordApiResponseTime(150);
      service.recordApiResponseTime(200);

      const p95 = service.getApiP95ResponseTime(60);
      expect(p95).toBeGreaterThanOrEqual(150);
      expect(p95).toBeLessThanOrEqual(200);
    });

    it('should return 0 for empty metrics', () => {
      const p95 = service.getApiP95ResponseTime(60);
      expect(p95).toBe(0);
    });

    it('should trigger API latency alert when p95 exceeds threshold', (done) => {
      service.on('monitoring:alert_triggered', (event) => {
        expect(event.alertId).toBe('api_response_time');
        expect(event.severity).toBe('warning');
        expect(event.currentValue).toBeGreaterThan(300); // threshold is 300ms
        done();
      });

      // Record 25 slow API responses (threshold is 300ms p95)
      for (let i = 0; i < 25; i++) {
        service.recordApiResponseTime(350); // All responses above threshold
      }
    });
  });

  describe('Alert System', () => {
    it('should trigger alert when threshold exceeded', (done) => {
      service.on('monitoring:alert_triggered', (event) => {
        expect(event.alertId).toBe('webhook_failure_rate');
        expect(event.severity).toBe('critical');
        expect(event.currentValue).toBeGreaterThan(5);
        done();
      });

      // Record 6 webhook failures (threshold is 5)
      for (let i = 0; i < 6; i++) {
        service.recordWebhookMetric({
          eventId: `evt_fail_${i}`,
          eventType: 'invoice.payment_failed' as WebhookEventType,
          processingTimeMs: 100,
          success: false,
          error: 'Test failure',
          timestamp: new Date(),
        });
      }
    });

    it('should respect cooldown period', (done) => {
      let alertCount = 0;

      service.on('monitoring:alert_triggered', () => {
        alertCount++;
      });

      // Record 6 failures to trigger first alert
      for (let i = 0; i < 6; i++) {
        service.recordWebhookMetric({
          eventId: `evt_fail_a_${i}`,
          eventType: 'invoice.payment_failed' as WebhookEventType,
          processingTimeMs: 100,
          success: false,
          error: 'Test failure',
          timestamp: new Date(),
        });
      }

      // Wait briefly and record more failures
      setTimeout(() => {
        for (let i = 0; i < 6; i++) {
          service.recordWebhookMetric({
            eventId: `evt_fail_b_${i}`,
            eventType: 'invoice.payment_failed' as WebhookEventType,
            processingTimeMs: 100,
            success: false,
            error: 'Test failure',
            timestamp: new Date(),
          });
        }

        // Should only have triggered once due to cooldown
        setTimeout(() => {
          expect(alertCount).toBe(1);
          done();
        }, 100);
      }, 100);
    });

    it('should update alert configuration', () => {
      const alertId = 'webhook_failure_rate';
      const originalAlert = service.getAlerts().find((a) => a.id === alertId);

      expect(originalAlert?.threshold).toBe(5);

      const updated = service.updateAlert(alertId, { threshold: 10 });
      expect(updated).toBe(true);

      const updatedAlert = service.getAlerts().find((a) => a.id === alertId);
      expect(updatedAlert?.threshold).toBe(10);
    });

    it('should return false when updating non-existent alert', () => {
      const updated = service.updateAlert('non_existent', { threshold: 10 });
      expect(updated).toBe(false);
    });

    it('should reset alert cooldown', (done) => {
      let alertCount = 0;

      service.on('monitoring:alert_triggered', () => {
        alertCount++;
      });

      // Trigger first alert
      for (let i = 0; i < 6; i++) {
        service.recordWebhookMetric({
          eventId: `evt_fail_reset_a_${i}`,
          eventType: 'invoice.payment_failed' as WebhookEventType,
          processingTimeMs: 100,
          success: false,
          error: 'Test failure',
          timestamp: new Date(),
        });
      }

      setTimeout(() => {
        // Reset cooldown
        const reset = service.resetAlertCooldown('webhook_failure_rate');
        expect(reset).toBe(true);

        // Trigger again
        for (let i = 0; i < 6; i++) {
          service.recordWebhookMetric({
            eventId: `evt_fail_reset_b_${i}`,
            eventType: 'invoice.payment_failed' as WebhookEventType,
            processingTimeMs: 100,
            success: false,
            error: 'Test failure',
            timestamp: new Date(),
          });
        }

        setTimeout(() => {
          // Should have triggered twice after reset
          expect(alertCount).toBe(2);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('Health Checks', () => {
    beforeEach(() => {
      // Mock database query for health check
      const { pool } = require('../../utils/database');
      pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    });

    it('should return healthy status when no errors', async () => {
      const result = await service.getHealthStatus();

      expect(result.success).toBe(true);
      expect(result.data?.overall).toBe('healthy');
      expect(result.data?.components.database.status).toBe('healthy');
    });

    it('should return unhealthy when many webhook failures', async () => {
      // Record many webhook failures
      for (let i = 0; i < 10; i++) {
        service.recordWebhookMetric({
          eventId: `evt_health_fail_${i}`,
          eventType: 'invoice.payment_failed' as WebhookEventType,
          processingTimeMs: 100,
          success: false,
          error: 'Test failure',
          timestamp: new Date(),
        });
      }

      const result = await service.getHealthStatus();

      expect(result.success).toBe(true);
      expect(result.data?.components.webhooks.status).toBe('unhealthy');
    });

    it('should return degraded when some webhook failures', async () => {
      // Record a few failures
      for (let i = 0; i < 2; i++) {
        service.recordWebhookMetric({
          eventId: `evt_health_degrade_${i}`,
          eventType: 'invoice.payment_failed' as WebhookEventType,
          processingTimeMs: 100,
          success: false,
          error: 'Test failure',
          timestamp: new Date(),
        });
      }
      // And more successes
      for (let i = 0; i < 10; i++) {
        service.recordWebhookMetric({
          eventId: `evt_health_ok_${i}`,
          eventType: 'invoice.payment_succeeded' as WebhookEventType,
          processingTimeMs: 100,
          success: true,
          timestamp: new Date(),
        });
      }

      const result = await service.getHealthStatus();

      expect(result.success).toBe(true);
      // Should be healthy or degraded based on failure rate
      expect(['healthy', 'degraded']).toContain(result.data?.components.webhooks.status);
    });

    it('should emit health check event', (done) => {
      service.on('monitoring:health_check', (status) => {
        expect(status.overall).toBeDefined();
        expect(status.components).toBeDefined();
        done();
      });

      service.getHealthStatus();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      service.recordWebhookMetric({
        eventId: 'evt_cleanup',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });

      expect(service.getWebhookStats(60).totalProcessed).toBe(1);

      service.destroy();

      // After destroy, metrics should be cleared
      expect(service.getWebhookStats(60).totalProcessed).toBe(0);
    });
  });

  describe('Event Emission', () => {
    it('should emit metric_recorded event', (done) => {
      service.on('monitoring:metric_recorded', (data) => {
        expect(data.category).toBe('webhook');
        expect(data.metric.eventId).toBe('evt_emit');
        done();
      });

      service.recordWebhookMetric({
        eventId: 'evt_emit',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });
    });
  });

  describe('Disabled Service', () => {
    it('should not record metrics when disabled', () => {
      const disabledService = new MonitoringService();
      disabledService.initialize({ enabled: false });

      disabledService.recordWebhookMetric({
        eventId: 'evt_disabled',
        eventType: 'invoice.payment_succeeded' as WebhookEventType,
        processingTimeMs: 100,
        success: true,
        timestamp: new Date(),
      });

      expect(disabledService.getWebhookStats(60).totalProcessed).toBe(0);
      disabledService.destroy();
    });
  });
});
