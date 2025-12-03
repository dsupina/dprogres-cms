import { EventEmitter } from 'events';
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import type { QuotaWarningEvent, QuotaDimension } from './QuotaService';
import { organizationService } from './OrganizationService';

/**
 * Email template types for quota warnings
 */
export type QuotaEmailTemplate = 'quota_warning_80' | 'quota_warning_90' | 'quota_warning_95';

/**
 * General email template types
 */
export type EmailTemplate =
  | QuotaEmailTemplate
  | 'welcome'
  | 'password_reset'
  | 'email_verification'
  | 'invite'
  | 'generic';

/**
 * Email recipient configuration
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Base email send options
 */
export interface SendEmailOptions {
  to: EmailRecipient[];
  subject: string;
  html?: string;
  text?: string;
  template?: EmailTemplate;
  templateId?: string;
  dynamicData?: Record<string, unknown>;
  templateData?: Record<string, unknown>;
  replyTo?: string;
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
}

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Quota warning email data
 */
export interface QuotaWarningEmailData {
  organizationId: number;
  organizationName?: string;
  dimension: QuotaDimension;
  dimensionLabel: string;
  percentage: number;
  current: number;
  limit: number;
  remaining: number;
  timestamp: Date;
}

/**
 * Email delivery log entry
 */
export interface EmailDeliveryLog {
  messageId: string;
  to: string[];
  subject: string;
  template?: EmailTemplate;
  templateId?: string;
  status: 'sent' | 'failed';
  error?: string;
  timestamp: Date;
}

/**
 * EmailService configuration
 */
export interface EmailServiceConfig {
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  testMode?: boolean;
}

/**
 * EmailService - Handles email notifications for the CMS via SendGrid
 *
 * Features:
 * - SendGrid API integration for transactional emails
 * - Dynamic template support for personalized content
 * - Quota warning notifications with spam prevention
 * - Email delivery logging and tracking
 * - Graceful error handling with retries
 * - Test mode for development environments
 *
 * Events emitted:
 * - email:sent - When an email is successfully sent
 * - email:failed - When an email fails to send
 * - email:quota_warning_sent - When a quota warning is processed
 *
 * Events listened:
 * - quota:warning - Triggered when quota reaches threshold (80%, 90%, 95%)
 *
 * Environment variables:
 * - SENDGRID_API_KEY - SendGrid API key (required for production)
 * - SENDGRID_FROM_EMAIL - Default sender email
 * - SENDGRID_FROM_NAME - Default sender name
 *
 * @example
 * ```typescript
 * import { emailService } from './services/EmailService';
 *
 * // Initialize the service
 * emailService.initialize();
 *
 * // Send a simple email
 * await emailService.sendEmail({
 *   to: [{ email: 'user@example.com', name: 'John' }],
 *   subject: 'Welcome!',
 *   html: '<h1>Welcome to DProgres CMS</h1>',
 * });
 *
 * // Send with dynamic template
 * await emailService.sendEmail({
 *   to: [{ email: 'user@example.com' }],
 *   subject: 'Your Report',
 *   templateId: 'd-xxxxx',
 *   dynamicData: { firstName: 'John', reportUrl: '...' },
 * });
 * ```
 */
export class EmailService extends EventEmitter {
  private initialized: boolean = false;
  private testMode: boolean = false;
  private fromEmail: string = '';
  private fromName: string = 'DProgres CMS';
  private deliveryLogs: EmailDeliveryLog[] = [];
  private readonly MAX_LOGS = 1000;

  /**
   * Human-readable labels for quota dimensions
   */
  private static readonly DIMENSION_LABELS: Record<QuotaDimension, string> = {
    sites: 'Sites',
    posts: 'Posts',
    users: 'Users',
    storage_bytes: 'Storage',
    api_calls: 'API Calls',
  };

