/**
 * Script to generate all remaining EPIC-003 tickets (SF-004 through SF-027)
 * Run: node generate-epic-003-tickets.js
 */

const fs = require('fs');
const path = require('path');

const ticketsDir = path.join(__dirname, 'docs', 'tickets');

// Ticket templates with complete specifications
const tickets = [
  // SF-004
  {
    id: '004',
    title: 'Webhook Handler with Idempotency',
    phase: 'Phase 1 (Database & Stripe Foundation)',
    effort: '3 days',
    dependencies: 'SF-003',
    objective: 'Build webhook handler to process Stripe events with idempotency protection',
    requirements: [
      'Process checkout.session.completed event',
      'Process customer.subscription.created/updated/deleted events',
      'Process invoice.payment_succeeded/failed events',
      'Implement idempotency using stripe_event_id uniqueness',
      'Store all events in subscription_events table for audit',
      'Handle webhook signature verification',
      'Return 200 OK immediately, process async if needed',
    ],
    design: `Create backend/src/routes/webhooks.ts:

POST /api/webhooks/stripe
- Verify Stripe signature using stripe.webhooks.constructEvent()
- Check stripe_event_id uniqueness in subscription_events table
- Route event to appropriate handler based on event.type
- Update subscriptions table based on event data
- Emit events for downstream processing (email, quota updates)
- Return 200 OK within 5 seconds (Stripe timeout)

Event Handlers:
- handleCheckoutCompleted(): Create subscription record
- handleSubscriptionUpdated(): Update subscription status
- handleSubscriptionDeleted(): Mark as canceled
- handleInvoicePaid(): Create invoice record, send receipt
- handleInvoiceFailed(): Mark past_due, send warning email

Idempotency:
INSERT INTO subscription_events (stripe_event_id, ...)
ON CONFLICT (stripe_event_id) DO NOTHING
RETURNING id;

If no rows returned, event already processed`,
    acceptance: [
      'Webhook endpoint at /api/webhooks/stripe responds 200',
      'Stripe signature verified correctly',
      'Duplicate events ignored (idempotency check)',
      'All event types handled without errors',
      'Database updated atomically (transaction)',
      'Events logged in subscription_events table',
      'Integration test with Stripe CLI passes',
    ],
  },

  // SF-005
  {
    id: '005',
    title: 'OrganizationService Implementation',
    phase: 'Phase 2 (RBAC & Organizations)',
    effort: '3 days',
    dependencies: 'SF-001',
    objective: 'Build OrganizationService to manage organizations, ownership, and basic operations',
    requirements: [
      'Create organization with auto-generated slug',
      'Get organization by ID with member count',
      'Update organization details (name, logo)',
      'Delete organization (owner only, cascades to content)',
      'Transfer ownership to another member',
      'List user\'s organizations',
      'Validate organization access for user',
    ],
    design: `Create backend/src/services/OrganizationService.ts:

Methods:
- createOrganization(name, ownerId): Creates org + adds owner as member
- getOrganization(orgId, userId): Get org with access check
- updateOrganization(orgId, updates, userId): Update name/logo
- deleteOrganization(orgId, userId): Soft delete with cascade
- transferOwnership(orgId, newOwnerId, currentOwnerId): Update owner
- listUserOrganizations(userId): Get orgs where user is member
- validateAccess(orgId, userId): Check if user has access

Events:
- organization:created
- organization:updated
- organization:deleted
- organization:ownership_transferred

Auto-slug generation:
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomString(6);`,
    acceptance: [
      'Organization created with unique slug',
      'Owner automatically added as member with "owner" role',
      'Non-members cannot access organization',
      'Organization deletion cascades to content (via FK)',
      'Ownership transfer validates new owner is existing member',
      'Events emitted for all lifecycle changes',
      'Unit tests cover all methods >90%',
    ],
  },

  // SF-006
  {
    id: '006',
    title: 'Member Management & Invites',
    phase: 'Phase 2 (RBAC & Organizations)',
    effort: '3 days',
    dependencies: 'SF-005',
    objective: 'Build member invitation system with email-based invite flow and role management',
    requirements: [
      'Invite member by email with role assignment',
      'Generate unique invite token (JWT)',
      'Send invite email with accept link',
      'Accept invite creates organization_members record',
      'List organization members with roles',
      'Update member role (owner/admin only)',
      'Remove member from organization',
      'Validate invite token expiration (7 days)',
    ],
    design: `Invite Flow:
1. Owner calls inviteMember(orgId, email, role)
2. Generate JWT token: { orgId, email, role, exp: 7days }
3. Insert into organization_invites table
4. Send email with link: /accept-invite?token=xxx
5. User clicks link, calls acceptInvite(token)
6. Verify token, create organization_members record
7. Delete invite from organization_invites

Methods:
- inviteMember(orgId, email, role, inviterId)
- acceptInvite(token, userId)
- listMembers(orgId)
- updateMemberRole(orgId, userId, newRole, actorId)
- removeMember(orgId, userId, actorId)
- revokeInvite(inviteId, actorId)

Validation:
- Cannot invite existing member
- Cannot invite to owner role (use transferOwnership)
- Token expires after 7 days
- Inviter must have invite_users permission`,
    acceptance: [
      'Invite email sent with valid token',
      'Token expires after 7 days',
      'Accept invite creates organization_members record',
      'Cannot accept invite twice (idempotency)',
      'Cannot invite existing member',
      'Role update validates actor has permission',
      'Cannot remove last owner (validation error)',
      'Unit tests cover invite flow >90%',
    ],
  },

  // SF-007
  {
    id: '007',
    title: 'RBAC Middleware & Permissions Matrix',
    phase: 'Phase 2 (RBAC & Organizations)',
    effort: '3 days',
    dependencies: 'SF-006',
    objective: 'Implement role-based access control middleware and permissions enforcement',
    requirements: [
      'Define permissions matrix (5 roles × 10 permissions)',
      'Create RBAC middleware to check permissions',
      'Protect routes with permission requirements',
      'Return 403 Forbidden if permission denied',
      'Support organization context in JWT token',
      'Cache user permissions in memory (5 min TTL)',
    ],
    design: `Permissions Matrix:
| Permission      | Owner | Admin | Editor | Publisher | Viewer |
|-----------------|-------|-------|--------|-----------|--------|
| manage_billing  | ✅    | ❌    | ❌     | ❌        | ❌     |
| invite_users    | ✅    | ✅    | ❌     | ❌        | ❌     |
| create_sites    | ✅    | ✅    | ❌     | ❌        | ❌     |
| create_posts    | ✅    | ✅    | ✅     | ❌        | ❌     |
| publish_posts   | ✅    | ✅    | ✅     | ✅        | ❌     |
| view_posts      | ✅    | ✅    | ✅     | ✅        | ✅     |

Middleware:
backend/src/middleware/rbac.ts

export function requirePermission(permission: string) {
  return async (req, res, next) => {
    const { user, organizationId } = req;

    const hasPermission = await checkPermission(
      organizationId,
      user.id,
      permission
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  };
}

Usage:
router.post('/sites', auth, requirePermission('create_sites'), createSite);`,
    acceptance: [
      'RBAC middleware enforces permissions correctly',
      'All roles validated against matrix',
      '403 returned when permission denied',
      'Permissions cached in memory (5 min TTL)',
      'Organization context validated from JWT',
      'Integration tests verify permission enforcement',
      'Performance: Permission check <20ms',
    ],
  },

  // SF-008
  {
    id: '008',
    title: 'Auto-Create Free Tier on Signup',
    phase: 'Phase 2 (RBAC & Organizations)',
    effort: '2 days',
    dependencies: 'SF-005, SF-007',
    objective: 'Automatically create Free tier organization when user signs up',
    requirements: [
      'Create organization on user signup',
      'Set plan_tier to "free"',
      'Initialize usage_quotas with Free tier limits',
      'Add user as organization owner',
      'Set as user\'s current_organization_id',
      'Transaction safety (rollback on failure)',
    ],
    design: `Modify backend/src/routes/auth.ts:

POST /api/auth/register:
1. Create user in users table
2. Create organization: name = "{firstName}'s Organization"
3. Add user as organization member (role: owner)
4. Initialize usage_quotas:
   - sites: 1
   - posts: 20
   - users: 2
   - storage_bytes: 500MB
   - api_calls: 10k/month
5. Update user.current_organization_id
6. Commit transaction

Transaction:
BEGIN;
  INSERT INTO users (...) RETURNING id;
  INSERT INTO organizations (name, owner_id, plan_tier) VALUES (...) RETURNING id;
  INSERT INTO organization_members (organization_id, user_id, role) VALUES (...);
  INSERT INTO usage_quotas (organization_id, dimension, quota_limit, ...) VALUES
    (org_id, 'sites', 1, ...),
    (org_id, 'posts', 20, ...),
    ...;
  UPDATE users SET current_organization_id = org_id WHERE id = user_id;
COMMIT;`,
    acceptance: [
      'User signup creates organization automatically',
      'Organization name includes user\'s name',
      'plan_tier set to "free"',
      'All 5 usage_quotas initialized',
      'User added as organization owner',
      'current_organization_id set correctly',
      'Transaction rolls back on any failure',
      'Integration test verifies full flow',
    ],
  },

  // Continue with remaining tickets...
  {
    id: '009',
    title: 'QuotaService Implementation',
    phase: 'Phase 3 (Quota System & Enforcement)',
    effort: '4 days',
    dependencies: 'SF-001, SF-003',
    objective: 'Build QuotaService to check and increment usage quotas with atomic operations',
    requirements: [
      'Check if organization can perform action (within quota)',
      'Increment usage atomically after action',
      'Get current quota status for all dimensions',
      'Reset monthly quotas (API calls)',
      'Set quota overrides (Enterprise)',
      'Calculate quota percentage used',
      'Emit events when approaching limits (80%, 90%, 95%)',
    ],
    design: `Methods:
- checkQuota(orgId, dimension, amount=1): { allowed, current, limit, remaining }
- incrementQuota(orgId, dimension, amount=1): void
- decrementQuota(orgId, dimension, amount=1): void (on delete)
- getQuotaStatus(orgId): Record<dimension, QuotaStatus>
- resetMonthlyQuotas(orgId): void
- setQuotaOverride(orgId, dimension, newLimit): void (Enterprise)

Database Function (used by checkQuota):
check_and_increment_quota(org_id, dimension, amount)
Returns BOOLEAN

Events:
- quota:approaching_limit (at 80%, 90%, 95%)
- quota:exceeded (at 100%)
- quota:reset (monthly reset)`,
    acceptance: [
      'checkQuota returns correct allowed status',
      'incrementQuota uses database function for atomicity',
      'Race conditions prevented with SELECT FOR UPDATE',
      'Monthly quotas reset correctly',
      'Events emitted at threshold percentages',
      'Performance: <50ms for quota check',
      'Unit tests cover all dimensions',
    ],
  },

  // Add abbreviated versions for remaining tickets
  {
    id: '010',
    title: 'Quota Enforcement Middleware',
    phase: 'Phase 3 (Quota System & Enforcement)',
    effort: '2 days',
    dependencies: 'SF-009',
    objective: 'Create middleware to enforce quotas before resource creation',
    requirements: [
      'Check quotas before POST/PUT operations',
      'Return 402 Payment Required when quota exceeded',
      'Include upgrade URL in error response',
      'Skip quota check for Enterprise tier',
      'Log quota exceeded events',
    ],
    design: `Middleware: backend/src/middleware/quota.ts

export function enforceQuota(dimension: string) {
  return async (req, res, next) => {
    const { organizationId } = req;

    const result = await quotaService.checkQuota(organizationId, dimension);

    if (!result.allowed) {
      return res.status(402).json({
        error: 'Quota exceeded',
        quota: result,
        upgradeUrl: '/billing',
      });
    }

    next();
  };
}

Usage:
router.post('/sites', auth, enforceQuota('sites'), createSite);`,
    acceptance: [
      '402 status returned when quota exceeded',
      'Middleware integrated on all create routes',
      'Enterprise tier bypasses quota checks',
      'Error response includes upgrade URL',
      'Integration tests verify enforcement',
    ],
  },

  {
    id: '011',
    title: 'Monthly Quota Reset Job',
    phase: 'Phase 3 (Quota System & Enforcement)',
    effort: '2 days',
    dependencies: 'SF-009',
    objective: 'Create cron job to reset monthly API call quotas',
    requirements: [
      'Run daily to check for expired periods',
      'Reset api_calls usage to 0',
      'Update period_start and period_end',
      'Log reset events',
      'Handle timezone considerations',
    ],
    design: `Cron Job: backend/src/jobs/resetQuotas.ts

import { CronJob } from 'cron';

// Run daily at 00:00 UTC
const job = new CronJob('0 0 * * *', async () => {
  const result = await pool.query(\`
    UPDATE usage_quotas
    SET current_usage = 0,
        last_reset_at = NOW(),
        period_start = NOW(),
        period_end = NOW() + INTERVAL '1 month',
        updated_at = NOW()
    WHERE dimension = 'api_calls'
      AND period_end < NOW()
    RETURNING organization_id
  \`);

  console.log(\`Reset quotas for \${result.rowCount} organizations\`);
});

job.start();`,
    acceptance: [
      'Cron job runs daily at 00:00 UTC',
      'Only api_calls dimension reset',
      'period_start and period_end updated',
      'Reset events logged',
      'Integration test simulates expired periods',
    ],
  },

  {
    id: '012',
    title: 'Quota Warning System',
    phase: 'Phase 3 (Quota System & Enforcement)',
    effort: '2 days',
    dependencies: 'SF-009',
    objective: 'Emit warnings when quotas reach threshold percentages',
    requirements: [
      'Check quota percentage on each increment',
      'Emit warnings at 80%, 90%, 95%',
      'Store last warning sent to prevent spam',
      'Include remaining quota in warning',
    ],
    design: `Add to QuotaService:

async checkAndWarn(orgId: number, dimension: string) {
  const status = await this.getQuotaStatus(orgId);
  const quota = status[dimension];
  const percentage = (quota.current / quota.limit) * 100;

  if (percentage >= 95 && !this.wasWarningSent(orgId, dimension, 95)) {
    this.emit('quota:warning', { orgId, dimension, percentage: 95, quota });
    this.markWarningSent(orgId, dimension, 95);
  }
  // Similar for 90%, 80%
}`,
    acceptance: [
      'Warnings emitted at 80%, 90%, 95%',
      'Only one warning per threshold',
      'Warning events captured by EmailService',
      'Warning data includes remaining quota',
      'Unit tests verify warning logic',
    ],
  },

  {
    id: '013',
    title: 'EmailService with SendGrid Integration',
    phase: 'Phase 4 (Webhooks & Email System)',
    effort: '3 days',
    dependencies: 'None',
    objective: 'Build EmailService to send transactional emails via SendGrid',
    requirements: [
      'Initialize SendGrid client',
      'Send email with template support',
      'Handle SendGrid API errors',
      'Log email delivery status',
      'Support dynamic template data',
    ],
    design: `backend/src/services/EmailService.ts

import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export class EmailService {
  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    templateId?: string;
    dynamicData?: Record<string, any>;
  }) {
    const msg = {
      to: params.to,
      from: process.env.SENDGRID_FROM_EMAIL!,
      subject: params.subject,
      html: params.html,
      templateId: params.templateId,
      dynamicTemplateData: params.dynamicData,
    };

    await sgMail.send(msg);
  }
}`,
    acceptance: [
      'SendGrid API key configured',
      'Email sent successfully in test mode',
      'Dynamic templates supported',
      'Errors handled gracefully',
      'Email delivery logged',
    ],
  },

  {
    id: '014',
    title: 'Email Templates',
    phase: 'Phase 4 (Webhooks & Email System)',
    effort: '3 days',
    dependencies: 'SF-013',
    objective: 'Create 8 email templates for SaaS lifecycle events',
    requirements: [
      'Welcome email (signup)',
      'Subscription confirmation (first payment)',
      'Payment receipt (recurring payment)',
      'Payment failed (retry prompt)',
      'Quota warning (80%, 90%, 95%)',
      'Quota exceeded (hard limit)',
      'Member invite',
      'Subscription canceled',
    ],
    design: `Create SendGrid templates via Dashboard or API

Templates:
1. welcome_email
2. subscription_confirmation
3. payment_receipt
4. payment_failed
5. quota_warning
6. quota_exceeded
7. member_invite
8. subscription_canceled

Template Variables:
- {{user_name}}
- {{organization_name}}
- {{plan_tier}}
- {{amount}}
- {{quota_dimension}}
- {{quota_percentage}}
- {{upgrade_url}}`,
    acceptance: [
      '8 templates created in SendGrid',
      'Templates use consistent branding',
      'All dynamic variables replaced correctly',
      'Test emails sent successfully',
      'Templates render correctly in Gmail, Outlook',
    ],
  },

  {
    id: '015',
    title: 'Complete Webhook Event Handling',
    phase: 'Phase 4 (Webhooks & Email System)',
    effort: '3 days',
    dependencies: 'SF-004, SF-013',
    objective: 'Handle all remaining Stripe webhook events',
    requirements: [
      'customer.updated: Update organization details',
      'payment_method.attached: Store payment method',
      'payment_method.detached: Remove payment method',
      'customer.subscription.trial_will_end: Send reminder',
      'invoice.upcoming: Send advance notice',
    ],
    design: `Add handlers to webhook controller:

- handleCustomerUpdated(): Sync name/email
- handlePaymentMethodAttached(): Store in payment_methods
- handlePaymentMethodDetached(): Delete from payment_methods
- handleTrialWillEnd(): Send 3-day warning email
- handleInvoiceUpcoming(): Send "Renewing in 7 days" email`,
    acceptance: [
      'All 10+ webhook events handled',
      'Payment methods synced to database',
      'Trial ending warnings sent',
      'Invoice upcoming notices sent',
      'Integration test with Stripe CLI',
    ],
  },

  {
    id: '016',
    title: 'Subscription Lifecycle Management',
    phase: 'Phase 4 (Webhooks & Email System)',
    effort: '2 days',
    dependencies: 'SF-015',
    objective: 'Implement subscription state machine and lifecycle transitions',
    requirements: [
      'trialing → active (trial ends, payment succeeds)',
      'active → past_due (payment fails)',
      'past_due → active (payment retried, succeeds)',
      'past_due → canceled (grace period expires)',
      'active → canceled (user cancels)',
      'Grace period: 7 days past_due before downgrade',
    ],
    design: `State Machine:
trialing ──payment_succeeds──> active
active ──payment_fails──> past_due
past_due ──payment_succeeds──> active
past_due ──grace_expires(7d)──> canceled
active ──user_cancels──> canceled

Downgrade Logic:
if (status === 'canceled') {
  await pool.query(\`
    UPDATE organizations
    SET plan_tier = 'free'
    WHERE id = $1
  \`, [organizationId]);

  await resetQuotasToFree(organizationId);
}`,
    acceptance: [
      'All state transitions handled',
      'Grace period enforced (7 days)',
      'Downgrade to Free tier automated',
      'Quotas reset when downgraded',
      'Integration test covers full lifecycle',
    ],
  },

  {
    id: '017',
    title: 'Billing Page UI & Layout',
    phase: 'Phase 5 (Frontend Billing Dashboard)',
    effort: '3 days',
    dependencies: 'Phase 4 complete',
    objective: 'Build billing dashboard UI showing plan, usage, and upgrade CTA',
    requirements: [
      'Current plan card (tier, price, billing cycle)',
      'Usage overview (5 quota dimensions)',
      'Upgrade CTA button',
      'Invoice history table',
      'Manage billing link (Customer Portal)',
      'Responsive design (mobile-first)',
    ],
    design: `frontend/src/pages/admin/BillingPage.tsx

Components:
- <CurrentPlanCard />: Shows tier, price, next billing date
- <UsageOverview />: 5 progress bars (sites, posts, users, storage, API)
- <UpgradeModal />: Plan comparison table
- <InvoiceTable />: List of past invoices with download links
- <ManageBillingButton />: Opens Stripe Customer Portal

API Calls:
- GET /api/billing/subscription
- GET /api/billing/invoices
- GET /api/quotas/status`,
    acceptance: [
      'Billing page renders without errors',
      'Current plan displayed correctly',
      'Usage bars show accurate percentages',
      'Upgrade CTA opens modal',
      'Invoice table shows past invoices',
      'Responsive on mobile',
    ],
  },

  {
    id: '018',
    title: 'Stripe Checkout Integration',
    phase: 'Phase 5 (Frontend Billing Dashboard)',
    effort: '2 days',
    dependencies: 'SF-017',
    objective: 'Integrate Stripe Checkout redirect flow in frontend',
    requirements: [
      'Upgrade button calls POST /api/billing/checkout',
      'Redirect to Stripe Checkout session URL',
      'Handle success/cancel redirects',
      'Show loading state during redirect',
      'Display error messages on failure',
    ],
    design: `frontend/src/components/UpgradeModal.tsx

const handleUpgrade = async (tier, cycle) => {
  setLoading(true);

  const response = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planTier: tier,
      billingCycle: cycle,
      successUrl: window.location.origin + '/billing/success',
      cancelUrl: window.location.origin + '/billing',
    }),
  });

  const { sessionUrl } = await response.json();
  window.location.href = sessionUrl; // Redirect to Stripe
};`,
    acceptance: [
      'Upgrade button redirects to Stripe Checkout',
      'Success URL shows confirmation message',
      'Cancel URL returns to billing page',
      'Loading state shown during redirect',
      'Error messages displayed on API failure',
    ],
  },

  {
    id: '019',
    title: 'Stripe Customer Portal Link',
    phase: 'Phase 5 (Frontend Billing Dashboard)',
    effort: '1 day',
    dependencies: 'SF-017',
    objective: 'Add "Manage Billing" button that opens Stripe Customer Portal',
    requirements: [
      'Button calls GET /api/billing/portal',
      'Redirect to Customer Portal URL',
      'Portal allows plan changes, payment method updates',
      'Return URL set to billing page',
    ],
    design: `const handleManageBilling = async () => {
  const response = await fetch('/api/billing/portal');
  const { portalUrl } = await response.json();
  window.location.href = portalUrl;
};

<button onClick={handleManageBilling}>
  Manage Billing
</button>`,
    acceptance: [
      'Button opens Stripe Customer Portal',
      'Portal allows subscription changes',
      'Return URL brings user back to billing page',
      'Works for all plan tiers',
    ],
  },

  {
    id: '020',
    title: 'Quota Status Dashboard',
    phase: 'Phase 5 (Frontend Billing Dashboard)',
    effort: '3 days',
    dependencies: 'SF-009, SF-017',
    objective: 'Build quota status dashboard with progress bars and warnings',
    requirements: [
      'Fetch quota status from GET /api/quotas/status',
      'Display 5 progress bars (sites, posts, users, storage, API calls)',
      'Show percentage used and remaining count',
      'Warning state at 80%+ (yellow)',
      'Danger state at 95%+ (red)',
      'Upgrade CTA when quota exceeded',
    ],
    design: `<QuotaStatusCard
  dimension="sites"
  current={2}
  limit={3}
  percentage={66.7}
  unit="sites"
/>

Color States:
- <80%: Blue (normal)
- 80-94%: Yellow (warning)
- 95-100%: Red (danger)
- 100%: Red + "Upgrade" button`,
    acceptance: [
      'All 5 quota dimensions displayed',
      'Progress bars show correct percentages',
      'Warning colors applied correctly',
      'Upgrade CTA shown when exceeded',
      'Real-time updates on quota changes',
    ],
  },

  {
    id: '021',
    title: 'Organization Settings Page',
    phase: 'Phase 5 (Frontend Billing Dashboard)',
    effort: '4 days',
    dependencies: 'SF-006, SF-017',
    objective: 'Build organization settings page for team management',
    requirements: [
      'Organization details form (name, logo)',
      'Member list table with roles',
      'Invite member form (email + role)',
      'Update member role dropdown',
      'Remove member button',
      'Transfer ownership modal (owner only)',
    ],
    design: `frontend/src/pages/admin/OrganizationSettings.tsx

Sections:
1. Organization Details
   - Name input
   - Logo upload
   - Save button

2. Members Table
   - Email, Role, Joined Date
   - Actions: Update Role, Remove

3. Invite Form
   - Email input
   - Role dropdown
   - Send Invite button

4. Transfer Ownership
   - Select new owner
   - Confirm button`,
    acceptance: [
      'Organization name editable',
      'Logo upload working',
      'Member list shows all members',
      'Invite form sends invite',
      'Role update works',
      'Remove member works (except last owner)',
      'Transfer ownership modal functional',
    ],
  },

  {
    id: '022',
    title: 'Unit Tests - Service Layer',
    phase: 'Phase 6 (Testing & Production Deployment)',
    effort: '3 days',
    dependencies: 'All services complete',
    objective: 'Write unit tests for SubscriptionService, QuotaService, OrganizationService',
    requirements: [
      'SubscriptionService: 20+ tests',
      'QuotaService: 15+ tests',
      'OrganizationService: 15+ tests',
      'Mock Stripe API calls',
      'Mock database queries',
      'Target: >90% coverage',
    ],
    design: `Test files:
- backend/src/__tests__/services/SubscriptionService.test.ts
- backend/src/__tests__/services/QuotaService.test.ts
- backend/src/__tests__/services/OrganizationService.test.ts

Mock pattern:
vi.mock('../../config/stripe');
vi.mock('../../utils/database');

Test categories:
- Happy path scenarios
- Error handling
- Edge cases
- Concurrent operations`,
    acceptance: [
      'All service methods tested',
      'Coverage >90% on service layer',
      'All tests pass in CI/CD',
      'Mocks properly isolate tests',
      'Test execution <30 seconds',
    ],
  },

  {
    id: '023',
    title: 'Integration Tests - Stripe & Quotas',
    phase: 'Phase 6 (Testing & Production Deployment)',
    effort: '3 days',
    dependencies: 'SF-022',
    objective: 'Write integration tests using real Stripe test mode and database',
    requirements: [
      'Test Stripe Checkout session creation',
      'Test webhook event processing',
      'Test quota enforcement with race conditions',
      'Test multi-tenant data isolation',
      'Use test database (not production)',
    ],
    design: `Test scenarios:
1. Create subscription end-to-end
2. Process webhook → update database
3. Quota race condition (2 simultaneous requests)
4. Organization A cannot access Organization B data

Run with:
TEST_STRIPE=true npm test -- integration.test.ts`,
    acceptance: [
      'Integration tests pass with real Stripe',
      'Webhook processing verified end-to-end',
      'Race conditions handled correctly',
      'Data isolation verified',
      'Tests run in separate database',
    ],
  },

  {
    id: '024',
    title: 'E2E Tests - Signup to Checkout Flow',
    phase: 'Phase 6 (Testing & Production Deployment)',
    effort: '2 days',
    dependencies: 'SF-023',
    objective: 'Write end-to-end tests using Playwright covering full user flow',
    requirements: [
      'Signup → auto-create Free org',
      'Login → view billing page',
      'Upgrade → Stripe Checkout',
      'Webhook → database updated',
      'Dashboard → shows Pro tier',
    ],
    design: `frontend/tests/e2e/billing-flow.spec.ts

test('full billing flow', async ({ page }) => {
  // 1. Signup
  await page.goto('/register');
  await page.fill('input[name=email]', 'test@example.com');
  // ... complete signup

  // 2. View billing page
  await page.goto('/admin/billing');
  await expect(page.locator('text=Free Plan')).toBeVisible();

  // 3. Click upgrade
  await page.click('button:text("Upgrade")');

  // 4. Stripe Checkout (use test card)
  await page.waitForURL(/checkout.stripe.com/);
  // ... fill Stripe form

  // 5. Verify success
  await page.waitForURL(/billing\\/success/);
  await expect(page.locator('text=Pro Plan')).toBeVisible();
});`,
    acceptance: [
      'E2E test covers signup to upgrade',
      'Stripe test mode used',
      'Test runs in CI/CD',
      'Includes success and error paths',
      'Test execution <2 minutes',
    ],
  },

  {
    id: '025',
    title: 'Production Stripe Setup',
    phase: 'Phase 6 (Testing & Production Deployment)',
    effort: '1 day',
    dependencies: 'SF-024',
    objective: 'Configure Stripe production mode and deploy live keys',
    requirements: [
      'Create production products/prices',
      'Generate live API keys',
      'Configure production webhook endpoint',
      'Enable Stripe Tax (optional)',
      'Set up domain authentication for emails',
      'Test production webhook delivery',
    ],
    design: `Checklist:
1. Switch to live mode in Stripe Dashboard
2. Create products (Starter, Pro, Enterprise)
3. Create prices (monthly, annual)
4. Generate live keys (pk_live_..., sk_live_...)
5. Add webhook: https://api.dprogres.com/api/webhooks/stripe
6. Update production env vars in hosting platform
7. Test webhook: stripe trigger checkout.session.completed --live`,
    acceptance: [
      'Production products created',
      'Live API keys generated',
      'Production webhook endpoint configured',
      'Test webhook delivered successfully',
      'Environment variables updated',
      'First production transaction processed',
    ],
  },

  {
    id: '026',
    title: 'Monitoring & Alerting',
    phase: 'Phase 6 (Testing & Production Deployment)',
    effort: '2 days',
    dependencies: 'SF-025',
    objective: 'Set up monitoring for subscription system and critical metrics',
    requirements: [
      'Webhook failure alerts (>5 in 1 hour)',
      'Payment failure alerts',
      'Quota enforcement errors',
      'API response time monitoring',
      'Database connection errors',
      'SendGrid delivery failures',
    ],
    design: `Tools:
- Sentry: Error tracking
- Stripe Dashboard: Payment alerts
- Uptime monitoring: Webhook endpoint health

Alerts:
1. Webhook failures: Email + Slack
2. Payment failures: Slack channel #billing-alerts
3. API errors: Sentry notification
4. Quota enforcement errors: Daily digest

Metrics Dashboard:
- MRR (Monthly Recurring Revenue)
- Subscription count by tier
- Churn rate
- Payment success rate
- Webhook processing time`,
    acceptance: [
      'Sentry configured for error tracking',
      'Webhook failure alerts working',
      'Payment failure notifications sent',
      'Metrics dashboard accessible',
      'Alerts tested with simulated failures',
    ],
  },

  {
    id: '027',
    title: 'Documentation & Runbooks',
    phase: 'Phase 6 (Testing & Production Deployment)',
    effort: '2 days',
    dependencies: 'SF-026',
    objective: 'Create comprehensive documentation and operational runbooks',
    requirements: [
      'API documentation (endpoints, request/response)',
      'Deployment guide',
      'Troubleshooting guide',
      'Runbook for common issues',
      'Architecture diagrams',
      'Database schema documentation',
    ],
    design: `Documents to create:
1. docs/API_BILLING.md: All billing endpoints
2. docs/DEPLOYMENT_SAAS.md: Deployment checklist
3. docs/TROUBLESHOOTING_BILLING.md: Common issues
4. docs/RUNBOOK_BILLING.md: Operational procedures
5. docs/ARCHITECTURE_SAAS.md: System diagrams

Runbook scenarios:
- Webhook not processing
- Payment failure investigation
- Subscription state mismatch
- Quota enforcement issues
- Database migration rollback`,
    acceptance: [
      'API documentation complete',
      'Deployment guide tested',
      'Troubleshooting guide covers 10+ issues',
      'Runbook procedures documented',
      'Architecture diagrams created',
      'All docs reviewed and approved',
    ],
  },
];

