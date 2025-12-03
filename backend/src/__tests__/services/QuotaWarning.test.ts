import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock function instances
const mockPoolQuery: any = jest.fn();

// Mock database pool
jest.mock('../../utils/database', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

// Mock OrganizationService for EmailService
const mockGetAdminEmails = jest.fn<() => Promise<any>>();
jest.mock('../../services/OrganizationService', () => ({
  organizationService: {
    getAdminEmails: mockGetAdminEmails,
  },
}));

// Import after mocks are defined
import { QuotaService, QuotaWarningEvent } from '../../services/QuotaService';
import { EmailService } from '../../services/EmailService';

describe('QuotaService Warning System (SF-012)', () => {
  let quotaService: QuotaService;

  beforeEach(() => {
    jest.clearAllMocks();
    quotaService = new QuotaService();

    // Default mock for getAdminEmails - returns empty (no admins)
    mockGetAdminEmails.mockResolvedValue({
      success: true,
      data: [],
    });
  });

  describe('Spam Prevention', () => {
    it('should emit warning only once per threshold', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      // Mock quota at 85% (above 80% threshold)
      mockPoolQuery.mockResolvedValue({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      // First call should emit warning
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].percentage).toBe(80);

      // Second call should NOT emit warning (already sent)
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);

      // Third call should also NOT emit warning
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);
    });

    it('should emit warning for next threshold when crossed', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      // First: at 85% - should emit 80% warning
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].percentage).toBe(80);

      // Second: at 92% - should emit 90% warning (not 80% again)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 92,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(2);
      expect(warningEvents[1].percentage).toBe(90);

      // Third: at 96% - should emit 95% warning
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 96,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(3);
      expect(warningEvents[2].percentage).toBe(95);
    });

    it('should track warnings per organization independently', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      // Org 1 at 85%
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);

      // Org 2 at 85% - should also emit (different org)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(2, 'posts');
      expect(warningEvents.length).toBe(2);

      // Org 1 again - should NOT emit (already sent)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(2);
    });

    it('should track warnings per dimension independently', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      // Posts at 85%
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].dimension).toBe('posts');

      // Sites at 85% - should also emit (different dimension)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'sites',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'sites');
      expect(warningEvents.length).toBe(2);
      expect(warningEvents[1].dimension).toBe('sites');
    });

    it('should emit highest applicable threshold only', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      // Jump straight to 97% - should emit 95% warning only
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 97,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });
      await quotaService.checkAndWarn(1, 'posts');
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].percentage).toBe(95);
    });
  });

  describe('Warning Cache Management', () => {
    it('wasWarningSent should return false for unsent warnings', () => {
      expect(quotaService.wasWarningSent(1, 'posts', 80)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'posts', 90)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'posts', 95)).toBe(false);
    });

    it('wasWarningSent should return true after markWarningSent', () => {
      quotaService.markWarningSent(1, 'posts', 80);
      expect(quotaService.wasWarningSent(1, 'posts', 80)).toBe(true);
      expect(quotaService.wasWarningSent(1, 'posts', 90)).toBe(false);
    });

    it('clearWarnings should clear all warnings for org/dimension', () => {
      quotaService.markWarningSent(1, 'posts', 80);
      quotaService.markWarningSent(1, 'posts', 90);
      quotaService.markWarningSent(1, 'sites', 80);

      quotaService.clearWarnings(1, 'posts');

      expect(quotaService.wasWarningSent(1, 'posts', 80)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'posts', 90)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'sites', 80)).toBe(true);
    });

    it('clearWarnings without dimension should clear all for org', () => {
      quotaService.markWarningSent(1, 'posts', 80);
      quotaService.markWarningSent(1, 'sites', 90);
      quotaService.markWarningSent(2, 'posts', 80);

      quotaService.clearWarnings(1);

      expect(quotaService.wasWarningSent(1, 'posts', 80)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'sites', 90)).toBe(false);
      expect(quotaService.wasWarningSent(2, 'posts', 80)).toBe(true);
    });

    it('clearAllWarnings should clear warnings for all organizations', () => {
      quotaService.markWarningSent(1, 'posts', 80);
      quotaService.markWarningSent(1, 'sites', 90);
      quotaService.markWarningSent(2, 'posts', 80);
      quotaService.markWarningSent(3, 'api_calls', 95);

      quotaService.clearAllWarnings();

      expect(quotaService.wasWarningSent(1, 'posts', 80)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'sites', 90)).toBe(false);
      expect(quotaService.wasWarningSent(2, 'posts', 80)).toBe(false);
      expect(quotaService.wasWarningSent(3, 'api_calls', 95)).toBe(false);
    });
  });

  describe('Warning Event Data', () => {
    it('should include remaining quota in warning event', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'api_calls',
            current_usage: 85000,
            quota_limit: 100000,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      await quotaService.checkAndWarn(1, 'api_calls');

      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].remaining).toBe(15000);
      expect(warningEvents[0].current).toBe(85000);
      expect(warningEvents[0].limit).toBe(100000);
    });

    it('should include organizationId in warning event', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      await quotaService.checkAndWarn(42, 'posts');

      expect(warningEvents[0].organizationId).toBe(42);
    });

    it('should include timestamp in warning event', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      const beforeTime = new Date();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 85,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      await quotaService.checkAndWarn(1, 'posts');

      const afterTime = new Date();

      expect(warningEvents[0].timestamp).toBeInstanceOf(Date);
      expect(warningEvents[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(warningEvents[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('Warning Reset on Quota Reset', () => {
    it('should clear warnings when monthly quota is reset', async () => {
      // Mark warning as sent
      quotaService.markWarningSent(1, 'api_calls', 80);
      expect(quotaService.wasWarningSent(1, 'api_calls', 80)).toBe(true);

      // Mock successful quota reset
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ dimension: 'api_calls' }],
      });

      await quotaService.resetMonthlyQuotas(1);

      // Warning should be cleared
      expect(quotaService.wasWarningSent(1, 'api_calls', 80)).toBe(false);
    });

    it('should clear ALL warnings when global monthly quota reset is performed', async () => {
      // Mark warnings for multiple orgs and dimensions
      quotaService.markWarningSent(1, 'api_calls', 80);
      quotaService.markWarningSent(1, 'api_calls', 90);
      quotaService.markWarningSent(2, 'api_calls', 95);
      quotaService.markWarningSent(3, 'posts', 80);

      expect(quotaService.wasWarningSent(1, 'api_calls', 80)).toBe(true);
      expect(quotaService.wasWarningSent(2, 'api_calls', 95)).toBe(true);
      expect(quotaService.wasWarningSent(3, 'posts', 80)).toBe(true);

      // Mock successful global quota reset
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ rows_updated: 50 }],
      });

      await quotaService.resetAllMonthlyQuotas();

      // ALL warnings should be cleared so they re-arm for the new period
      expect(quotaService.wasWarningSent(1, 'api_calls', 80)).toBe(false);
      expect(quotaService.wasWarningSent(1, 'api_calls', 90)).toBe(false);
      expect(quotaService.wasWarningSent(2, 'api_calls', 95)).toBe(false);
      expect(quotaService.wasWarningSent(3, 'posts', 80)).toBe(false);
    });

    it('should emit warning immediately when quota limit is lowered below current usage', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      // Mock the UPDATE query for setQuotaOverride
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 90, // 90 used
            quota_limit: 100, // New limit is 100, so 90% used
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      // Lower limit from 200 to 100, putting usage at 90%
      await quotaService.setQuotaOverride({
        organizationId: 1,
        dimension: 'posts',
        newLimit: 100,
      });

      // Should emit 90% warning immediately
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].percentage).toBe(90);
      expect(warningEvents[0].current).toBe(90);
      expect(warningEvents[0].limit).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should not emit warning below 80% threshold', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 70,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      await quotaService.checkAndWarn(1, 'posts');

      expect(warningEvents.length).toBe(0);
    });

    it('should handle exactly 80% threshold', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 80,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      await quotaService.checkAndWarn(1, 'posts');

      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].percentage).toBe(80);
    });

    it('should handle exactly 100% (no warning, just limit_reached)', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            dimension: 'posts',
            current_usage: 100,
            quota_limit: 100,
            period_start: new Date(),
            period_end: null,
            last_reset_at: null,
          },
        ],
      });

      await quotaService.checkAndWarn(1, 'posts');

      // At 100%, should emit 95% warning if not already sent
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0].percentage).toBe(95);
    });

    it('should gracefully handle missing quota record', async () => {
      const warningEvents: QuotaWarningEvent[] = [];
      quotaService.on('quota:warning', (event: QuotaWarningEvent) => {
        warningEvents.push(event);
      });

      mockPoolQuery.mockResolvedValueOnce({
        rows: [],
      });

      // Should not throw
      await quotaService.checkAndWarn(999, 'posts');

      expect(warningEvents.length).toBe(0);
    });
  });
});

