/**
 * EmailTemplateService - Email template management for SaaS lifecycle events (SF-014, SF-015)
 *
 * This service provides 10 email templates for key SaaS events:
 * 1. welcome_email - User signup welcome
 * 2. subscription_confirmation - First payment confirmation
 * 3. payment_receipt - Recurring payment receipts
 * 4. payment_failed - Failed payment retry prompt
 * 5. quota_warning - Usage threshold alerts (80%, 90%, 95%)
 * 6. quota_exceeded - Hard limit notification
 * 7. member_invite - Team member invitation
 * 8. subscription_canceled - Cancellation confirmation
 * 9. trial_ending - Trial ending warning (3-day notice)
 * 10. invoice_upcoming - Invoice upcoming notification (7-day notice)
 *
 * Features:
 * - Consistent branding across all templates
 * - Variable interpolation with {{variable}} syntax
 * - Both HTML and plain text versions
 * - Configurable URLs (upgrade, dashboard, etc.)
 * - Responsive email design
 *
 * @example
 * ```typescript
 * import { emailTemplateService } from './services/EmailTemplateService';
 *
 * // Generate a welcome email
 * const { html, text, subject } = emailTemplateService.generateTemplate('welcome_email', {
 *   user_name: 'John Doe',
 *   organization_name: 'Acme Corp',
 * });
 * ```
 */

/**
 * Available email template types for SaaS lifecycle events
 */
export type SaaSEmailTemplate =
  | 'welcome_email'
  | 'subscription_confirmation'
  | 'payment_receipt'
  | 'payment_failed'
  | 'quota_warning'
  | 'quota_exceeded'
  | 'member_invite'
  | 'subscription_canceled'
  | 'trial_ending'
  | 'invoice_upcoming';

/**
 * Common template variables available across all templates
 */
export interface BaseTemplateVariables {
  user_name?: string;
  user_email?: string;
  organization_name?: string;
  organization_id?: number;
}

/**
 * Variables specific to welcome email template
 */
export interface WelcomeEmailVariables extends BaseTemplateVariables {
  login_url?: string;
  getting_started_url?: string;
}

/**
 * Variables specific to subscription confirmation template
 */
export interface SubscriptionConfirmationVariables extends BaseTemplateVariables {
  plan_tier: string;
  amount: string;
  currency?: string;
  billing_period?: string;
  next_billing_date?: string;
  invoice_url?: string;
}

/**
 * Variables specific to payment receipt template
 */
export interface PaymentReceiptVariables extends BaseTemplateVariables {
  plan_tier: string;
  amount: string;
  currency?: string;
  invoice_number?: string;
  payment_date?: string;
  payment_method?: string;
  invoice_url?: string;
}

/**
 * Variables specific to payment failed template
 */
export interface PaymentFailedVariables extends BaseTemplateVariables {
  plan_tier: string;
  amount: string;
  currency?: string;
  failure_reason?: string;
  retry_date?: string;
  update_payment_url?: string;
}

/**
 * Variables specific to quota warning template
 */
export interface QuotaWarningVariables extends BaseTemplateVariables {
  quota_dimension: string;
  quota_percentage: number;
  current_usage: number;
  quota_limit: number;
  remaining: number;
  upgrade_url?: string;
}

/**
 * Variables specific to quota exceeded template
 */
export interface QuotaExceededVariables extends BaseTemplateVariables {
  quota_dimension: string;
  current_usage: number;
  quota_limit: number;
  blocked_actions?: string[];
  upgrade_url?: string;
}

/**
 * Variables specific to member invite template
 */
export interface MemberInviteVariables extends BaseTemplateVariables {
  inviter_name: string;
  inviter_email?: string;
  role?: string;
  invite_url: string;
  expires_at?: string;
}

/**
 * Variables specific to subscription canceled template
 */
export interface SubscriptionCanceledVariables extends BaseTemplateVariables {
  plan_tier: string;
  cancellation_date?: string;
  access_until?: string;
  reason?: string;
  reactivate_url?: string;
  feedback_url?: string;
}

/**
 * Variables specific to trial ending template (SF-015)
 */
export interface TrialEndingVariables extends BaseTemplateVariables {
  plan_tier: string;
  trial_end_date: string;
  days_remaining: number;
  upgrade_url?: string;
  features_at_risk?: string[];
}

/**
 * Variables specific to invoice upcoming template (SF-015)
 */
export interface InvoiceUpcomingVariables extends BaseTemplateVariables {
  plan_tier: string;
  amount: string;
  currency?: string;
  billing_date: string;
  billing_period?: string;
  update_payment_url?: string;
}

