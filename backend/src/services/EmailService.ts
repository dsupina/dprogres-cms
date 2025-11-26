import { EventEmitter } from 'events';
import type { QuotaWarningEvent, QuotaDimension } from './QuotaService';

/**
 * Email template types for quota warnings
 */
export type QuotaEmailTemplate = 'quota_warning_80' | 'quota_warning_90' | 'quota_warning_95';

/**
 * Email recipient configuration
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Email send options
 */
export interface SendEmailOptions {
  to: EmailRecipient[];
  subject: string;
  template: QuotaEmailTemplate;
  templateData: Record<string, unknown>;
}

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
 * EmailService - Handles email notifications for the CMS
 *
 * Features:
 * - Listens to quota warning events and sends notifications
 * - Template-based email rendering
 * - Configurable recipients per organization
 *
 * Events listened:
 * - quota:warning - Triggered when quota reaches threshold (80%, 90%, 95%)
 *
 * Note: This is a stub implementation. In production, integrate with
 * a real email provider (SendGrid, AWS SES, Mailgun, etc.)
 */
export class EmailService extends EventEmitter {
  private initialized: boolean = false;

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
   * Initialize the email service and set up event listeners
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    console.log('[EmailService] Initialized');
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

    // Log the warning (stub for actual email sending)
    console.log(
      `[EmailService] Quota warning: Organization ${event.organizationId} ` +
        `reached ${event.percentage}% of ${event.dimension} quota ` +
        `(${event.current}/${event.limit}, ${event.remaining} remaining)`
    );

    // Emit event for tracking/testing
    this.emit('email:quota_warning_sent', emailData);

    // In production, this would:
    // 1. Look up organization admin emails
    // 2. Render email template
    // 3. Send via email provider
    // await this.sendQuotaWarningEmail(emailData);
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
   * Send quota warning email (stub implementation)
   * In production, integrate with email provider
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    // Stub implementation - log instead of sending
    console.log(`[EmailService] Would send email:`, {
      to: options.to.map((r) => r.email).join(', '),
      subject: options.subject,
      template: options.template,
    });

    return {
      success: true,
      messageId: `stub-${Date.now()}`,
    };
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
}

// Export singleton instance
export const emailService = new EmailService();