describe('EmailService (SF-012)', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = new EmailService();
  });

  describe('Initialization', () => {
    it('should initialize correctly', () => {
      expect(() => emailService.initialize()).not.toThrow();
    });

    it('should be idempotent', () => {
      emailService.initialize();
      emailService.initialize();
      // Should not throw or have side effects
    });
  });

  describe('Quota Warning Subscription', () => {
    it('should subscribe to quota:warning events', async () => {
      const quotaService = new QuotaService();
      const emailEvents: any[] = [];

      emailService.on('email:quota_warning_sent', (data) => {
        emailEvents.push(data);
      });

      emailService.subscribeToQuotaWarnings(quotaService);

      // Emit a warning event
      const warningEvent: QuotaWarningEvent = {
        organizationId: 1,
        dimension: 'posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      };

      quotaService.emit('quota:warning', warningEvent);

      // Wait for async handleQuotaWarning to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(emailEvents.length).toBe(1);
      expect(emailEvents[0].organizationId).toBe(1);
      expect(emailEvents[0].dimension).toBe('posts');
      expect(emailEvents[0].dimensionLabel).toBe('Posts');
    });
  });

  describe('Email Subject Generation', () => {
    it('should generate correct subject for 80% warning', () => {
      const subject = emailService.getQuotaWarningSubject({
        organizationId: 1,
        dimension: 'posts',
        dimensionLabel: 'Posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      });

      expect(subject).toBe('[DProgres CMS] Posts quota at 80%');
    });

    it('should generate correct subject for storage', () => {
      const subject = emailService.getQuotaWarningSubject({
        organizationId: 1,
        dimension: 'storage_bytes',
        dimensionLabel: 'Storage',
        percentage: 95,
        current: 95,
        limit: 100,
        remaining: 5,
        timestamp: new Date(),
      });

      expect(subject).toBe('[DProgres CMS] Storage quota at 95%');
    });
  });

  describe('Template Selection', () => {
    it('should select correct template for 80%', () => {
      expect(emailService.getQuotaWarningTemplate(80)).toBe('quota_warning_80');
      expect(emailService.getQuotaWarningTemplate(85)).toBe('quota_warning_80');
      expect(emailService.getQuotaWarningTemplate(89)).toBe('quota_warning_80');
    });

    it('should select correct template for 90%', () => {
      expect(emailService.getQuotaWarningTemplate(90)).toBe('quota_warning_90');
      expect(emailService.getQuotaWarningTemplate(93)).toBe('quota_warning_90');
      expect(emailService.getQuotaWarningTemplate(94)).toBe('quota_warning_90');
    });

    it('should select correct template for 95%', () => {
      expect(emailService.getQuotaWarningTemplate(95)).toBe('quota_warning_95');
      expect(emailService.getQuotaWarningTemplate(99)).toBe('quota_warning_95');
      expect(emailService.getQuotaWarningTemplate(100)).toBe('quota_warning_95');
    });
  });

  describe('Email Sending (Stub)', () => {
    it('should return success for stub email send with html content', async () => {
      // Quota warning emails should include generated HTML content
      const warningData = {
        organizationId: 1,
        dimension: 'posts' as const,
        dimensionLabel: 'Posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      };

      const result = await emailService.sendEmail({
        to: [{ email: 'admin@example.com', name: 'Admin' }],
        subject: emailService.getQuotaWarningSubject(warningData),
        template: 'quota_warning_80',
        html: emailService.generateQuotaWarningHtml(warningData),
        text: emailService.generateQuotaWarningText(warningData),
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });
});
