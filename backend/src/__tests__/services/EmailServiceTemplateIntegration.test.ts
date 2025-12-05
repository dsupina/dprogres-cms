import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock SendGrid
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
import { EmailService } from '../../services/EmailService';

describe('EmailService Template Integration (SF-014)', () => {
  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailService();
    emailService.initialize({ testMode: true });

    mockGetAdminEmails.mockResolvedValue({
      success: true,
      data: [],
    });
  });

  afterEach(() => {
    emailService.clearDeliveryLogs();
  });

  describe('sendTemplatedEmail', () => {
    it('should send email using template service', async () => {
      const result = await emailService.sendTemplatedEmail(
        'welcome_email',
        [{ email: 'user@example.com', name: 'John' }],
        { user_name: 'John', organization_name: 'Acme' }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      const logs = emailService.getDeliveryLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].subject).toContain('Welcome to DProgres CMS');
    });

    it('should generate proper HTML content', async () => {
      const sentEmails: any[] = [];
      emailService.on('email:sent', (data) => sentEmails.push(data));

      await emailService.sendTemplatedEmail(
        'payment_failed',
        [{ email: 'user@example.com' }],
        { plan_tier: 'Pro', amount: '49.99' }
      );

      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].subject).toContain('Action required');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct content', async () => {
      const result = await emailService.sendWelcomeEmail(
        [{ email: 'newuser@example.com', name: 'New User' }],
        {
          user_name: 'New User',
          organization_name: 'Startup Inc',
          login_url: 'https://app.example.com/login',
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('Welcome');
    });
  });

  describe('sendSubscriptionConfirmation', () => {
    it('should send subscription confirmation with payment details', async () => {
      const result = await emailService.sendSubscriptionConfirmation(
        [{ email: 'subscriber@example.com' }],
        {
          user_name: 'Subscriber',
          plan_tier: 'Enterprise',
          amount: '299.00',
          currency: 'USD',
          billing_period: 'month',
          next_billing_date: 'February 1, 2025',
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('Enterprise subscription is confirmed');
    });
  });

  describe('sendPaymentReceipt', () => {
    it('should send payment receipt with invoice details', async () => {
      const result = await emailService.sendPaymentReceipt(
        [{ email: 'customer@example.com' }],
        {
          user_name: 'Customer',
          plan_tier: 'Professional',
          amount: '99.00',
          invoice_number: 'INV-2025-0001',
          payment_date: 'January 5, 2025',
          payment_method: 'Visa ending in 4242',
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('Payment receipt');
      expect(logs[0].subject).toContain('99.00');
    });
  });

  describe('sendPaymentFailed', () => {
    it('should send payment failed notification with retry info', async () => {
      const result = await emailService.sendPaymentFailed(
        [{ email: 'customer@example.com' }],
        {
          user_name: 'Customer',
          plan_tier: 'Professional',
          amount: '99.00',
          failure_reason: 'Insufficient funds',
          retry_date: 'January 8, 2025',
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('Action required');
      expect(logs[0].subject).toContain('Payment failed');
    });
  });

  describe('sendQuotaWarningEmail', () => {
    it('should send quota warning with usage details', async () => {
      const result = await emailService.sendQuotaWarningEmail(
        [{ email: 'admin@example.com' }],
        {
          user_name: 'Admin',
          organization_name: 'Acme Corp',
          quota_dimension: 'API Calls',
          quota_percentage: 90,
          current_usage: 9000,
          quota_limit: 10000,
          remaining: 1000,
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('API Calls quota at 90%');
    });
  });

  describe('sendQuotaExceededEmail', () => {
    it('should send quota exceeded notification with blocked actions', async () => {
      const result = await emailService.sendQuotaExceededEmail(
        [{ email: 'admin@example.com' }],
        {
          user_name: 'Admin',
          organization_name: 'Acme Corp',
          quota_dimension: 'Storage',
          current_usage: 110,
          quota_limit: 100,
          blocked_actions: ['Uploading files', 'Creating backups'],
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('Storage quota exceeded');
    });
  });

  describe('sendMemberInvite', () => {
    it('should send member invitation with invite link', async () => {
      const result = await emailService.sendMemberInvite(
        [{ email: 'invitee@example.com' }],
        {
          user_name: 'Invitee',
          inviter_name: 'Team Lead',
          inviter_email: 'lead@acme.com',
          organization_name: 'Acme Corp',
          role: 'Editor',
          invite_url: 'https://app.example.com/invite/abc123',
          expires_at: 'January 15, 2025',
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('Team Lead invited you');
      expect(logs[0].subject).toContain('Acme Corp');
    });
  });

  describe('sendSubscriptionCanceled', () => {
    it('should send subscription canceled notification', async () => {
      const result = await emailService.sendSubscriptionCanceled(
        [{ email: 'user@example.com' }],
        {
          user_name: 'User',
          plan_tier: 'Professional',
          cancellation_date: 'January 5, 2025',
          access_until: 'February 5, 2025',
        }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].subject).toContain('subscription has been canceled');
    });
  });

  describe('Multiple Recipients', () => {
    it('should send templated email to multiple recipients', async () => {
      const result = await emailService.sendWelcomeEmail(
        [
          { email: 'user1@example.com', name: 'User 1' },
          { email: 'user2@example.com', name: 'User 2' },
          { email: 'user3@example.com', name: 'User 3' },
        ],
        { user_name: 'Team' }
      );

      expect(result.success).toBe(true);

      const logs = emailService.getDeliveryLogs();
      expect(logs[0].to).toHaveLength(3);
      expect(logs[0].to).toContain('user1@example.com');
      expect(logs[0].to).toContain('user2@example.com');
      expect(logs[0].to).toContain('user3@example.com');
    });
  });

  describe('Email Events', () => {
    it('should emit email:sent event for templated emails', async () => {
      const sentEvents: any[] = [];
      emailService.on('email:sent', (data) => sentEvents.push(data));

      await emailService.sendMemberInvite(
        [{ email: 'invitee@example.com' }],
        {
          inviter_name: 'John',
          organization_name: 'Acme',
          invite_url: 'https://example.com/invite',
        }
      );

      expect(sentEvents.length).toBe(1);
      expect(sentEvents[0].to).toContain('invitee@example.com');
      expect(sentEvents[0].testMode).toBe(true);
    });
  });

  describe('SendGrid Integration', () => {
    it('should send templated email via SendGrid when not in test mode', async () => {
      const sgService = new EmailService();
      sgService.initialize({ apiKey: 'SG.test-key', testMode: false });

      const mockResponse = {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-template-123' },
        body: '',
      };
      mockSend.mockResolvedValueOnce([mockResponse, {}]);

      const result = await sgService.sendWelcomeEmail(
        [{ email: 'user@example.com' }],
        { user_name: 'Test User' }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sg-template-123');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'user@example.com', name: undefined }],
          subject: expect.stringContaining('Welcome'),
          html: expect.stringContaining('Test User'),
          text: expect.stringContaining('Test User'),
        })
      );
    });
  });
});