/**
 * Union type for all template variables
 */
export type TemplateVariables =
  | WelcomeEmailVariables
  | SubscriptionConfirmationVariables
  | PaymentReceiptVariables
  | PaymentFailedVariables
  | QuotaWarningVariables
  | QuotaExceededVariables
  | MemberInviteVariables
  | SubscriptionCanceledVariables
  | TrialEndingVariables
  | InvoiceUpcomingVariables;

/**
 * Generated email template output
 */
export interface GeneratedTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Service configuration options
 */
export interface EmailTemplateServiceConfig {
  /** Base URL for the application dashboard */
  dashboardUrl?: string;
  /** Base URL for upgrade/billing pages */
  upgradeUrl?: string;
  /** Company name for branding */
  companyName?: string;
  /** Support email address */
  supportEmail?: string;
  /** Primary brand color (hex) */
  primaryColor?: string;
}

/**
 * Branding configuration for email templates
 */
interface BrandingConfig {
  companyName: string;
  primaryColor: string;
  logoUrl: string;
  supportEmail: string;
  dashboardUrl: string;
  upgradeUrl: string;
  websiteUrl: string;
}

/**
 * Required fields for each template type
 * Used for runtime validation to catch missing required variables
 */
const TEMPLATE_REQUIRED_FIELDS: Record<SaaSEmailTemplate, string[]> = {
  welcome_email: [], // All fields optional
  subscription_confirmation: ['plan_tier', 'amount'],
  payment_receipt: ['plan_tier', 'amount'],
  payment_failed: ['plan_tier', 'amount'],
  quota_warning: ['quota_dimension', 'quota_percentage', 'current_usage', 'quota_limit', 'remaining'],
  quota_exceeded: ['quota_dimension', 'current_usage', 'quota_limit'],
  member_invite: ['inviter_name', 'invite_url'],
  subscription_canceled: ['plan_tier'],
  trial_ending: ['plan_tier', 'trial_end_date', 'days_remaining'],
  invoice_upcoming: ['plan_tier', 'amount', 'billing_date'],
};

/**
 * EmailTemplateService class for generating SaaS lifecycle email templates
 */
export class EmailTemplateService {
  private branding: BrandingConfig;

  constructor(config?: EmailTemplateServiceConfig) {
    this.branding = {
      companyName: config?.companyName || process.env.EMAIL_COMPANY_NAME || 'DProgres CMS',
      primaryColor: config?.primaryColor || process.env.EMAIL_PRIMARY_COLOR || '#2563eb',
      logoUrl: process.env.EMAIL_LOGO_URL || '',
      supportEmail: config?.supportEmail || process.env.EMAIL_SUPPORT_EMAIL || 'support@dprogres.com',
      dashboardUrl: config?.dashboardUrl || process.env.EMAIL_DASHBOARD_URL || 'https://app.dprogres.com',
      upgradeUrl: config?.upgradeUrl || process.env.EMAIL_UPGRADE_URL || 'https://app.dprogres.com/billing/upgrade',
      websiteUrl: process.env.EMAIL_WEBSITE_URL || 'https://dprogres.com',
    };
  }

