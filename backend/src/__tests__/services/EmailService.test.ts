import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock SendGrid with proper typing
const mockSend = jest.fn<() => Promise<any>>();
const mockSetApiKey = jest.fn<(key: string) => void>();

jest.mock('@sendgrid/mail', () => ({
  setApiKey: mockSetApiKey,
  send: mockSend,
  default: {
    setApiKey: mockSetApiKey,
    send: mockSend,
  },
}));

// Mock OrganizationService
const mockGetAdminEmails = jest.fn<() => Promise<any>>();
jest.mock('../../services/OrganizationService', () => ({
  organizationService: {
    getAdminEmails: mockGetAdminEmails,
  },
}));

// Import after mocks
import {
  EmailService,
  EmailRecipient,
  SendEmailOptions,
  QuotaWarningEmailData,
  EmailDeliveryLog,
} from '../../services/EmailService';

describe('EmailService (SF-013)', () => {
  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailService();
    // Reset environment variables
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.SENDGRID_FROM_NAME;
    process.env.NODE_ENV = 'test';

    // Default mock for getAdminEmails - returns empty (no admins)
    mockGetAdminEmails.mockResolvedValue({
      success: true,
      data: [],
    });
  });

  afterEach(() => {
    emailService.clearDeliveryLogs();
  });

  describe('Initialization', () => {
    it('should initialize in stub mode when no API key is provided', () => {
      emailService.initialize();
      expect(emailService.isTestMode()).toBe(true);
    });

    it('should initialize with SendGrid API when API key is provided', () => {
      emailService.initialize({ apiKey: 'SG.test-key', testMode: false });
      expect(mockSetApiKey).toHaveBeenCalledWith('SG.test-key');
    });

    it('should be idempotent (multiple calls should not reinitialize)', () => {
      emailService.initialize({ apiKey: 'SG.test-key-1' });
      emailService.initialize({ apiKey: 'SG.test-key-2' });
      expect(mockSetApiKey).toHaveBeenCalledTimes(1);
      expect(mockSetApiKey).toHaveBeenCalledWith('SG.test-key-1');
    });

    it('should use environment variables when config not provided', () => {
      process.env.SENDGRID_API_KEY = 'SG.env-key';
      process.env.SENDGRID_FROM_EMAIL = 'env@example.com';
      process.env.SENDGRID_FROM_NAME = 'Env Sender';

      emailService.initialize();
      expect(mockSetApiKey).toHaveBeenCalledWith('SG.env-key');
    });

    it('should use default from email when not configured', () => {
      emailService.initialize();
      // Default is noreply@dprogres.com
      expect(emailService.isTestMode()).toBe(true);
    });

    it('should respect testMode configuration override', () => {
      emailService.initialize({ apiKey: 'SG.test-key', testMode: true });
      expect(emailService.isTestMode()).toBe(true);
    });

    it('should throw error in production when API key is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SENDGRID_API_KEY;

      expect(() => emailService.initialize()).toThrow(
        'SENDGRID_API_KEY environment variable is required in production'
      );
    });

    it('should allow stub mode in production if explicitly configured', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SENDGRID_API_KEY;

      // Explicitly setting testMode: true should allow stub mode even in production
      expect(() => emailService.initialize({ testMode: true })).not.toThrow();
      expect(emailService.isTestMode()).toBe(true);
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      emailService.initialize({ testMode: true });
    });

    it('should reject email without recipients', async () => {
      const result = await emailService.sendEmail({
        to: [],
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Recipient email address is required');
    });

    it('should reject email without subject', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: '',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email subject is required');
    });

    it('should reject email with whitespace-only subject', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: '   ',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email subject is required');
    });

    it('should reject email without content, template, or templateId', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email must have either html content, text content, or a templateId');
    });

    it('should accept email with html content', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });

      expect(result.success).toBe(true);
    });

    it('should accept email with text content', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        text: 'Hello',
      });

      expect(result.success).toBe(true);
    });

    it('should accept email with templateId', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        templateId: 'd-12345',
      });

      expect(result.success).toBe(true);
    });

    it('should reject email with only template (no actual content)', async () => {
      // The template field is for internal tracking only, not a SendGrid template ID
      // Emails must have html, text, or templateId to be sendable
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        template: 'quota_warning_80',
        templateData: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email must have either html content, text content, or a templateId');
    });

    it('should accept email with template AND html content', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        template: 'quota_warning_80',
        html: '<p>Quota warning content</p>',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Test Mode Email Sending', () => {
    beforeEach(() => {
      emailService.initialize({ testMode: true });
    });

    it('should return success with messageId in test mode', async () => {
      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com', name: 'Test User' }],
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toMatch(/^test-/);
    });

    it('should emit email:sent event in test mode', async () => {
      const sentEvents: any[] = [];
      emailService.on('email:sent', (data) => sentEvents.push(data));

      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });

      expect(sentEvents.length).toBe(1);
      expect(sentEvents[0].testMode).toBe(true);
      expect(sentEvents[0].to).toContain('test@example.com');
    });

    it('should log delivery in test mode', async () => {
      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });

      const logs = emailService.getDeliveryLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe('sent');
      expect(logs[0].to).toContain('test@example.com');
    });
  });

  describe('SendGrid API Integration', () => {
    beforeEach(() => {
      emailService.initialize({ apiKey: 'SG.test-key', testMode: false });
    });

    it('should send email via SendGrid with html content', async () => {
      const mockResponse = {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-msg-123' },
        body: '',
      };
      mockSend.mockResolvedValueOnce([mockResponse, {}]);

      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com', name: 'Test User' }],
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sg-msg-123');
      expect(result.statusCode).toBe(202);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'test@example.com', name: 'Test User' }],
          subject: 'Test Subject',
          html: '<p>Hello World</p>',
        })
      );
    });

    it('should send email via SendGrid with text content', async () => {
      const mockResponse = {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-msg-456' },
        body: '',
      };
      mockSend.mockResolvedValueOnce([mockResponse, {}]);

      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Text Email',
        text: 'Plain text content',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text content',
        })
      );
    });

    it('should send email via SendGrid with dynamic template', async () => {
      const mockResponse = {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-msg-789' },
        body: '',
      };
      mockSend.mockResolvedValueOnce([mockResponse, {}]);

      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Template Email',
        templateId: 'd-abc123',
        dynamicData: { firstName: 'John', productName: 'CMS' },
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'd-abc123',
          dynamicTemplateData: { firstName: 'John', productName: 'CMS' },
        })
      );
    });

    it('should include cc and bcc recipients', async () => {
      const mockResponse = {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-msg-abc' },
        body: '',
      };
      mockSend.mockResolvedValueOnce([mockResponse, {}]);

      await emailService.sendEmail({
        to: [{ email: 'to@example.com' }],
        subject: 'CC/BCC Test',
        html: '<p>Test</p>',
        cc: [{ email: 'cc@example.com', name: 'CC User' }],
        bcc: [{ email: 'bcc@example.com' }],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: [{ email: 'cc@example.com', name: 'CC User' }],
          bcc: [{ email: 'bcc@example.com', name: undefined }],
        })
      );
    });

    it('should include replyTo when provided', async () => {
      const mockResponse = {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-msg-def' },
        body: '',
      };
      mockSend.mockResolvedValueOnce([mockResponse, {}]);

      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Reply-To Test',
        html: '<p>Test</p>',
        replyTo: 'support@example.com',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support@example.com',
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      emailService.initialize({ apiKey: 'SG.test-key', testMode: false });
    });

    it('should handle SendGrid API errors gracefully', async () => {
      const mockError = {
        response: {
          body: {
            errors: [{ message: 'Invalid API Key' }, { message: 'Rate limit exceeded' }],
          },
        },
        code: 401,
      };
      mockSend.mockRejectedValueOnce(mockError);

      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Error Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API Key; Rate limit exceeded');
      expect(result.statusCode).toBe(401);
    });

    it('should handle generic errors', async () => {
      const mockError = new Error('Network error');
      mockSend.mockRejectedValueOnce(mockError);

      const result = await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Error Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should emit email:failed event on error', async () => {
      const failedEvents: any[] = [];
      emailService.on('email:failed', (data) => failedEvents.push(data));

      mockSend.mockRejectedValueOnce(new Error('Send failed'));

      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Error Test',
        html: '<p>Test</p>',
      });

      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].error).toBe('Send failed');
    });

    it('should log failed delivery', async () => {
      mockSend.mockRejectedValueOnce(new Error('Send failed'));

      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Error Test',
        html: '<p>Test</p>',
      });

      const logs = emailService.getDeliveryLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe('failed');
      expect(logs[0].error).toBe('Send failed');
    });
  });

  describe('Delivery Logging', () => {
    beforeEach(() => {
      emailService.initialize({ testMode: true });
    });

    it('should store delivery logs', async () => {
      await emailService.sendEmail({
        to: [{ email: 'test1@example.com' }],
        subject: 'Test 1',
        html: '<p>Test</p>',
      });

      await emailService.sendEmail({
        to: [{ email: 'test2@example.com' }],
        subject: 'Test 2',
        html: '<p>Test</p>',
      });

      const logs = emailService.getDeliveryLogs();
      expect(logs.length).toBe(2);
    });

    it('should limit logs returned by getDeliveryLogs', async () => {
      for (let i = 0; i < 10; i++) {
        await emailService.sendEmail({
          to: [{ email: `test${i}@example.com` }],
          subject: `Test ${i}`,
          html: '<p>Test</p>',
        });
      }

      const limitedLogs = emailService.getDeliveryLogs(5);
      expect(limitedLogs.length).toBe(5);
    });

    it('should clear delivery logs', async () => {
      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test',
        html: '<p>Test</p>',
      });

      emailService.clearDeliveryLogs();
      expect(emailService.getDeliveryLogs().length).toBe(0);
    });

    it('should include all relevant fields in delivery log', async () => {
      await emailService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Test Subject',
        html: '<p>Test</p>',
        template: 'generic',
        templateId: 'd-123',
      });

      const logs = emailService.getDeliveryLogs();
      expect(logs[0]).toMatchObject({
        to: ['test@example.com'],
        subject: 'Test Subject',
        template: 'generic',
        templateId: 'd-123',
        status: 'sent',
      });
      expect(logs[0].messageId).toBeDefined();
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Quota Warning Integration', () => {
    let quotaServiceEmitter: EventEmitter;

    beforeEach(() => {
      emailService.initialize({ testMode: true });
      quotaServiceEmitter = new EventEmitter();
    });

    it('should subscribe to quota warnings and emit event', async () => {
      emailService.subscribeToQuotaWarnings(quotaServiceEmitter);

      const quotaWarningEvents: any[] = [];
      emailService.on('email:quota_warning_sent', (data) => quotaWarningEvents.push(data));

      quotaServiceEmitter.emit('quota:warning', {
        organizationId: 1,
        dimension: 'posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      });

      // Wait for async handleQuotaWarning to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(quotaWarningEvents.length).toBe(1);
      expect(quotaWarningEvents[0].dimension).toBe('posts');
      expect(quotaWarningEvents[0].dimensionLabel).toBe('Posts');
    });

    it('should send email to admins when quota warning is triggered', async () => {
      // Mock admin emails
      mockGetAdminEmails.mockResolvedValue({
        success: true,
        data: [
          { email: 'admin1@example.com', name: 'Admin One' },
          { email: 'admin2@example.com', name: 'Admin Two' },
        ],
      });

      emailService.subscribeToQuotaWarnings(quotaServiceEmitter);

      const emailSentEvents: any[] = [];
      emailService.on('email:sent', (data) => emailSentEvents.push(data));

      quotaServiceEmitter.emit('quota:warning', {
        organizationId: 1,
        dimension: 'posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      });

      // Wait for async handleQuotaWarning to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGetAdminEmails).toHaveBeenCalledWith(1);
      expect(emailSentEvents.length).toBe(1);
      expect(emailSentEvents[0].to).toContain('admin1@example.com');
      expect(emailSentEvents[0].to).toContain('admin2@example.com');
    });

    it('should skip email when no admins found', async () => {
      mockGetAdminEmails.mockResolvedValue({
        success: true,
        data: [],
      });

      emailService.subscribeToQuotaWarnings(quotaServiceEmitter);

      const emailSentEvents: any[] = [];
      emailService.on('email:sent', (data) => emailSentEvents.push(data));

      quotaServiceEmitter.emit('quota:warning', {
        organizationId: 1,
        dimension: 'posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      });

      // Wait for async handleQuotaWarning to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGetAdminEmails).toHaveBeenCalledWith(1);
      expect(emailSentEvents.length).toBe(0); // No email sent
    });

    it('should generate correct email subject', () => {
      const data: QuotaWarningEmailData = {
        organizationId: 1,
        dimension: 'api_calls',
        dimensionLabel: 'API Calls',
        percentage: 95,
        current: 9500,
        limit: 10000,
        remaining: 500,
        timestamp: new Date(),
      };

      const subject = emailService.getQuotaWarningSubject(data);
      expect(subject).toBe('[DProgres CMS] API Calls quota at 95%');
    });

    it('should select correct template based on percentage', () => {
      expect(emailService.getQuotaWarningTemplate(79)).toBe('quota_warning_80');
      expect(emailService.getQuotaWarningTemplate(80)).toBe('quota_warning_80');
      expect(emailService.getQuotaWarningTemplate(89)).toBe('quota_warning_80');
      expect(emailService.getQuotaWarningTemplate(90)).toBe('quota_warning_90');
      expect(emailService.getQuotaWarningTemplate(94)).toBe('quota_warning_90');
      expect(emailService.getQuotaWarningTemplate(95)).toBe('quota_warning_95');
      expect(emailService.getQuotaWarningTemplate(100)).toBe('quota_warning_95');
    });

    it('should get dimension label correctly', () => {
      expect(emailService.getDimensionLabel('sites')).toBe('Sites');
      expect(emailService.getDimensionLabel('posts')).toBe('Posts');
      expect(emailService.getDimensionLabel('users')).toBe('Users');
      expect(emailService.getDimensionLabel('storage_bytes')).toBe('Storage');
      expect(emailService.getDimensionLabel('api_calls')).toBe('API Calls');
    });
  });

  describe('Email Template Generation', () => {
    beforeEach(() => {
      emailService.initialize({ testMode: true });
    });

    it('should generate quota warning HTML with correct urgency for 80%', () => {
      const data: QuotaWarningEmailData = {
        organizationId: 1,
        dimension: 'posts',
        dimensionLabel: 'Posts',
        percentage: 80,
        current: 80,
        limit: 100,
        remaining: 20,
        timestamp: new Date(),
      };

      const html = emailService.generateQuotaWarningHtml(data);

      expect(html).toContain('Notice');
      expect(html).toContain('Posts');
      expect(html).toContain('80%');
      expect(html).toContain('80'); // current
      expect(html).toContain('100'); // limit
      expect(html).toContain('20'); // remaining
      expect(html).not.toContain('Action Required');
    });

    it('should generate quota warning HTML with warning urgency for 90%', () => {
      const data: QuotaWarningEmailData = {
        organizationId: 1,
        dimension: 'sites',
        dimensionLabel: 'Sites',
        percentage: 90,
        current: 9,
        limit: 10,
        remaining: 1,
        timestamp: new Date(),
      };

      const html = emailService.generateQuotaWarningHtml(data);

      expect(html).toContain('Warning');
      expect(html).toContain('Action Required');
      expect(html).toContain('Upgrade Plan');
    });

    it('should generate quota warning HTML with critical urgency for 95%+', () => {
      const data: QuotaWarningEmailData = {
        organizationId: 1,
        dimension: 'storage_bytes',
        dimensionLabel: 'Storage',
        percentage: 97,
        current: 970,
        limit: 1000,
        remaining: 30,
        timestamp: new Date(),
      };

      const html = emailService.generateQuotaWarningHtml(data);

      expect(html).toContain('Critical');
      expect(html).toContain('Storage');
      expect(html).toContain('97%');
    });

    it('should generate quota warning text', () => {
      const data: QuotaWarningEmailData = {
        organizationId: 1,
        dimension: 'api_calls',
        dimensionLabel: 'API Calls',
        percentage: 92,
        current: 9200,
        limit: 10000,
        remaining: 800,
        timestamp: new Date(),
      };

      const text = emailService.generateQuotaWarningText(data);

      expect(text).toContain('WARNING');
      expect(text).toContain('API Calls');
      expect(text).toContain('92%');
      // Numbers are locale-formatted, check for either format
      expect(text).toMatch(/9[,.]?200/); // matches 9,200 or 9.200 or 9200
      expect(text).toMatch(/10[,.]?000/); // matches 10,000 or 10.000 or 10000
      expect(text).toContain('800');
      expect(text).toContain('Action Required');
    });

    it('should generate notice text for 80% threshold', () => {
      const data: QuotaWarningEmailData = {
        organizationId: 1,
        dimension: 'users',
        dimensionLabel: 'Users',
        percentage: 80,
        current: 8,
        limit: 10,
        remaining: 2,
        timestamp: new Date(),
      };

      const text = emailService.generateQuotaWarningText(data);

      expect(text).toContain('NOTICE');
      expect(text).toContain('friendly reminder');
      expect(text).not.toContain('Action Required');
    });
  });

  describe('Multiple Recipients', () => {
    beforeEach(() => {
      emailService.initialize({ testMode: true });
    });

    it('should handle multiple to recipients', async () => {
      const result = await emailService.sendEmail({
        to: [
          { email: 'user1@example.com', name: 'User 1' },
          { email: 'user2@example.com', name: 'User 2' },
          { email: 'user3@example.com' },
        ],
        subject: 'Multi-recipient Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].to).toHaveLength(3);
      expect(logs[0].to).toContain('user1@example.com');
      expect(logs[0].to).toContain('user2@example.com');
      expect(logs[0].to).toContain('user3@example.com');
    });
  });

  describe('Auto-initialization', () => {
    it('should auto-initialize when sendEmail is called without explicit init', async () => {
      const newService = new EmailService();

      const result = await newService.sendEmail({
        to: [{ email: 'test@example.com' }],
        subject: 'Auto-init Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(newService.isTestMode()).toBe(true);
    });
  });
});
