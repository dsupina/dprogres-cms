import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

/**
 * Email service configuration
 */
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const SENDER_EMAIL = process.env.AWS_SES_SENDER_EMAIL || 'noreply@dprogres.com';
const SENDER_NAME = process.env.AWS_SES_SENDER_NAME || 'DProgres CMS';

/**
 * Email parameters for sending
 */
export interface EmailParams {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

/**
 * Send email via AWS SES
 *
 * @param params - Email parameters (to, subject, text, html)
 * @returns Promise resolving to success status and message ID
 */
export async function sendEmail(params: EmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Validate inputs
    if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
      return { success: false, error: 'Recipient email address is required' };
    }

    if (!params.subject || params.subject.trim().length === 0) {
      return { success: false, error: 'Email subject is required' };
    }

    if (!params.text && !params.html) {
      return { success: false, error: 'Email must have either text or HTML content' };
    }

    // Convert single recipient to array
    const recipients = Array.isArray(params.to) ? params.to : [params.to];

    // Prepare email command
    const command = new SendEmailCommand({
      Source: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: {
          Data: params.subject,
          Charset: 'UTF-8',
        },
        Body: {
          ...(params.text && {
            Text: {
              Data: params.text,
              Charset: 'UTF-8',
            },
          }),
          ...(params.html && {
            Html: {
              Data: params.html,
              Charset: 'UTF-8',
            },
          }),
        },
      },
      ...(params.replyTo && {
        ReplyToAddresses: [params.replyTo],
      }),
    });

    // Send email
    const response = await sesClient.send(command);

    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (error: any) {
    console.error('Error sending email via AWS SES:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

/**
 * Generate HTML template for organization invite email
 *
 * @param params - Invite details (organizationName, inviterName, inviteUrl, role, customMessage)
 * @returns HTML string for email body
 */
export function generateInviteEmailHTML(params: {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  role: string;
  customMessage?: string;
}): string {
  const { organizationName, inviterName, inviteUrl, role, customMessage } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Organization Invitation</title>
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
    }
    .header h1 {
      color: #2563eb;
      margin: 0;
      font-size: 24px;
    }
    .content {
      margin-bottom: 30px;
    }
    .content p {
      margin: 15px 0;
    }
    .custom-message {
      background-color: #f0f9ff;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
      font-style: italic;
    }
    .role-badge {
      display: inline-block;
      background-color: #dbeafe;
      color: #1e40af;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
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
      text-align: center;
    }
    .cta-button:hover {
      background-color: #1d4ed8;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }
    .expiry-notice {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin: 20px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 You've Been Invited!</h1>
    </div>

    <div class="content">
      <p>Hi there,</p>

      <p>
        <strong>${inviterName}</strong> has invited you to join the
        <strong>${organizationName}</strong> organization on DProgres CMS
        as a <span class="role-badge">${role.toUpperCase()}</span>.
      </p>

      ${customMessage ? `
      <div class="custom-message">
        <strong>Message from ${inviterName}:</strong><br>
        ${customMessage}
      </div>
      ` : ''}

      <p style="text-align: center;">
        <a href="${inviteUrl}" class="cta-button">Accept Invitation</a>
      </p>

      <div class="expiry-notice">
        <strong>⏰ Important:</strong> This invitation expires in 7 days.
        Make sure to accept it before then!
      </div>

      <p style="font-size: 14px; color: #6b7280;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${inviteUrl}" style="color: #2563eb; word-break: break-all;">${inviteUrl}</a>
      </p>
    </div>

    <div class="footer">
      <p>
        This invitation was sent by ${inviterName} via DProgres CMS.<br>
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
      <p style="margin-top: 10px;">
        © ${new Date().getFullYear()} DProgres CMS. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version of invite email
 */
export function generateInviteEmailText(params: {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  role: string;
  customMessage?: string;
}): string {
  const { organizationName, inviterName, inviteUrl, role, customMessage } = params;

  return `
You've Been Invited to ${organizationName}!

Hi there,

${inviterName} has invited you to join the ${organizationName} organization on DProgres CMS as a ${role.toUpperCase()}.

${customMessage ? `Message from ${inviterName}:\n${customMessage}\n\n` : ''}

To accept this invitation, click the link below or copy and paste it into your browser:
${inviteUrl}

IMPORTANT: This invitation expires in 7 days. Make sure to accept it before then!

---
This invitation was sent by ${inviterName} via DProgres CMS.
If you weren't expecting this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} DProgres CMS. All rights reserved.
  `.trim();
}