  /**
   * Validate that required fields are present for a template
   * @throws Error if required fields are missing or template is unknown
   */
  private validateRequiredFields(template: SaaSEmailTemplate, variables: TemplateVariables): void {
    const requiredFields = TEMPLATE_REQUIRED_FIELDS[template];

    // If template is not in our map, it's unknown - let the switch handle that error
    if (!requiredFields) {
      return;
    }

    const missingFields: string[] = [];

    for (const field of requiredFields) {
      const value = (variables as Record<string, unknown>)[field];
      if (value === undefined || value === null) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required fields for template '${template}': ${missingFields.join(', ')}`
      );
    }
  }

  /**
   * Generate an email template with the given variables
   *
   * @param template - Template type to generate
   * @param variables - Template variables for interpolation
   * @returns Generated template with subject, html, and text
   * @throws Error if required fields are missing for the template type or template is unknown
   */
  generateTemplate(template: SaaSEmailTemplate, variables: TemplateVariables): GeneratedTemplate {
    // Validate required fields before generating template
    this.validateRequiredFields(template, variables);

    switch (template) {
      case 'welcome_email':
        return this.generateWelcomeEmail(variables as WelcomeEmailVariables);
      case 'subscription_confirmation':
        return this.generateSubscriptionConfirmation(variables as SubscriptionConfirmationVariables);
      case 'payment_receipt':
        return this.generatePaymentReceipt(variables as PaymentReceiptVariables);
      case 'payment_failed':
        return this.generatePaymentFailed(variables as PaymentFailedVariables);
      case 'quota_warning':
        return this.generateQuotaWarning(variables as QuotaWarningVariables);
      case 'quota_exceeded':
        return this.generateQuotaExceeded(variables as QuotaExceededVariables);
      case 'member_invite':
        return this.generateMemberInvite(variables as MemberInviteVariables);
      case 'subscription_canceled':
        return this.generateSubscriptionCanceled(variables as SubscriptionCanceledVariables);
      case 'trial_ending':
        return this.generateTrialEnding(variables as TrialEndingVariables);
      case 'invoice_upcoming':
        return this.generateInvoiceUpcoming(variables as InvoiceUpcomingVariables);
      default:
        throw new Error(`Unknown template type: ${template}`);
    }
  }

  /**
   * Get the subject line for a template
   */
  getSubject(template: SaaSEmailTemplate, variables: TemplateVariables): string {
    return this.generateTemplate(template, variables).subject;
  }

  /**
   * Interpolate variables into a template string
   * Replaces {{variable}} with the corresponding value
   */
  interpolate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = variables[key];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * Update branding configuration
   */
  updateBranding(config: Partial<BrandingConfig>): void {
    this.branding = { ...this.branding, ...config };
  }

  /**
   * Get current branding configuration
   */
  getBranding(): BrandingConfig {
    return { ...this.branding };
  }

  // ============================================
  // Template Generators
  // ============================================

  /**
   * Generate welcome email for new user signups
   */
  private generateWelcomeEmail(variables: WelcomeEmailVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const orgName = variables.organization_name || '';
    const loginUrl = variables.login_url || this.branding.dashboardUrl;
    const gettingStartedUrl = variables.getting_started_url || `${this.branding.dashboardUrl}/getting-started`;

    const subject = `Welcome to ${this.branding.companyName}!`;

    const html = this.wrapHtml(`
      <div class="header">
        <h1>Welcome to ${this.branding.companyName}!</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>Thank you for joining ${this.branding.companyName}${orgName ? ` with <strong>${this.escapeHtml(orgName)}</strong>` : ''}! We're excited to have you on board.</p>

        <p>Here's what you can do next:</p>

        <ul>
          <li><strong>Explore the Dashboard</strong> - Get familiar with your new workspace</li>
          <li><strong>Create Your First Site</strong> - Start building your content</li>
          <li><strong>Invite Your Team</strong> - Collaborate with colleagues</li>
        </ul>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(loginUrl)}" class="cta-button">Go to Dashboard</a>
        </p>

        <p>Need help getting started? Check out our <a href="${this.escapeHtml(gettingStartedUrl)}">getting started guide</a> or reach out to our support team.</p>

        <p>We're here to help you succeed!</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Welcome to ${this.branding.companyName}!

Hi ${userName},

Thank you for joining ${this.branding.companyName}${orgName ? ` with ${orgName}` : ''}! We're excited to have you on board.

Here's what you can do next:
- Explore the Dashboard - Get familiar with your new workspace
- Create Your First Site - Start building your content
- Invite Your Team - Collaborate with colleagues

Go to Dashboard: ${loginUrl}

Need help getting started? Check out our getting started guide: ${gettingStartedUrl}

We're here to help you succeed!

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate subscription confirmation for first payment
   */
  private generateSubscriptionConfirmation(variables: SubscriptionConfirmationVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const planTier = variables.plan_tier;
    const amount = variables.amount;
    const currency = variables.currency || 'USD';
    const billingPeriod = variables.billing_period || 'month';
    const nextBillingDate = variables.next_billing_date || '';
    const invoiceUrl = variables.invoice_url || '';

    const subject = `Your ${this.branding.companyName} ${planTier} subscription is confirmed`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: #10b981;">
        <h1 style="color: #10b981;">Subscription Confirmed!</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>Thank you for subscribing to <strong>${this.branding.companyName} ${this.escapeHtml(planTier)}</strong>! Your subscription is now active.</p>

        <div class="stats-box">
          <div class="stat-row">
            <span class="stat-label">Plan</span>
            <span class="stat-value">${this.escapeHtml(planTier)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Amount</span>
            <span class="stat-value">${this.escapeHtml(currency)} ${this.escapeHtml(amount)}/${this.escapeHtml(billingPeriod)}</span>
          </div>
          ${nextBillingDate ? `
          <div class="stat-row">
            <span class="stat-label">Next Billing Date</span>
            <span class="stat-value">${this.escapeHtml(nextBillingDate)}</span>
          </div>
          ` : ''}
        </div>

        <p>You now have access to all ${this.escapeHtml(planTier)} features:</p>
        <ul>
          <li>Increased site and content limits</li>
          <li>Priority support</li>
          <li>Advanced collaboration features</li>
          <li>Enhanced analytics</li>
        </ul>

        ${invoiceUrl ? `
        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(invoiceUrl)}" class="cta-button" style="background-color: #10b981;">View Invoice</a>
        </p>
        ` : ''}

        <p>Questions about your subscription? Contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Thank you for your business!</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Subscription Confirmed!

Hi ${userName},

Thank you for subscribing to ${this.branding.companyName} ${planTier}! Your subscription is now active.

Subscription Details:
- Plan: ${planTier}
- Amount: ${currency} ${amount}/${billingPeriod}
${nextBillingDate ? `- Next Billing Date: ${nextBillingDate}` : ''}

You now have access to all ${planTier} features:
- Increased site and content limits
- Priority support
- Advanced collaboration features
- Enhanced analytics
${invoiceUrl ? `
View Invoice: ${invoiceUrl}
` : ''}
Questions about your subscription? Contact us at ${this.branding.supportEmail}.

Thank you for your business!

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate payment receipt for recurring payments
   */
  private generatePaymentReceipt(variables: PaymentReceiptVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const planTier = variables.plan_tier;
    const amount = variables.amount;
    const currency = variables.currency || 'USD';
    const invoiceNumber = variables.invoice_number || '';
    const paymentDate = variables.payment_date || new Date().toLocaleDateString();
    const paymentMethod = variables.payment_method || 'Card';
    const invoiceUrl = variables.invoice_url || '';

    const subject = `Payment receipt for ${this.branding.companyName} - ${currency} ${amount}`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: #10b981;">
        <h1 style="color: #10b981;">Payment Received</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>Thank you for your payment. Here's your receipt:</p>

        <div class="stats-box">
          ${invoiceNumber ? `
          <div class="stat-row">
            <span class="stat-label">Invoice Number</span>
            <span class="stat-value">${this.escapeHtml(invoiceNumber)}</span>
          </div>
          ` : ''}
          <div class="stat-row">
            <span class="stat-label">Date</span>
            <span class="stat-value">${this.escapeHtml(paymentDate)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Plan</span>
            <span class="stat-value">${this.escapeHtml(planTier)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Amount</span>
            <span class="stat-value" style="font-size: 18px;">${this.escapeHtml(currency)} ${this.escapeHtml(amount)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Payment Method</span>
            <span class="stat-value">${this.escapeHtml(paymentMethod)}</span>
          </div>
        </div>

        ${invoiceUrl ? `
        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(invoiceUrl)}" class="cta-button" style="background-color: #10b981;">Download Invoice</a>
        </p>
        ` : ''}

        <p>This payment will appear on your statement as "${this.branding.companyName}".</p>

        <p>Questions about this payment? Contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Payment Received

Hi ${userName},

Thank you for your payment. Here's your receipt:
${invoiceNumber ? `
Invoice Number: ${invoiceNumber}` : ''}
Date: ${paymentDate}
Plan: ${planTier}
Amount: ${currency} ${amount}
Payment Method: ${paymentMethod}
${invoiceUrl ? `
Download Invoice: ${invoiceUrl}
` : ''}
This payment will appear on your statement as "${this.branding.companyName}".

Questions about this payment? Contact us at ${this.branding.supportEmail}.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate payment failed notification with retry prompt
   */
  private generatePaymentFailed(variables: PaymentFailedVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const planTier = variables.plan_tier;
    const amount = variables.amount;
    const currency = variables.currency || 'USD';
    const failureReason = variables.failure_reason || 'Your payment could not be processed';
    const retryDate = variables.retry_date || '';
    const updatePaymentUrl = variables.update_payment_url || `${this.branding.dashboardUrl}/billing/payment-methods`;

    const subject = `Action required: Payment failed for your ${this.branding.companyName} subscription`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: #dc2626;">
        <h1 style="color: #dc2626;">Payment Failed</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>We were unable to process your payment for your <strong>${this.branding.companyName} ${this.escapeHtml(planTier)}</strong> subscription.</p>

        <div class="stats-box" style="border-color: #fecaca; background-color: #fef2f2;">
          <div class="stat-row">
            <span class="stat-label">Amount Due</span>
            <span class="stat-value">${this.escapeHtml(currency)} ${this.escapeHtml(amount)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Reason</span>
            <span class="stat-value">${this.escapeHtml(failureReason)}</span>
          </div>
          ${retryDate ? `
          <div class="stat-row">
            <span class="stat-label">Next Retry</span>
            <span class="stat-value">${this.escapeHtml(retryDate)}</span>
          </div>
          ` : ''}
        </div>

        <p><strong>Please update your payment method to avoid service interruption.</strong></p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(updatePaymentUrl)}" class="cta-button" style="background-color: #dc2626;">Update Payment Method</a>
        </p>

        <p>Common reasons for payment failures:</p>
        <ul>
          <li>Insufficient funds</li>
          <li>Expired card</li>
          <li>Incorrect billing information</li>
          <li>Card declined by issuing bank</li>
        </ul>

        <p>If you need assistance, please contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Payment Failed

Hi ${userName},

We were unable to process your payment for your ${this.branding.companyName} ${planTier} subscription.

Amount Due: ${currency} ${amount}
Reason: ${failureReason}
${retryDate ? `Next Retry: ${retryDate}` : ''}

Please update your payment method to avoid service interruption.

Update Payment Method: ${updatePaymentUrl}

Common reasons for payment failures:
- Insufficient funds
- Expired card
- Incorrect billing information
- Card declined by issuing bank

If you need assistance, please contact us at ${this.branding.supportEmail}.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate quota warning notification
   */
  private generateQuotaWarning(variables: QuotaWarningVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const orgName = variables.organization_name || 'Your organization';
    const dimension = variables.quota_dimension;
    const percentage = variables.quota_percentage;
    const current = variables.current_usage;
    const limit = variables.quota_limit;
    const remaining = variables.remaining;
    const upgradeUrl = variables.upgrade_url || this.branding.upgradeUrl;

    const urgencyLevel = percentage >= 95 ? 'critical' : percentage >= 90 ? 'warning' : 'info';
    const urgencyColor = percentage >= 95 ? '#dc2626' : percentage >= 90 ? '#f59e0b' : '#2563eb';
    const urgencyLabel = percentage >= 95 ? 'Critical' : percentage >= 90 ? 'Warning' : 'Notice';

    const subject = `[${this.branding.companyName}] ${dimension} quota at ${percentage}%`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: ${urgencyColor};">
        <h1 style="color: ${urgencyColor};">${urgencyLabel}: ${this.escapeHtml(dimension)} Quota Alert</h1>
        <div class="percentage-badge" style="background-color: ${urgencyColor};">${percentage}% Used</div>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p><strong>${this.escapeHtml(orgName)}</strong> has reached <strong>${percentage}%</strong> of its ${this.escapeHtml(dimension.toLowerCase())} quota.</p>

        <div class="stats-box">
          <div class="stat-row">
            <span class="stat-label">Resource Type</span>
            <span class="stat-value">${this.escapeHtml(dimension)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Current Usage</span>
            <span class="stat-value">${current.toLocaleString()}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Quota Limit</span>
            <span class="stat-value">${limit.toLocaleString()}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Remaining</span>
            <span class="stat-value">${remaining.toLocaleString()}</span>
          </div>
        </div>

        ${percentage >= 90 ? `
        <p><strong>Action Required:</strong> Please consider upgrading your plan or reducing usage to avoid service interruptions.</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(upgradeUrl)}" class="cta-button">Upgrade Plan</a>
        </p>
        ` : `
        <p>This is a friendly reminder to help you manage your resources proactively. No immediate action is required, but you may want to review your usage.</p>
        `}

        <p>Questions? Contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
${urgencyLabel.toUpperCase()}: ${dimension} Quota Alert

Hi ${userName},

${orgName} has reached ${percentage}% of its ${dimension.toLowerCase()} quota.

Resource Type: ${dimension}
Current Usage: ${current.toLocaleString()}
Quota Limit: ${limit.toLocaleString()}
Remaining: ${remaining.toLocaleString()}

${percentage >= 90 ? `
Action Required: Please consider upgrading your plan or reducing usage to avoid service interruptions.

Upgrade Plan: ${upgradeUrl}
` : `
This is a friendly reminder to help you manage your resources proactively.
`}
Questions? Contact us at ${this.branding.supportEmail}.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate quota exceeded notification (hard limit)
   */
  private generateQuotaExceeded(variables: QuotaExceededVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const orgName = variables.organization_name || 'Your organization';
    const dimension = variables.quota_dimension;
    const current = variables.current_usage;
    const limit = variables.quota_limit;
    const blockedActions = variables.blocked_actions || [];
    const upgradeUrl = variables.upgrade_url || this.branding.upgradeUrl;

    const subject = `[${this.branding.companyName}] ${dimension} quota exceeded - Action required`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: #dc2626;">
        <h1 style="color: #dc2626;">Quota Exceeded</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p><strong>${this.escapeHtml(orgName)}</strong> has exceeded its ${this.escapeHtml(dimension.toLowerCase())} quota limit.</p>

        <div class="stats-box" style="border-color: #fecaca; background-color: #fef2f2;">
          <div class="stat-row">
            <span class="stat-label">Resource Type</span>
            <span class="stat-value">${this.escapeHtml(dimension)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Current Usage</span>
            <span class="stat-value" style="color: #dc2626;">${current.toLocaleString()}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Quota Limit</span>
            <span class="stat-value">${limit.toLocaleString()}</span>
          </div>
        </div>

        ${blockedActions.length > 0 ? `
        <p><strong>The following actions are now blocked:</strong></p>
        <ul>
          ${blockedActions.map(action => `<li>${this.escapeHtml(action)}</li>`).join('')}
        </ul>
        ` : `
        <p><strong>Some features may be restricted until you upgrade or reduce usage.</strong></p>
        `}

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(upgradeUrl)}" class="cta-button" style="background-color: #dc2626;">Upgrade Now</a>
        </p>

        <p>Need help? Contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
QUOTA EXCEEDED

Hi ${userName},

${orgName} has exceeded its ${dimension.toLowerCase()} quota limit.

Resource Type: ${dimension}
Current Usage: ${current.toLocaleString()}
Quota Limit: ${limit.toLocaleString()}
${blockedActions.length > 0 ? `
The following actions are now blocked:
${blockedActions.map(action => `- ${action}`).join('\n')}
` : `
Some features may be restricted until you upgrade or reduce usage.
`}
Upgrade Now: ${upgradeUrl}

Need help? Contact us at ${this.branding.supportEmail}.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate member invitation email
   */
  private generateMemberInvite(variables: MemberInviteVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const inviterName = variables.inviter_name;
    const inviterEmail = variables.inviter_email || '';
    const orgName = variables.organization_name || 'an organization';
    const role = variables.role || 'member';
    const inviteUrl = variables.invite_url;
    const expiresAt = variables.expires_at || '';

    const subject = `${inviterName} invited you to join ${orgName} on ${this.branding.companyName}`;

    const html = this.wrapHtml(`
      <div class="header">
        <h1>You're Invited!</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p><strong>${this.escapeHtml(inviterName)}</strong>${inviterEmail ? ` (${this.escapeHtml(inviterEmail)})` : ''} has invited you to join <strong>${this.escapeHtml(orgName)}</strong> on ${this.branding.companyName}.</p>

        <div class="stats-box">
          <div class="stat-row">
            <span class="stat-label">Organization</span>
            <span class="stat-value">${this.escapeHtml(orgName)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Role</span>
            <span class="stat-value">${this.escapeHtml(role)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Invited By</span>
            <span class="stat-value">${this.escapeHtml(inviterName)}</span>
          </div>
          ${expiresAt ? `
          <div class="stat-row">
            <span class="stat-label">Expires</span>
            <span class="stat-value">${this.escapeHtml(expiresAt)}</span>
          </div>
          ` : ''}
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(inviteUrl)}" class="cta-button">Accept Invitation</a>
        </p>

        <p>If you weren't expecting this invitation, you can safely ignore this email.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
You're Invited!

Hi ${userName},

${inviterName}${inviterEmail ? ` (${inviterEmail})` : ''} has invited you to join ${orgName} on ${this.branding.companyName}.

Organization: ${orgName}
Role: ${role}
Invited By: ${inviterName}
${expiresAt ? `Expires: ${expiresAt}` : ''}

Accept Invitation: ${inviteUrl}

If you weren't expecting this invitation, you can safely ignore this email.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate subscription canceled notification
   */
  private generateSubscriptionCanceled(variables: SubscriptionCanceledVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const planTier = variables.plan_tier;
    const cancellationDate = variables.cancellation_date || new Date().toLocaleDateString();
    const accessUntil = variables.access_until || '';
    const reason = variables.reason || '';
    const reactivateUrl = variables.reactivate_url || `${this.branding.dashboardUrl}/billing/reactivate`;
    const feedbackUrl = variables.feedback_url || '';

    const subject = `Your ${this.branding.companyName} subscription has been canceled`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: #6b7280;">
        <h1 style="color: #6b7280;">Subscription Canceled</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>Your <strong>${this.branding.companyName} ${this.escapeHtml(planTier)}</strong> subscription has been canceled.</p>

        <div class="stats-box">
          <div class="stat-row">
            <span class="stat-label">Plan</span>
            <span class="stat-value">${this.escapeHtml(planTier)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Cancellation Date</span>
            <span class="stat-value">${this.escapeHtml(cancellationDate)}</span>
          </div>
          ${accessUntil ? `
          <div class="stat-row">
            <span class="stat-label">Access Until</span>
            <span class="stat-value">${this.escapeHtml(accessUntil)}</span>
          </div>
          ` : ''}
          ${reason ? `
          <div class="stat-row">
            <span class="stat-label">Reason</span>
            <span class="stat-value">${this.escapeHtml(reason)}</span>
          </div>
          ` : ''}
        </div>

        ${accessUntil ? `
        <p>You'll continue to have access to your ${this.escapeHtml(planTier)} features until <strong>${this.escapeHtml(accessUntil)}</strong>. After that, your account will be downgraded to the free tier.</p>
        ` : ''}

        <p>Changed your mind? You can reactivate your subscription at any time.</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(reactivateUrl)}" class="cta-button">Reactivate Subscription</a>
        </p>

        ${feedbackUrl ? `
        <p>We'd love to hear why you decided to cancel. Your feedback helps us improve: <a href="${this.escapeHtml(feedbackUrl)}">Share feedback</a></p>
        ` : ''}

        <p>If you have any questions, please contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Thank you for being a ${this.branding.companyName} customer. We hope to see you again!</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Subscription Canceled

Hi ${userName},

Your ${this.branding.companyName} ${planTier} subscription has been canceled.

Plan: ${planTier}
Cancellation Date: ${cancellationDate}
${accessUntil ? `Access Until: ${accessUntil}` : ''}
${reason ? `Reason: ${reason}` : ''}
${accessUntil ? `
You'll continue to have access to your ${planTier} features until ${accessUntil}. After that, your account will be downgraded to the free tier.
` : ''}
Changed your mind? You can reactivate your subscription at any time.

Reactivate Subscription: ${reactivateUrl}
${feedbackUrl ? `
We'd love to hear why you decided to cancel: ${feedbackUrl}
` : ''}
If you have any questions, please contact us at ${this.branding.supportEmail}.

Thank you for being a ${this.branding.companyName} customer. We hope to see you again!

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate trial ending warning email (3-day notice) (SF-015)
   */
  private generateTrialEnding(variables: TrialEndingVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const orgName = variables.organization_name || 'Your organization';
    const planTier = variables.plan_tier;
    const trialEndDate = variables.trial_end_date;
    const daysRemaining = variables.days_remaining;
    const upgradeUrl = variables.upgrade_url || this.branding.upgradeUrl;
    const featuresAtRisk = variables.features_at_risk || [];

    const urgencyColor = daysRemaining <= 1 ? '#dc2626' : '#f59e0b';
    const subject = `Your ${this.branding.companyName} trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: ${urgencyColor};">
        <h1 style="color: ${urgencyColor};">Your Trial is Ending Soon</h1>
        <div class="percentage-badge" style="background-color: ${urgencyColor};">${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Left</div>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>Your <strong>${this.branding.companyName} ${this.escapeHtml(planTier)}</strong> trial for <strong>${this.escapeHtml(orgName)}</strong> is ending soon.</p>

        <div class="stats-box" style="border-color: ${urgencyColor}20; background-color: ${urgencyColor}10;">
          <div class="stat-row">
            <span class="stat-label">Plan</span>
            <span class="stat-value">${this.escapeHtml(planTier)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Trial Ends</span>
            <span class="stat-value">${this.escapeHtml(trialEndDate)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Days Remaining</span>
            <span class="stat-value" style="color: ${urgencyColor};">${daysRemaining}</span>
          </div>
        </div>

        ${featuresAtRisk.length > 0 ? `
        <p><strong>After your trial ends, you'll lose access to:</strong></p>
        <ul>
          ${featuresAtRisk.map(feature => `<li>${this.escapeHtml(feature)}</li>`).join('')}
        </ul>
        ` : `
        <p>After your trial ends, you'll be downgraded to the free tier with limited features.</p>
        `}

        <p><strong>Upgrade now to keep all your ${this.escapeHtml(planTier)} features!</strong></p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(upgradeUrl)}" class="cta-button" style="background-color: ${urgencyColor};">Upgrade Now</a>
        </p>

        <p>Questions about our plans? Contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Your Trial is Ending Soon

Hi ${userName},

Your ${this.branding.companyName} ${planTier} trial for ${orgName} is ending soon.

Plan: ${planTier}
Trial Ends: ${trialEndDate}
Days Remaining: ${daysRemaining}
${featuresAtRisk.length > 0 ? `
After your trial ends, you'll lose access to:
${featuresAtRisk.map(feature => `- ${feature}`).join('\n')}
` : `
After your trial ends, you'll be downgraded to the free tier with limited features.
`}
Upgrade now to keep all your ${planTier} features!

Upgrade Now: ${upgradeUrl}

Questions about our plans? Contact us at ${this.branding.supportEmail}.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Generate invoice upcoming notification (7-day notice) (SF-015)
   */
  private generateInvoiceUpcoming(variables: InvoiceUpcomingVariables): GeneratedTemplate {
    const userName = variables.user_name || 'there';
    const orgName = variables.organization_name || 'Your organization';
    const planTier = variables.plan_tier;
    const amount = variables.amount;
    const currency = variables.currency || 'USD';
    const billingDate = variables.billing_date;
    const billingPeriod = variables.billing_period || 'month';
    const updatePaymentUrl = variables.update_payment_url || `${this.branding.dashboardUrl}/billing/payment-methods`;

    const subject = `Upcoming invoice: ${currency} ${amount} for ${this.branding.companyName} ${planTier}`;

    const html = this.wrapHtml(`
      <div class="header" style="border-bottom-color: #2563eb;">
        <h1 style="color: #2563eb;">Upcoming Invoice</h1>
      </div>

      <div class="content">
        <p>Hi ${this.escapeHtml(userName)},</p>

        <p>This is a friendly reminder that your <strong>${this.branding.companyName} ${this.escapeHtml(planTier)}</strong> subscription for <strong>${this.escapeHtml(orgName)}</strong> will renew soon.</p>

        <div class="stats-box">
          <div class="stat-row">
            <span class="stat-label">Plan</span>
            <span class="stat-value">${this.escapeHtml(planTier)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Amount</span>
            <span class="stat-value" style="font-size: 18px;">${this.escapeHtml(currency)} ${this.escapeHtml(amount)}/${this.escapeHtml(billingPeriod)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Billing Date</span>
            <span class="stat-value">${this.escapeHtml(billingDate)}</span>
          </div>
        </div>

        <p>Your payment method on file will be charged automatically on ${this.escapeHtml(billingDate)}.</p>

        <p>Need to update your payment method or change your plan?</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(updatePaymentUrl)}" class="cta-button">Manage Billing</a>
        </p>

        <p>Questions about your billing? Contact us at <a href="mailto:${this.branding.supportEmail}">${this.branding.supportEmail}</a>.</p>

        <p>Best regards,<br>The ${this.branding.companyName} Team</p>
      </div>
    `);

    const text = `
Upcoming Invoice

Hi ${userName},

This is a friendly reminder that your ${this.branding.companyName} ${planTier} subscription for ${orgName} will renew soon.

Plan: ${planTier}
Amount: ${currency} ${amount}/${billingPeriod}
Billing Date: ${billingDate}

Your payment method on file will be charged automatically on ${billingDate}.

Need to update your payment method or change your plan?

Manage Billing: ${updatePaymentUrl}

Questions about your billing? Contact us at ${this.branding.supportEmail}.

Best regards,
The ${this.branding.companyName} Team

---
${this.branding.companyName}
${this.branding.websiteUrl}
    `.trim();

    return { subject, html, text };
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Wrap content in the base HTML email template with consistent styling
   */
  private wrapHtml(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email from ${this.branding.companyName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid ${this.branding.primaryColor};
      padding-bottom: 20px;
    }
    .header h1 {
      color: ${this.branding.primaryColor};
      margin: 0;
      font-size: 24px;
    }
    .percentage-badge {
      display: inline-block;
      background-color: ${this.branding.primaryColor};
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 18px;
      font-weight: bold;
      margin-top: 15px;
    }
    .content {
      margin-bottom: 30px;
    }
    .content p {
      margin: 16px 0;
    }
    .content ul {
      margin: 16px 0;
      padding-left: 24px;
    }
    .content li {
      margin: 8px 0;
    }
    .stats-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .stat-row:last-child {
      border-bottom: none;
    }
    .stat-label {
      color: #64748b;
    }
    .stat-value {
      font-weight: 600;
    }
    .cta-button {
      display: inline-block;
      background-color: ${this.branding.primaryColor};
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .cta-button:hover {
      opacity: 0.9;
    }
    a {
      color: ${this.branding.primaryColor};
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }
    .footer a {
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      <p>This is an automated notification from ${this.branding.companyName}.</p>
      <p>&copy; ${new Date().getFullYear()} ${this.branding.companyName}. All rights reserved.</p>
      <p><a href="${this.branding.websiteUrl}">${this.branding.websiteUrl}</a></p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Escape HTML entities to prevent XSS
   */
  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
  }
}

// Export singleton instance
export const emailTemplateService = new EmailTemplateService();