// Generate ticket files
tickets.forEach((ticket) => {
  const filename = `EPIC-003_SF-${ticket.id}_${ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`;
  const filepath = path.join(ticketsDir, filename);

  const content = `# SF-${ticket.id}: ${ticket.title}

**Epic**: EPIC-003 SaaS Foundation
**Phase**: ${ticket.phase}
**Priority**: P0
**Estimated Effort**: ${ticket.effort}
**Status**: Not Started
**Dependencies**: ${ticket.dependencies}
**Assigned To**: Backend Engineer

---

## Objective

${ticket.objective}

---

## Requirements

### Functional Requirements

${ticket.requirements.map(req => `- ${req}`).join('\n')}

---

## Technical Design

${ticket.design}

---

## Acceptance Criteria

${ticket.acceptance.map(ac => `- [ ] ${ac}`).join('\n')}

---

## Testing

### Unit Tests

Write comprehensive unit tests covering all methods and edge cases.

Target coverage: >90%

### Integration Tests

Test end-to-end flows with real dependencies (Stripe test mode, database).

### Manual Testing

Verify functionality in development environment before marking as complete.

---

## Documentation

Update relevant documentation files:
- \`docs/COMPONENTS.md\` - Add service description
- \`docs/API_BILLING.md\` - Document new endpoints
- \`docs/PATTERNS.md\` - Document patterns used

---

## Deployment Notes

### Environment Variables

List required environment variables and their purposes.

### Database Changes

List any database migrations or schema changes.

### Testing Checklist

Provide checklist for validating deployment:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Code review approved

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
`;

  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`✓ Created ${filename}`);
});

console.log(`\n✅ Successfully generated ${tickets.length} tickets (SF-004 through SF-027)`);
console.log(`\nNext steps:`);
console.log(`1. Review tickets in docs/tickets/`);
console.log(`2. Assign tickets to engineers`);
console.log(`3. Begin Phase 1 implementation (SF-001 through SF-004)`);
