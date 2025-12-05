import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  EmailTemplateService,
  emailTemplateService,
  SaaSEmailTemplate,
  WelcomeEmailVariables,
  SubscriptionConfirmationVariables,
  PaymentReceiptVariables,
  PaymentFailedVariables,
  QuotaWarningVariables,
  QuotaExceededVariables,
  MemberInviteVariables,
  SubscriptionCanceledVariables,
} from '../../services/EmailTemplateService';

describe('EmailTemplateService (SF-014)', () => {
  let templateService: EmailTemplateService;

  beforeEach(() => {
    // Create fresh instance for each test
    templateService = new EmailTemplateService();
  });

  describe('Service Initialization', () => {
    it('should create singleton instance', () => {
      expect(emailTemplateService).toBeInstanceOf(EmailTemplateService);
    });

    it('should initialize with default branding', () => {
      const branding = templateService.getBranding();
      expect(branding.companyName).toBe('DProgres CMS');
      expect(branding.primaryColor).toBe('#2563eb');
      expect(branding.supportEmail).toBe('support@dprogres.com');
    });

    it('should accept custom configuration', () => {
      const customService = new EmailTemplateService({
        companyName: 'Custom CMS',
        primaryColor: '#ff0000',
        supportEmail: 'help@custom.com',
        dashboardUrl: 'https://custom.com/dashboard',
        upgradeUrl: 'https://custom.com/upgrade',
      });

      const branding = customService.getBranding();
      expect(branding.companyName).toBe('Custom CMS');
      expect(branding.primaryColor).toBe('#ff0000');
      expect(branding.supportEmail).toBe('help@custom.com');
      expect(branding.dashboardUrl).toBe('https://custom.com/dashboard');
      expect(branding.upgradeUrl).toBe('https://custom.com/upgrade');
    });

    it('should update branding configuration', () => {
      templateService.updateBranding({ companyName: 'Updated CMS' });
      expect(templateService.getBranding().companyName).toBe('Updated CMS');
    });
  });

  describe('Variable Interpolation', () => {
    it('should interpolate simple variables', () => {
      const template = 'Hello {{name}}, welcome to {{company}}!';
      const result = templateService.interpolate(template, {
        name: 'John',
        company: 'Acme Corp',
      });
      expect(result).toBe('Hello John, welcome to Acme Corp!');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello {{name}}, your balance is {{balance}}';
      const result = templateService.interpolate(template, { name: 'John' });
      expect(result).toBe('Hello John, your balance is ');
    });

    it('should handle null and undefined values', () => {
      const template = '{{a}} - {{b}} - {{c}}';
      const result = templateService.interpolate(template, {
        a: 'value',
        b: null,
        c: undefined,
      });
      expect(result).toBe('value -  - ');
    });

    it('should convert non-string values to strings', () => {
      const template = 'Count: {{count}}, Active: {{active}}';
      const result = templateService.interpolate(template, {
        count: 42,
        active: true,
      });
      expect(result).toBe('Count: 42, Active: true');
    });
  });

  describe('Welcome Email Template', () => {
    const baseVariables: WelcomeEmailVariables = {
      user_name: 'John Doe',
      organization_name: 'Acme Corp',
    };

    it('should generate welcome email with all fields', () => {
      const result = templateService.generateTemplate('welcome_email', baseVariables);

      expect(result.subject).toContain('Welcome to DProgres CMS');
      expect(result.html).toContain('John Doe');
      expect(result.html).toContain('Acme Corp');
      expect(result.html).toContain('Go to Dashboard');
      expect(result.text).toContain('John Doe');
      expect(result.text).toContain('Acme Corp');
    });

    it('should handle missing user name gracefully', () => {
      const result = templateService.generateTemplate('welcome_email', {});

      expect(result.html).toContain('Hi there');
      expect(result.text).toContain('Hi there');
    });

    it('should include custom login URL when provided', () => {
      const result = templateService.generateTemplate('welcome_email', {
        ...baseVariables,
        login_url: 'https://custom.com/login',
      });

      expect(result.html).toContain('https://custom.com/login');
      expect(result.text).toContain('https://custom.com/login');
    });

    it('should include getting started URL when provided', () => {
      const result = templateService.generateTemplate('welcome_email', {
        ...baseVariables,
        getting_started_url: 'https://docs.example.com/start',
      });

      expect(result.html).toContain('https://docs.example.com/start');
    });
  });

  describe('Subscription Confirmation Template', () => {
    const baseVariables: SubscriptionConfirmationVariables = {
      user_name: 'John Doe',
      plan_tier: 'Professional',
      amount: '49.99',
    };

    it('should generate subscription confirmation with required fields', () => {
      const result = templateService.generateTemplate('subscription_confirmation', baseVariables);

      expect(result.subject).toContain('Professional subscription is confirmed');
      expect(result.html).toContain('John Doe');
      expect(result.html).toContain('Professional');
      expect(result.html).toContain('49.99');
      expect(result.html).toContain('Subscription Confirmed');
    });

    it('should include billing period', () => {
      const result = templateService.generateTemplate('subscription_confirmation', {
        ...baseVariables,
        billing_period: 'year',
      });

      expect(result.html).toContain('/year');
      expect(result.text).toContain('/year');
    });

    it('should include next billing date when provided', () => {
      const result = templateService.generateTemplate('subscription_confirmation', {
        ...baseVariables,
        next_billing_date: 'January 15, 2025',
      });

      expect(result.html).toContain('January 15, 2025');
      expect(result.text).toContain('January 15, 2025');
    });

    it('should include invoice URL when provided', () => {
      const result = templateService.generateTemplate('subscription_confirmation', {
        ...baseVariables,
        invoice_url: 'https://billing.example.com/invoice/123',
      });

      expect(result.html).toContain('View Invoice');
      expect(result.html).toContain('https://billing.example.com/invoice/123');
    });

    it('should use USD as default currency', () => {
      const result = templateService.generateTemplate('subscription_confirmation', baseVariables);

      expect(result.html).toContain('USD');
      expect(result.text).toContain('USD');
    });

    it('should use custom currency when provided', () => {
      const result = templateService.generateTemplate('subscription_confirmation', {
        ...baseVariables,
        currency: 'EUR',
      });

      expect(result.html).toContain('EUR');
      expect(result.text).toContain('EUR');
    });
  });

  describe('Payment Receipt Template', () => {
    const baseVariables: PaymentReceiptVariables = {
      user_name: 'John Doe',
      plan_tier: 'Enterprise',
      amount: '199.00',
    };

    it('should generate payment receipt with required fields', () => {
      const result = templateService.generateTemplate('payment_receipt', baseVariables);

      expect(result.subject).toContain('Payment receipt');
      expect(result.subject).toContain('199.00');
      expect(result.html).toContain('Payment Received');
      expect(result.html).toContain('Enterprise');
      expect(result.html).toContain('199.00');
    });

    it('should include invoice number when provided', () => {
      const result = templateService.generateTemplate('payment_receipt', {
        ...baseVariables,
        invoice_number: 'INV-2025-001',
      });

      expect(result.html).toContain('INV-2025-001');
      expect(result.text).toContain('INV-2025-001');
    });

    it('should include payment method when provided', () => {
      const result = templateService.generateTemplate('payment_receipt', {
        ...baseVariables,
        payment_method: 'Visa ending in 4242',
      });

      expect(result.html).toContain('Visa ending in 4242');
      expect(result.text).toContain('Visa ending in 4242');
    });

    it('should include download invoice button when URL provided', () => {
      const result = templateService.generateTemplate('payment_receipt', {
        ...baseVariables,
        invoice_url: 'https://billing.example.com/download/123',
      });

      expect(result.html).toContain('Download Invoice');
      expect(result.html).toContain('https://billing.example.com/download/123');
    });
  });

  describe('Payment Failed Template', () => {
    const baseVariables: PaymentFailedVariables = {
      user_name: 'John Doe',
      plan_tier: 'Professional',
      amount: '49.99',
    };

    it('should generate payment failed notification with required fields', () => {
      const result = templateService.generateTemplate('payment_failed', baseVariables);

      expect(result.subject).toContain('Action required');
      expect(result.subject).toContain('Payment failed');
      expect(result.html).toContain('Payment Failed');
      expect(result.html).toContain('49.99');
      expect(result.html).toContain('Update Payment Method');
    });

    it('should include failure reason when provided', () => {
      const result = templateService.generateTemplate('payment_failed', {
        ...baseVariables,
        failure_reason: 'Card declined by issuing bank',
      });

      expect(result.html).toContain('Card declined by issuing bank');
      expect(result.text).toContain('Card declined by issuing bank');
    });

    it('should include retry date when provided', () => {
      const result = templateService.generateTemplate('payment_failed', {
        ...baseVariables,
        retry_date: 'December 10, 2025',
      });

      expect(result.html).toContain('December 10, 2025');
      expect(result.text).toContain('December 10, 2025');
    });

    it('should use custom update payment URL when provided', () => {
      const result = templateService.generateTemplate('payment_failed', {
        ...baseVariables,
        update_payment_url: 'https://custom.com/update-card',
      });

      expect(result.html).toContain('https://custom.com/update-card');
      expect(result.text).toContain('https://custom.com/update-card');
    });

    it('should list common failure reasons', () => {
      const result = templateService.generateTemplate('payment_failed', baseVariables);

      expect(result.html).toContain('Insufficient funds');
      expect(result.html).toContain('Expired card');
      expect(result.text).toContain('Insufficient funds');
    });
  });

  describe('Quota Warning Template', () => {
    const baseVariables: QuotaWarningVariables = {
      user_name: 'John Doe',
      organization_name: 'Acme Corp',
      quota_dimension: 'Sites',
      quota_percentage: 80,
      current_usage: 8,
      quota_limit: 10,
      remaining: 2,
    };

    it('should generate quota warning with required fields', () => {
      const result = templateService.generateTemplate('quota_warning', baseVariables);

      expect(result.subject).toContain('Sites quota at 80%');
      expect(result.html).toContain('Sites');
      expect(result.html).toContain('80%');
      expect(result.html).toContain('8');
      expect(result.html).toContain('10');
      expect(result.html).toContain('2');
    });

    it('should show Notice level for 80% threshold', () => {
      const result = templateService.generateTemplate('quota_warning', baseVariables);

      expect(result.html).toContain('Notice');
      expect(result.text).toContain('NOTICE');
      // Should not show "Action Required" at 80%
      expect(result.html).not.toContain('Action Required');
    });

    it('should show Warning level for 90% threshold', () => {
      const result = templateService.generateTemplate('quota_warning', {
        ...baseVariables,
        quota_percentage: 90,
        current_usage: 9,
        remaining: 1,
      });

      expect(result.html).toContain('Warning');
      expect(result.html).toContain('Action Required');
      expect(result.html).toContain('Upgrade Plan');
    });

    it('should show Critical level for 95%+ threshold', () => {
      const result = templateService.generateTemplate('quota_warning', {
        ...baseVariables,
        quota_percentage: 97,
        current_usage: 97,
        quota_limit: 100,
        remaining: 3,
      });

      expect(result.html).toContain('Critical');
      expect(result.text).toContain('CRITICAL');
      expect(result.html).toContain('Action Required');
    });

    it('should use custom upgrade URL when provided', () => {
      const result = templateService.generateTemplate('quota_warning', {
        ...baseVariables,
        upgrade_url: 'https://custom.com/plans',
      });

      // Upgrade button only shows for 90%+
      const result90 = templateService.generateTemplate('quota_warning', {
        ...baseVariables,
        quota_percentage: 90,
        upgrade_url: 'https://custom.com/plans',
      });

      expect(result90.html).toContain('https://custom.com/plans');
      expect(result90.text).toContain('https://custom.com/plans');
    });

    it('should format large numbers with locale separators', () => {
      const result = templateService.generateTemplate('quota_warning', {
        ...baseVariables,
        quota_dimension: 'API Calls',
        current_usage: 95000,
        quota_limit: 100000,
        remaining: 5000,
      });

      // Numbers should be formatted
      expect(result.html).toMatch(/95[,.]000/);
      expect(result.html).toMatch(/100[,.]000/);
      expect(result.html).toMatch(/5[,.]000/);
    });
  });

  describe('Quota Exceeded Template', () => {
    const baseVariables: QuotaExceededVariables = {
      user_name: 'John Doe',
      organization_name: 'Acme Corp',
      quota_dimension: 'Storage',
      current_usage: 105,
      quota_limit: 100,
    };

    it('should generate quota exceeded notification with required fields', () => {
      const result = templateService.generateTemplate('quota_exceeded', baseVariables);

      expect(result.subject).toContain('Storage quota exceeded');
      expect(result.subject).toContain('Action required');
      expect(result.html).toContain('Quota Exceeded');
      expect(result.html).toContain('Storage');
      expect(result.html).toContain('Upgrade Now');
    });

    it('should list blocked actions when provided', () => {
      const result = templateService.generateTemplate('quota_exceeded', {
        ...baseVariables,
        blocked_actions: ['Creating new sites', 'Uploading media', 'Publishing content'],
      });

      expect(result.html).toContain('Creating new sites');
      expect(result.html).toContain('Uploading media');
      expect(result.html).toContain('Publishing content');
      expect(result.text).toContain('Creating new sites');
    });

    it('should show generic restriction message when no blocked actions', () => {
      const result = templateService.generateTemplate('quota_exceeded', baseVariables);

      expect(result.html).toContain('Some features may be restricted');
    });

    it('should use custom upgrade URL when provided', () => {
      const result = templateService.generateTemplate('quota_exceeded', {
        ...baseVariables,
        upgrade_url: 'https://custom.com/upgrade-now',
      });

      expect(result.html).toContain('https://custom.com/upgrade-now');
      expect(result.text).toContain('https://custom.com/upgrade-now');
    });

    it('should highlight current usage in red', () => {
      const result = templateService.generateTemplate('quota_exceeded', baseVariables);

      expect(result.html).toContain('style="color: #dc2626;"');
    });
  });

  describe('Member Invite Template', () => {
    const baseVariables: MemberInviteVariables = {
      user_name: 'Jane Smith',
      inviter_name: 'John Doe',
      organization_name: 'Acme Corp',
      invite_url: 'https://app.example.com/invite/abc123',
    };

    it('should generate member invite with required fields', () => {
      const result = templateService.generateTemplate('member_invite', baseVariables);

      expect(result.subject).toContain('John Doe invited you');
      expect(result.subject).toContain('Acme Corp');
      expect(result.html).toContain("You're Invited");
      expect(result.html).toContain('John Doe');
      expect(result.html).toContain('Acme Corp');
      expect(result.html).toContain('Accept Invitation');
    });

    it('should include inviter email when provided', () => {
      const result = templateService.generateTemplate('member_invite', {
        ...baseVariables,
        inviter_email: 'john@acme.com',
      });

      expect(result.html).toContain('john@acme.com');
      expect(result.text).toContain('john@acme.com');
    });

    it('should include role when provided', () => {
      const result = templateService.generateTemplate('member_invite', {
        ...baseVariables,
        role: 'Editor',
      });

      expect(result.html).toContain('Editor');
      expect(result.text).toContain('Editor');
    });

    it('should include expiration date when provided', () => {
      const result = templateService.generateTemplate('member_invite', {
        ...baseVariables,
        expires_at: 'December 15, 2025',
      });

      expect(result.html).toContain('December 15, 2025');
      expect(result.text).toContain('December 15, 2025');
    });

    it('should include safety note about unexpected invitations', () => {
      const result = templateService.generateTemplate('member_invite', baseVariables);

      expect(result.html).toContain("weren't expecting this invitation");
      expect(result.text).toContain("weren't expecting this invitation");
    });
  });

  describe('Subscription Canceled Template', () => {
    const baseVariables: SubscriptionCanceledVariables = {
      user_name: 'John Doe',
      plan_tier: 'Professional',
    };

    it('should generate subscription canceled notification with required fields', () => {
      const result = templateService.generateTemplate('subscription_canceled', baseVariables);

      expect(result.subject).toContain('subscription has been canceled');
      expect(result.html).toContain('Subscription Canceled');
      expect(result.html).toContain('Professional');
      expect(result.html).toContain('Reactivate Subscription');
    });

    it('should include access until date when provided', () => {
      const result = templateService.generateTemplate('subscription_canceled', {
        ...baseVariables,
        access_until: 'January 31, 2025',
      });

      expect(result.html).toContain('January 31, 2025');
      expect(result.html).toContain("continue to have access");
      expect(result.text).toContain('January 31, 2025');
    });

    it('should include cancellation reason when provided', () => {
      const result = templateService.generateTemplate('subscription_canceled', {
        ...baseVariables,
        reason: 'User requested',
      });

      expect(result.html).toContain('User requested');
      expect(result.text).toContain('User requested');
    });

    it('should include feedback URL when provided', () => {
      const result = templateService.generateTemplate('subscription_canceled', {
        ...baseVariables,
        feedback_url: 'https://example.com/feedback',
      });

      expect(result.html).toContain('Share feedback');
      expect(result.html).toContain('https://example.com/feedback');
    });

    it('should use custom reactivate URL when provided', () => {
      const result = templateService.generateTemplate('subscription_canceled', {
        ...baseVariables,
        reactivate_url: 'https://custom.com/reactivate',
      });

      expect(result.html).toContain('https://custom.com/reactivate');
      expect(result.text).toContain('https://custom.com/reactivate');
    });

    it('should include hope to see you message', () => {
      const result = templateService.generateTemplate('subscription_canceled', baseVariables);

      expect(result.html).toContain('hope to see you again');
      expect(result.text).toContain('hope to see you again');
    });
  });

  describe('HTML Template Structure', () => {
    it('should include DOCTYPE declaration', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: 'Test',
      });

      expect(result.html).toMatch(/^<!DOCTYPE html>/);
    });

    it('should include responsive meta viewport', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: 'Test',
      });

      expect(result.html).toContain('viewport');
      expect(result.html).toContain('width=device-width');
    });

    it('should include CSS styles', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: 'Test',
      });

      expect(result.html).toContain('<style>');
      expect(result.html).toContain('.container');
      expect(result.html).toContain('.cta-button');
    });

    it('should include footer with company info', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: 'Test',
      });

      expect(result.html).toContain('automated notification');
      expect(result.html).toContain('DProgres CMS');
      expect(result.html).toContain(new Date().getFullYear().toString());
    });

    it('should escape HTML entities in user input', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: '<script>alert("xss")</script>',
        organization_name: 'Test & Co <Corp>',
      });

      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
      expect(result.html).toContain('Test &amp; Co');
    });
  });

  describe('Plain Text Template Structure', () => {
    it('should not contain HTML tags', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: 'Test',
      });

      expect(result.text).not.toMatch(/<[a-z][\s\S]*>/i);
    });

    it('should include company signature', () => {
      const result = templateService.generateTemplate('welcome_email', {
        user_name: 'Test',
      });

      expect(result.text).toContain('---');
      expect(result.text).toContain('DProgres CMS');
    });

    it('should include URLs as plain text', () => {
      const result = templateService.generateTemplate('member_invite', {
        inviter_name: 'John',
        invite_url: 'https://example.com/invite/123',
      });

      expect(result.text).toContain('https://example.com/invite/123');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown template type', () => {
      expect(() => {
        templateService.generateTemplate('unknown_template' as SaaSEmailTemplate, {});
      }).toThrow('Unknown template type: unknown_template');
    });
  });

  describe('getSubject Helper', () => {
    it('should return only the subject line', () => {
      const subject = templateService.getSubject('welcome_email', { user_name: 'John' });

      expect(subject).toBe('Welcome to DProgres CMS!');
      expect(subject).not.toContain('<');
    });
  });

  describe('All 8 Templates Generate Successfully', () => {
    const templates: Array<{ name: SaaSEmailTemplate; variables: Record<string, unknown> }> = [
      { name: 'welcome_email', variables: { user_name: 'Test' } },
      { name: 'subscription_confirmation', variables: { plan_tier: 'Pro', amount: '99' } },
      { name: 'payment_receipt', variables: { plan_tier: 'Pro', amount: '99' } },
      { name: 'payment_failed', variables: { plan_tier: 'Pro', amount: '99' } },
      { name: 'quota_warning', variables: { quota_dimension: 'Sites', quota_percentage: 80, current_usage: 8, quota_limit: 10, remaining: 2 } },
      { name: 'quota_exceeded', variables: { quota_dimension: 'Sites', current_usage: 12, quota_limit: 10 } },
      { name: 'member_invite', variables: { inviter_name: 'John', invite_url: 'https://example.com' } },
      { name: 'subscription_canceled', variables: { plan_tier: 'Pro' } },
    ];

    templates.forEach(({ name, variables }) => {
      it(`should generate ${name} template successfully`, () => {
        const result = templateService.generateTemplate(name, variables as any);

        expect(result.subject).toBeTruthy();
        expect(result.subject.length).toBeGreaterThan(0);
        expect(result.html).toBeTruthy();
        expect(result.html.length).toBeGreaterThan(0);
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(0);

        // All should have proper HTML structure
        expect(result.html).toContain('<!DOCTYPE html>');
        expect(result.html).toContain('</html>');

        // All should have footer
        expect(result.html).toContain('DProgres CMS');
      });
    });
  });
});