  /**
   * Initialize the email service with SendGrid API key
   *
   * @param config - Optional configuration override
   */
  initialize(config?: EmailServiceConfig): void {
    if (this.initialized) {
      return;
    }

    const apiKey = config?.apiKey || process.env.SENDGRID_API_KEY;
    this.fromEmail = config?.fromEmail || process.env.SENDGRID_FROM_EMAIL || 'noreply@dprogres.com';
    this.fromName = config?.fromName || process.env.SENDGRID_FROM_NAME || 'DProgres CMS';
    const isProduction = process.env.NODE_ENV === 'production';
    this.testMode = config?.testMode ?? !isProduction;

    if (apiKey) {
      sgMail.setApiKey(apiKey);
      console.log('[EmailService] Initialized with SendGrid API');
    } else if (isProduction && !config?.testMode) {
      // In production, missing API key is a critical configuration error
      const errorMsg = '[EmailService] CRITICAL: SENDGRID_API_KEY is required in production. Emails will NOT be sent.';
      console.error(errorMsg);
      // Throw to prevent silent failures - application should not start without email capability
      throw new Error('SENDGRID_API_KEY environment variable is required in production');
    } else {
      // Development/test mode - stub is acceptable
      console.log('[EmailService] Initialized in stub mode (no API key configured)');
      this.testMode = true;
    }

    this.initialized = true;
  }

  /**
   * Check if the service is running in test/stub mode
   */
  isTestMode(): boolean {
    return this.testMode;
  }

  /**
   * Subscribe to quota warning events from QuotaService
   */
  subscribeToQuotaWarnings(quotaServiceEmitter: EventEmitter): void {
    quotaServiceEmitter.on('quota:warning', (event: QuotaWarningEvent) => {
      this.handleQuotaWarning(event);
    });
    console.log('[EmailService] Subscribed to quota:warning events');
  }

  /**
   * Handle quota warning event and send notification email
   */
  private async handleQuotaWarning(event: QuotaWarningEvent): Promise<void> {
    const emailData = this.buildQuotaWarningEmailData(event);

    // Log the warning
    console.log(
      `[EmailService] Quota warning: Organization ${event.organizationId} ` +
        `reached ${event.percentage}% of ${event.dimension} quota ` +
        `(${event.current}/${event.limit}, ${event.remaining} remaining)`
    );

    // Send quota warning email to organization admins
    const sent = await this.sendQuotaWarningToAdmins(emailData);

    // Only emit event if email was actually sent successfully
    // This prevents listeners from incorrectly marking warnings as delivered
    if (sent) {
      this.emit('email:quota_warning_sent', emailData);
    }
  }

  /**
   * Send quota warning email to organization administrators
   * @returns true if email was sent successfully, false otherwise
   */
  private async sendQuotaWarningToAdmins(data: QuotaWarningEmailData): Promise<boolean> {
    // Get admin emails for the organization
    const adminsResult = await organizationService.getAdminEmails(data.organizationId);

    if (!adminsResult.success || !adminsResult.data || adminsResult.data.length === 0) {
      console.warn(
        `[EmailService] No admin emails found for organization ${data.organizationId}, skipping quota warning email`
      );
      return false;
    }

    // Send email to all admins
    const result = await this.sendEmail({
      to: adminsResult.data,
      subject: this.getQuotaWarningSubject(data),
      template: this.getQuotaWarningTemplate(data.percentage),
      html: this.generateQuotaWarningHtml(data),
      text: this.generateQuotaWarningText(data),
    });

    if (result.success) {
      console.log(
        `[EmailService] Quota warning email sent to ${adminsResult.data.length} admin(s) for organization ${data.organizationId}`
      );
      return true;
    } else {
      console.error(
        `[EmailService] Failed to send quota warning email for organization ${data.organizationId}: ${result.error}`
      );
      return false;
    }
  }

  /**
   * Build email data from quota warning event
   */
  private buildQuotaWarningEmailData(event: QuotaWarningEvent): QuotaWarningEmailData {
    return {
      organizationId: event.organizationId,
      dimension: event.dimension,
      dimensionLabel: EmailService.DIMENSION_LABELS[event.dimension],
      percentage: event.percentage,
      current: event.current,
      limit: event.limit,
      remaining: event.remaining,
      timestamp: event.timestamp,
    };
  }

  /**
   * Send an email via SendGrid
   *
   * @param options - Email options including recipients, subject, and content
   * @returns Promise resolving to send result with success status and message ID
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    if (!this.initialized) {
      this.initialize();
    }

    // Validate required fields
    if (!options.to || options.to.length === 0) {
      return {
        success: false,
        error: 'Recipient email address is required',
      };
    }

    if (!options.subject || options.subject.trim().length === 0) {
      return {
        success: false,
        error: 'Email subject is required',
      };
    }

    // Must have actual content: templateId (SendGrid dynamic template), html, or text
    // Note: options.template is for internal template type tracking only, not SendGrid template IDs
    if (!options.templateId && !options.html && !options.text) {
      return {
        success: false,
        error: 'Email must have either html content, text content, or a templateId',
      };
    }

    // In test mode, log instead of sending
    if (this.testMode) {
      return this.handleTestModeEmail(options);
    }

    return this.sendViaSendGrid(options);
  }

  /**
   * Handle email in test mode (log instead of sending)
   */
  private handleTestModeEmail(options: SendEmailOptions): EmailSendResult {
    const messageId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const toAddresses = options.to.map((r) => r.email);

    console.log(`[EmailService] Test mode - would send email:`, {
      to: toAddresses.join(', '),
      subject: options.subject,
      template: options.template,
      templateId: options.templateId,
    });

    // Log delivery
    this.logDelivery({
      messageId,
      to: toAddresses,
      subject: options.subject,
      template: options.template,
      templateId: options.templateId,
      status: 'sent',
      timestamp: new Date(),
    });

    this.emit('email:sent', {
      messageId,
      to: toAddresses,
      subject: options.subject,
      testMode: true,
    });

    return {
      success: true,
      messageId,
    };
  }

  /**
   * Send email via SendGrid API
   */
  private async sendViaSendGrid(options: SendEmailOptions): Promise<EmailSendResult> {
    const toAddresses = options.to.map((r) => r.email);

    try {
      // Build base message configuration
      const baseMsg = {
        to: options.to.map((r) => ({
          email: r.email,
          name: r.name,
        })),
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        ...(options.replyTo && { replyTo: options.replyTo }),
        ...(options.cc &&
          options.cc.length > 0 && { cc: options.cc.map((r) => ({ email: r.email, name: r.name })) }),
        ...(options.bcc &&
          options.bcc.length > 0 && {
            bcc: options.bcc.map((r) => ({ email: r.email, name: r.name })),
          }),
      };

      // Build the message with required content type
      let msg: MailDataRequired;
      if (options.templateId) {
        msg = {
          ...baseMsg,
          templateId: options.templateId,
          ...(options.dynamicData && { dynamicTemplateData: options.dynamicData }),
        };
      } else if (options.html) {
        msg = {
          ...baseMsg,
          html: options.html,
          ...(options.text && { text: options.text }),
        };
      } else {
        msg = {
          ...baseMsg,
          text: options.text!,
        };
      }

      // Send via SendGrid
      const [response] = await sgMail.send(msg);
      const messageId = response.headers['x-message-id'] || `sg-${Date.now()}`;

      // Log successful delivery
      this.logDelivery({
        messageId,
        to: toAddresses,
        subject: options.subject,
        template: options.template,
        templateId: options.templateId,
        status: 'sent',
        timestamp: new Date(),
      });

      this.emit('email:sent', {
        messageId,
        to: toAddresses,
        subject: options.subject,
        statusCode: response.statusCode,
      });

      console.log(
        `[EmailService] Email sent successfully: ${messageId} to ${toAddresses.join(', ')}`
      );

      return {
        success: true,
        messageId,
        statusCode: response.statusCode,
      };
    } catch (error: any) {
      const errorMessage = this.extractSendGridError(error);

      // Log failed delivery
      this.logDelivery({
        messageId: `failed-${Date.now()}`,
        to: toAddresses,
        subject: options.subject,
        template: options.template,
        templateId: options.templateId,
        status: 'failed',
        error: errorMessage,
        timestamp: new Date(),
      });

      this.emit('email:failed', {
        to: toAddresses,
        subject: options.subject,
        error: errorMessage,
      });

      console.error(`[EmailService] Failed to send email to ${toAddresses.join(', ')}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        statusCode: error.code,
      };
    }
  }

  /**
   * Extract user-friendly error message from SendGrid error
   */
  private extractSendGridError(error: any): string {
    if (error.response?.body?.errors) {
      const errors = error.response.body.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return errors.map((e: any) => e.message).join('; ');
      }
    }
    return error.message || 'Failed to send email';
  }

  /**
   * Log email delivery for tracking
   */
  private logDelivery(log: EmailDeliveryLog): void {
    this.deliveryLogs.push(log);

    // Keep only the most recent logs
    if (this.deliveryLogs.length > this.MAX_LOGS) {
      this.deliveryLogs = this.deliveryLogs.slice(-this.MAX_LOGS);
    }
  }

  /**
   * Get recent delivery logs
   */
  getDeliveryLogs(limit: number = 100): EmailDeliveryLog[] {
    return this.deliveryLogs.slice(-limit);
  }

  /**
   * Clear delivery logs (useful for testing)
   */
  clearDeliveryLogs(): void {
    this.deliveryLogs = [];
  }

  /**
   * Get email subject for quota warning
   */
  getQuotaWarningSubject(data: QuotaWarningEmailData): string {
    return `[DProgres CMS] ${data.dimensionLabel} quota at ${data.percentage}%`;
  }

  /**
   * Get email template for quota warning percentage
   */
  getQuotaWarningTemplate(percentage: number): QuotaEmailTemplate {
    if (percentage >= 95) return 'quota_warning_95';
    if (percentage >= 90) return 'quota_warning_90';
    return 'quota_warning_80';
  }

  /**
   * Generate HTML content for quota warning email
   */
  generateQuotaWarningHtml(data: QuotaWarningEmailData): string {
    const urgencyClass =
      data.percentage >= 95 ? 'critical' : data.percentage >= 90 ? 'warning' : 'info';
    const urgencyColor =
      data.percentage >= 95 ? '#dc2626' : data.percentage >= 90 ? '#f59e0b' : '#2563eb';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quota Warning</title>
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
      border-bottom: 3px solid ${urgencyColor};
      padding-bottom: 20px;
    }
    .header h1 {
      color: ${urgencyColor};
      margin: 0;
      font-size: 24px;
    }
    .percentage-badge {
      display: inline-block;
      background-color: ${urgencyColor};
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
      background-color: #2563eb;
      color: #ffffff;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.percentage >= 95 ? '🚨 Critical' : data.percentage >= 90 ? '⚠️ Warning' : 'ℹ️ Notice'}: ${data.dimensionLabel} Quota Alert</h1>
      <div class="percentage-badge">${data.percentage}% Used</div>
    </div>

    <div class="content">
      <p>Your <strong>${data.dimensionLabel.toLowerCase()}</strong> quota is at <strong>${data.percentage}%</strong> capacity.</p>

      <div class="stats-box">
        <div class="stat-row">
          <span class="stat-label">Resource Type</span>
          <span class="stat-value">${data.dimensionLabel}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Current Usage</span>
          <span class="stat-value">${data.current.toLocaleString()}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Quota Limit</span>
          <span class="stat-value">${data.limit.toLocaleString()}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Remaining</span>
          <span class="stat-value">${data.remaining.toLocaleString()}</span>
        </div>
      </div>

      ${
        data.percentage >= 90
          ? `
      <p><strong>Action Required:</strong> Please consider upgrading your plan or reducing usage to avoid service interruptions.</p>
      <p style="text-align: center;">
        <a href="#" class="cta-button">Upgrade Plan</a>
      </p>
      `
          : `
      <p>This is a friendly reminder to help you manage your resources proactively. No immediate action is required, but you may want to review your usage.</p>
      `
      }
    </div>

    <div class="footer">
      <p>This is an automated notification from DProgres CMS.</p>
      <p>&copy; ${new Date().getFullYear()} DProgres CMS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate plain text content for quota warning email
   */
  generateQuotaWarningText(data: QuotaWarningEmailData): string {
    return `
${data.percentage >= 95 ? 'CRITICAL' : data.percentage >= 90 ? 'WARNING' : 'NOTICE'}: ${data.dimensionLabel} Quota Alert

Your ${data.dimensionLabel.toLowerCase()} quota is at ${data.percentage}% capacity.

Resource Type: ${data.dimensionLabel}
Current Usage: ${data.current.toLocaleString()}
Quota Limit: ${data.limit.toLocaleString()}
Remaining: ${data.remaining.toLocaleString()}

${
  data.percentage >= 90
    ? 'Action Required: Please consider upgrading your plan or reducing usage to avoid service interruptions.'
    : 'This is a friendly reminder to help you manage your resources proactively.'
}

---
This is an automated notification from DProgres CMS.
    `.trim();
  }

  /**
   * Get dimension label for a quota dimension
   */
  getDimensionLabel(dimension: QuotaDimension): string {
    return EmailService.DIMENSION_LABELS[dimension];
  }
}

// Export singleton instance
export const emailService = new EmailService();
