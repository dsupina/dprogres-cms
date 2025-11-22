# Component Catalog

This document catalogs all reusable components in the codebase with usage examples and implementation patterns.

## Frontend Components

### UI Components (`frontend/src/components/ui/`)

#### RichTextEditor
**Purpose**: WYSIWYG editor for content creation with image upload support
**Location**: `frontend/src/components/ui/RichTextEditor.tsx`
**Dependencies**: react-quill, mediaService

```tsx
// Usage Example
<RichTextEditor
  value={content}
  onChange={setContent}
  placeholder="Start writing..."
  className="min-h-[300px]"
/>
```

**Key Features**:
- Image upload with validation
- Toolbar customization
- Error handling for failed uploads
- File size validation (50MB max)

---

#### DataTable
**Purpose**: Reusable data grid with sorting, filtering, and actions
**Location**: `frontend/src/components/ui/DataTable.tsx`
**Status**: Recently added, needs integration

```tsx
// Usage Example
<DataTable
  data={items}
  columns={columns}
  onSort={handleSort}
  onFilter={handleFilter}
/>
```

---

#### Modal
**Purpose**: Generic modal dialog component
**Location**: `frontend/src/components/ui/Modal.tsx`
**Status**: Recently added, needs integration

```tsx
// Usage Example
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Confirm Action"
>
  <p>Are you sure?</p>
</Modal>
```

---

### Admin Components (`frontend/src/components/admin/`)

#### MenuBuilder
**Purpose**: Drag-and-drop hierarchical menu builder
**Location**: `frontend/src/components/admin/MenuBuilder.tsx`
**Dependencies**: @dnd-kit/sortable

```tsx
// Usage Example
<MenuBuilder
  items={menuItems}
  onChange={handleMenuChange}
  onSave={saveMenu}
/>
```

**Key Features**:
- Nested menu support (up to 3 levels)
- Drag-and-drop reordering
- Real-time preview
- Link type validation

---

#### DomainSelector
**Purpose**: Domain selection dropdown for multi-site management
**Location**: `frontend/src/components/admin/DomainSelector.tsx`

```tsx
// Usage Example
<DomainSelector
  value={selectedDomain}
  onChange={setSelectedDomain}
  domains={availableDomains}
/>
```

---

### Diff Components (`frontend/src/components/admin/diff/`)

#### VersionComparison
**Purpose**: Main component for comparing two content versions
**Location**: `frontend/src/components/admin/diff/VersionComparison.tsx`

```tsx
// Usage Example
<VersionComparison
  leftVersionId={1}
  rightVersionId={2}
  onClose={handleClose}
/>
```

**Key Features**:
- Three view modes (side-by-side, unified, inline)
- Keyboard navigation (n/p for changes)
- Export to PDF/HTML/JSON
- Change statistics display

---

#### DiffViewer
**Purpose**: Renders diffs with syntax highlighting
**Location**: `frontend/src/components/admin/diff/DiffViewer.tsx`

```tsx
// Usage Example
<DiffViewer
  diffResult={diffData}
  viewMode="side-by-side"
  highlightLevel="line"
  showMetadata={true}
  currentChangeIndex={0}
/>
```

---

#### ChangeNavigator
**Purpose**: Navigate between changes with keyboard shortcuts
**Location**: `frontend/src/components/admin/diff/ChangeNavigator.tsx`

```tsx
// Usage Example
<ChangeNavigator
  currentIndex={0}
  totalChanges={15}
  onNavigate={handleNavigate}
/>
```

---

#### ChangeStatistics
**Purpose**: Display change metrics and statistics
**Location**: `frontend/src/components/admin/diff/ChangeStatistics.tsx`

```tsx
// Usage Example
<ChangeStatistics
  statistics={diffStatistics}
  onClose={handleClose}
/>
```

---

## Backend Components

### Configuration

#### Stripe Configuration (SF-002)
**Purpose**: Stripe API client initialization and payment configuration
**Location**: `backend/src/config/stripe.ts`
**Status**: ✅ Completed (January 2025)

```typescript
// Usage Example
import { stripe, getStripePriceId, STRIPE_PRICES } from '../config/stripe';

// Create a checkout session
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{
    price: getStripePriceId('starter', 'monthly'),
    quantity: 1,
  }],
  success_url: process.env.STRIPE_SUCCESS_URL,
  cancel_url: process.env.STRIPE_CANCEL_URL,
});

// Access price IDs directly
const starterMonthlyPrice = STRIPE_PRICES.starter.monthly;
```

**Key Features**:
- Environment-based key selection (test vs production)
- Latest API version (2025-11-17.clover) from Clover release
- Helper function for price ID retrieval
- TypeScript type exports for Stripe entities
- Automatic configuration validation on startup

**Configuration Variables**:
- `STRIPE_SECRET_KEY_TEST` / `STRIPE_SECRET_KEY_LIVE`
- `STRIPE_WEBHOOK_SECRET_TEST` / `STRIPE_WEBHOOK_SECRET_LIVE`
- `STRIPE_PRICE_STARTER_MONTHLY` / `STRIPE_PRICE_STARTER_MONTHLY_LIVE`
- `STRIPE_PRICE_STARTER_ANNUAL` / `STRIPE_PRICE_STARTER_ANNUAL_LIVE`
- `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_MONTHLY_LIVE`
- `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_PRO_ANNUAL_LIVE`

**Exported Types**:
- `StripeCustomer` - Stripe.Customer
- `StripeSubscription` - Stripe.Subscription
- `StripeInvoice` - Stripe.Invoice
- `StripeCheckoutSession` - Stripe.Checkout.Session
- `StripeEvent` - Stripe.Event

**Tests**: `backend/src/__tests__/config/stripe.test.ts` (4 tests, 100% coverage)

---

### Middleware

#### Auth Middleware
**Purpose**: JWT token validation and user authentication
**Location**: `backend/src/middleware/auth.ts`

```typescript
// Usage
router.get('/protected', auth, (req, res) => {
  // req.user is available here
});
```

---

#### Site Resolver Middleware
**Purpose**: Multi-domain/site resolution based on hostname
**Location**: `backend/src/middleware/siteResolver.ts`

```typescript
// Applied globally in index.ts
app.use(siteResolver);
// req.site and req.domain available in all routes
```

---

#### Validation Middleware
**Purpose**: Request body validation using Joi schemas
**Location**: `backend/src/middleware/validation.ts`

```typescript
// Usage
router.post('/api/posts',
  auth,
  validation(postSchema),
  createPost
);
```

---

### Services

#### Version Service (CV-003)
**Purpose**: Comprehensive content versioning and management
**Location**: `backend/src/services/VersionService.ts`

```typescript
// Key Methods
versionService.createVersion(input, userId, context)
versionService.autoSave(input, userId)
versionService.publishVersion(versionId, userId)
versionService.revertToVersion(versionNumber, context)
```

**Key Features**:
- 30+ specialized version management methods
- Event-driven architecture
- Security and performance optimizations
- Multi-site support

---

#### Preview Service (CV-006)
**Purpose**: Secure content preview token generation and management
**Location**: `backend/src/services/PreviewService.ts`

```typescript
// Key Methods
previewService.generatePreviewToken(config, userId)
previewService.validatePreviewToken(token, context)
previewService.revokePreviewToken(tokenId, userId)
```

**Key Features**:
- JWT+AES hybrid encryption
- Fine-grained token controls
- Site-specific preview access
- Comprehensive audit logging

---

#### Diff Service (CV-007)
**Purpose**: Version comparison and diff computation with multiple algorithms
**Location**: `backend/src/services/DiffService.ts`

```typescript
// Key Methods
diffService.compareVersions(versionId1, versionId2, userId, options)
diffService.generateTextDiff(text1, text2, granularity)
diffService.generateStructuralDiff(html1, html2)
diffService.generateMetadataDiff(version1, version2)
diffService.exportDiff(diff, format, options)
```

**Key Features**:
- Multiple diff algorithms (Myers, Patience, Histogram, Semantic)
- Text, structural, and metadata comparison
- LRU caching with 100-item limit
- Export to PDF/HTML/JSON formats
- Site isolation and security validation

---

#### Site Service
**Purpose**: Multi-site management and domain operations
**Location**: `backend/src/services/siteService.ts`

```typescript
// Key Methods
siteService.getSiteByDomain(hostname)
siteService.createSite(data)
siteService.updateSiteSettings(siteId, settings)
```

---

#### Domain Service
**Purpose**: Domain verification and management
**Location**: `backend/src/services/domainService.ts`

```typescript
// Key Methods
domainService.verifyDomain(domain, token)
domainService.setDefaultDomain(domainId)
domainService.getDomainsBysite(siteId)
```

---

#### Subscription Service (SF-003)
**Purpose**: Comprehensive subscription management and Stripe integration
**Location**: `backend/src/services/SubscriptionService.ts`
**Status**: ✅ Completed (January 2025)

```typescript
// Usage Example
import { subscriptionService } from '../services/SubscriptionService';

// Create checkout session for new subscription
const checkout = await subscriptionService.createCheckoutSession({
  organizationId: 1,
  planTier: 'pro',
  billingCycle: 'monthly',
  userId: 1,
  successUrl: 'https://app.example.com/success',
  cancelUrl: 'https://app.example.com/cancel',
  trialDays: 14, // Optional trial period
});

// Get current subscription
const subscription = await subscriptionService.getCurrentSubscription(organizationId);

// Generate customer portal URL
const portal = await subscriptionService.getCustomerPortalUrl(
  organizationId,
  'https://app.example.com/settings'
);

// Cancel subscription
const result = await subscriptionService.cancelSubscription(
  organizationId,
  true // Cancel at period end
);

// Upgrade subscription with proration
const upgrade = await subscriptionService.upgradeSubscription(
  organizationId,
  'enterprise',
  'annual'
);
```

**Key Features**:
- **Event-Driven Architecture**: Extends EventEmitter for lifecycle events
- **Owner Validation**: Enforces organization ownership for billing operations
- **Customer Reuse**: Automatically reuses existing Stripe customers
- **Proration Support**: Handles prorated charges for subscription upgrades
- **Trial Periods**: Optional trial period support (customizable duration)
- **ServiceResponse Pattern**: Consistent error handling with success/error states
- **Type Safety**: Full TypeScript coverage with exported interfaces

**Service Methods**:
1. `createCheckoutSession(input)` - Create Stripe Checkout session for new subscriptions
2. `getCurrentSubscription(organizationId)` - Retrieve active subscription
3. `getCustomerPortalUrl(organizationId, returnUrl)` - Generate self-service portal URL
4. `cancelSubscription(organizationId, cancelAtPeriodEnd)` - Cancel subscription
5. `upgradeSubscription(organizationId, newTier, newBillingCycle)` - Upgrade with automatic proration

**Lifecycle Events**:
- `checkout:session_created` - Fired when checkout session is created
- `subscription:canceled` - Fired when subscription is canceled
- `subscription:upgraded` - Fired when subscription tier is upgraded

**Exported Interfaces**:
- `Subscription` - Complete subscription data model
- `CreateCheckoutSessionInput` - Input parameters for checkout
- `CreateCheckoutSessionResponse` - Checkout session result

**Integration Points**:
- Integrates with Stripe SDK v20.0.0 (SF-002)
- Uses SF-001 database schema (organizations, subscriptions tables)
- Validates organization ownership via organizations.owner_id
- Consumes getStripePriceId() helper from stripe config

**Tests**: `backend/src/__tests__/services/SubscriptionService.test.ts` (18 tests, 100% passing)

---

#### Organization Service (SF-005)
**Purpose**: Organization management with ownership, membership, and access control
**Location**: `backend/src/services/OrganizationService.ts`
**Status**: ✅ Completed (January 2025)

```typescript
// Usage Example
import { organizationService } from '../services/OrganizationService';

// Create organization with auto-generated unique slug
const org = await organizationService.createOrganization({
  name: 'Acme Corporation',
  ownerId: 1,
  logoUrl: 'https://example.com/logo.png', // Optional
});

// Get organization with member count
const orgWithMembers = await organizationService.getOrganization(orgId, userId);

// Update organization details (owner only)
const updated = await organizationService.updateOrganization(
  orgId,
  { name: 'New Name', logoUrl: 'https://example.com/new-logo.png' },
  userId
);

// Soft delete organization (owner only, sets deleted_at)
await organizationService.deleteOrganization(orgId, userId);

// Transfer ownership (updates roles: new owner→owner, old owner→admin)
const transferred = await organizationService.transferOwnership(
  orgId,
  newOwnerId,
  currentOwnerId
);

// List all organizations where user is a member
const userOrgs = await organizationService.listUserOrganizations(userId);

// Validate user access (checks membership)
const hasAccess = await organizationService.validateAccess(orgId, userId);

// Get member's role
const role = await organizationService.getMemberRole(orgId, userId);
```

**Key Features**:
- **Auto-Slug Generation**: URL-safe slugs with 6-char random suffix (retry up to 3 times on collision)
- **Owner Auto-Membership**: Automatically adds owner as member with "owner" role on creation
- **Soft Delete**: Uses `deleted_at` timestamp for audit trail (not hard delete)
- **Ownership Transfer**: Validates new owner is existing member, updates roles atomically
- **Member Counting**: Separate query for performance on large member lists
- **Event-Driven Architecture**: Extends EventEmitter for lifecycle hooks
- **ServiceResponse Pattern**: Consistent error handling with success/error states
- **Transaction Support**: Uses database transactions for atomic multi-step operations
- **Site Isolation**: All operations validate organization membership

**Service Methods**:
1. `createOrganization(input)` - Create organization with unique slug + add owner as member
2. `getOrganization(orgId, userId)` - Get organization with member count (access check)
3. `updateOrganization(orgId, updates, userId)` - Update name/logo (owner only)
4. `deleteOrganization(orgId, userId)` - Soft delete with timestamp (owner only)
5. `transferOwnership(orgId, newOwnerId, currentOwnerId)` - Transfer ownership + update roles
6. `listUserOrganizations(userId)` - List all organizations where user is member
7. `validateAccess(orgId, userId)` - Check if user has access to organization
8. `getMemberRole(orgId, userId)` - Get member's role in organization

**Lifecycle Events**:
- `organization:created` - Fired when organization is created
- `organization:updated` - Fired when organization details are updated
- `organization:deleted` - Fired when organization is soft deleted
- `organization:ownership_transferred` - Fired when ownership is transferred

**Exported Interfaces**:
- `Organization` - Complete organization data model
- `OrganizationWithMembers` - Organization with member count
- `OrganizationMember` - Member entity with role
- `CreateOrganizationInput` - Input parameters for creation
- `UpdateOrganizationInput` - Input parameters for updates

**Integration Points**:
- Uses SF-001 database schema (organizations, organization_members tables)
- Requires deleted_at column (added in migration 006)
- Foreign key cascades handle content deletion
- Role hierarchy: owner → admin → editor → publisher → viewer

**Tests**: `backend/src/__tests__/services/OrganizationService.test.ts` (31 tests, 100% passing)

---

#### Member Service (SF-006)
**Purpose**: Organization member invitation and management with email-based JWT tokens
**Location**: `backend/src/services/MemberService.ts`
**Status**: ✅ Completed (January 2025)

```typescript
// Usage Example
import { memberService } from '../services/MemberService';

// Invite new member (sends email via AWS SES)
const invite = await memberService.inviteMember({
  organizationId: 1,
  email: 'newuser@example.com',
  role: 'editor', // admin, editor, publisher, or viewer (not owner)
  invitedBy: adminUserId,
  customMessage: 'Welcome to our team!', // Optional
  inviteUrl: 'https://app.example.com', // Optional, defaults to FRONTEND_URL
});

// Accept invitation (validates JWT token)
const member = await memberService.acceptInvite(inviteToken, userId);

// List all organization members with user details
const members = await memberService.listMembers(organizationId, userId);
// Returns: Array<{ id, user_id, role, user_email, user_name, inviter_email, ... }>

// Update member role (owner/admin only)
const updated = await memberService.updateMemberRole({
  organizationId: 1,
  memberId: 5,
  newRole: 'admin',
  actorId: ownerUserId,
});

// Remove member (soft delete, owner/admin only)
await memberService.removeMember(organizationId, memberId, actorId);

// Revoke pending invitation (owner/admin only)
await memberService.revokeInvite(inviteId, actorId);

// List pending invitations (owner/admin only)
const pendingInvites = await memberService.listPendingInvites(organizationId, userId);
```

**Key Features**:
- **JWT Token Invites**: Secure 7-day expiration tokens with separate JWT_INVITE_SECRET
- **Email Delivery**: AWS SES integration with branded HTML/text templates
- **Custom Messages**: Inviters can include personal welcome messages
- **Duplicate Prevention**: Checks both existing members and pending invites
- **Role-Based Access**: Only owner/admin can invite, update roles, remove members
- **Email Verification**: Accept invite validates user email matches invite recipient
- **GDPR Compliance**: Soft delete with 30-day retention policy
- **Event-Driven**: Emits lifecycle events for integration hooks
- **Transaction Safety**: All mutations use BEGIN/COMMIT/ROLLBACK

**Service Methods**:
1. `inviteMember(input)` - Create invite, generate JWT, send email (owner/admin only)
2. `acceptInvite(token, userId)` - Validate token, create membership
3. `listMembers(orgId, userId)` - Get all members with user details (any member)
4. `updateMemberRole(input)` - Change member role (owner/admin only, cannot change owner)
5. `removeMember(orgId, memberId, actorId)` - Soft delete member (owner/admin only)
6. `revokeInvite(inviteId, actorId)` - Cancel pending invite (owner/admin only)
7. `listPendingInvites(orgId, userId)` - View unaccepted invites (owner/admin only)

**Business Rules**:
- **Cannot invite to 'owner' role**: Use OrganizationService.transferOwnership instead
- **Cannot change owner role**: Must transfer ownership first
- **Cannot remove owner**: Must transfer ownership first
- **Cannot change your own role**: Prevents accidental privilege escalation
- **Cannot remove yourself**: Use leave organization flow instead
- **Email must match**: When accepting invite, user email must match invite recipient

**Lifecycle Events**:
- `member:invited` - Fired when member is invited (includes email, role, expiration)
- `member:joined` - Fired when invitation is accepted
- `member:role_updated` - Fired when member role is changed
- `member:removed` - Fired when member is removed (soft delete)
- `invite:revoked` - Fired when pending invite is revoked
- `invite:email_failed` - Fired when email delivery fails (for retry logic)

**Exported Interfaces**:
- `OrganizationMember` - Member entity with role and timestamps
- `OrganizationInvite` - Invite entity with token and expiration
- `MemberWithUser` - Member joined with user details (email, name)
- `InviteMemberInput` - Input parameters for inviting members
- `UpdateMemberRoleInput` - Input parameters for role updates

**Integration Points**:
- Uses SF-001 database schema (organization_invites, organization_members tables)
- Requires deleted_at column on organization_members (migration 007)
- Requires JWT_INVITE_SECRET environment variable
- Requires AWS SES configuration (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_SENDER_EMAIL)
- Email templates in `backend/src/utils/email.ts`
- JWT token generation/validation (7-day expiration)
- Role hierarchy: owner → admin → editor → publisher → viewer

**GDPR/CCPA Compliance**:
- Soft delete with `deleted_at` timestamp (not hard delete)
- 30-day retention policy for audit trail
- Hard deletion scheduled job should run: `WHERE deleted_at < NOW() - INTERVAL '30 days'`
- User data export/deletion methods planned for Phase 2

**Email Template Features**:
- Branded HTML emails with responsive design
- Plain text fallback for email clients
- Custom message section from inviter
- 7-day expiration notice
- One-click accept button
- Role badge display
- Fallback link for broken buttons

**Tests**: `backend/src/__tests__/services/MemberService.test.ts` (33 tests, 100% passing)

---

## Database Components

### Core Tables
- `users` - Authentication and user management
- `posts` - Blog posts with SEO fields
- `pages` - Static pages with template support
- `categories` - Content categorization
- `media_files` - Uploaded file metadata
- `domains` - Multi-domain support
- `sites` - Multi-site configuration
- `menu_items` - Navigation menus

### Versioning Tables (CV-003)
- `content_versions`
  - Tracks all content version states
  - Supports multi-site, multi-content type versioning
  - Includes metadata for audit and tracking
- `version_audit_log`
  - Comprehensive operation logging
  - Tracks all version-related actions

### Preview Token Tables (CV-006)
- `preview_tokens`
  - Secure token storage
  - Supports granular access controls
  - Site and version specific tokens
- `preview_analytics`
  - Partitioned tracking table
  - Captures token usage and preview interactions
- `preview_feedback`
  - Optional user feedback collection
  - Enables qualitative preview tracking

### Utility Functions

#### Password Utils
**Location**: `backend/src/utils/password.ts`
```typescript
hashPassword(plaintext: string): Promise<string>
comparePassword(plaintext: string, hash: string): Promise<boolean>
```

#### JWT Utils
**Location**: `backend/src/utils/jwt.ts`
```typescript
generateToken(payload: object): string
verifyToken(token: string): object
generateRefreshToken(payload: object): string
```

#### Slug Utils
**Location**: `backend/src/utils/slug.ts`
```typescript
generateSlug(text: string): string
ensureUniqueSlug(slug: string, table: string): Promise<string>
```

---

## Form Components & Patterns

### Post Form Pattern
**Location**: `frontend/src/pages/admin/PostNewPage.tsx`
- React Hook Form integration
- Validation with error display
- Auto-save draft functionality
- SEO fields management

### Settings Form Pattern
**Location**: `frontend/src/pages/admin/SettingsPage.tsx`
- Key-value pair management
- Optimistic updates
- Toast notifications

---

## Testing Components

### Test Utilities
**Location**: `frontend/src/__tests__/test-utils.tsx`
- Custom render with providers
- Mock service factories
- Common test fixtures

---

## Component Development Guidelines

1. **Component Structure**:
   - Props interface defined
   - Default props where applicable
   - Error boundaries for complex components
   - Loading states handled

2. **Styling Approach**:
   - Tailwind CSS classes
   - Avoid inline styles
   - Use clsx for conditional classes
   - Responsive by default

3. **State Management**:
   - React Query for server state
   - Zustand for auth state
   - Local state for UI-only concerns
   - Form state with react-hook-form

4. **Testing Requirements**:
   - Unit tests for logic
   - Integration tests for API calls
   - Accessibility testing
   - Error case coverage

5. **Documentation**:
   - JSDoc comments for complex functions
   - Usage examples in this file
   - Props documentation
   - Known limitations noted

---

## Database Components (EPIC-003 SF-001)

### Multi-Tenant Schema Components
**Implementation**: SF-001 Database Schema Migrations
**Status**: ✅ Completed (January 2025)

### Core Tables

#### organizations
**Location**: `backend/migrations/001_create_organizations.sql`
**Purpose**: Multi-tenant workspace management

```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  plan_tier VARCHAR(50) DEFAULT 'free',
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Key Features**:
- Unique slug for URL-safe identifiers
- Plan tier enforcement (free, starter, pro, enterprise)
- Owner relationship with users table
- Indexed for performance

---

#### subscriptions
**Location**: `backend/migrations/002_create_subscriptions.sql`
**Purpose**: Stripe subscription tracking

**Related Tables**:
- `invoices`: Billing history
- `payment_methods`: Customer payment cards
- `subscription_events`: Webhook audit log

**Subscription Lifecycle**:
```
trialing → active → past_due → canceled
```

**Key Features**:
- Stripe integration (customer_id, subscription_id, price_id)
- Status tracking with constraints
- Billing cycle management (monthly, annual)
- Trial period support

---

#### usage_quotas
**Location**: `backend/migrations/003_create_usage_quotas.sql`
**Purpose**: Track usage per organization per dimension

**Quota Dimensions**:
- `sites`: Permanent (never resets)
- `posts`: Permanent (never resets)
- `users`: Permanent (never resets)
- `storage_bytes`: Permanent (never resets)
- `api_calls`: Resetting (monthly reset)

**Key Features**:
- Atomic increment with quota checking
- Row-level locking prevents race conditions
- Monthly reset for API calls
- Unique constraint per org+dimension

---

#### organization_members
**Location**: `backend/migrations/004_create_organization_members.sql`
**Purpose**: Team member management with RBAC

**Roles** (hierarchical):
1. `owner`: Full control including billing
2. `admin`: Invite users, create sites
3. `editor`: Create and publish content
4. `publisher`: Publish content only
5. `viewer`: Read-only access

**Related Table**: `organization_invites` for pending invitations

---

### PostgreSQL Functions

#### check_and_increment_quota()
**Location**: `backend/migrations/003_create_usage_quotas.sql`
**Purpose**: Atomic quota checking and increment

```sql
CREATE FUNCTION check_and_increment_quota(
  org_id INTEGER,
  quota_dimension VARCHAR(50),
  increment_amount BIGINT DEFAULT 1
) RETURNS BOOLEAN
```

**Usage Example**:
```sql
-- Check if org can create a new site
SELECT check_and_increment_quota(1, 'sites', 1);
-- Returns TRUE if allowed, FALSE if quota exceeded
```

**Features**:
- `SELECT FOR UPDATE` row-level locking
- Prevents race conditions
- Atomic increment on success
- Returns boolean for easy checking

---

#### reset_monthly_quotas()
**Location**: `backend/migrations/003_create_usage_quotas.sql`
**Purpose**: Reset API call quotas monthly

```sql
CREATE FUNCTION reset_monthly_quotas() RETURNS INTEGER
```

**Usage**: Called by cron job at month start
**Returns**: Number of quotas reset

---

#### user_has_permission()
**Location**: `backend/migrations/004_create_organization_members.sql`
**Purpose**: RBAC permission checking

```sql
CREATE FUNCTION user_has_permission(
  org_id INTEGER,
  user_id_param INTEGER,
  required_permission VARCHAR(50)
) RETURNS BOOLEAN
```

**Permission Types**:
- `manage_billing`: Owner only
- `invite_users`: Owner, Admin
- `create_sites`: Owner, Admin
- `create_posts`: Owner, Admin, Editor
- `publish_posts`: Owner, Admin, Editor, Publisher
- `view_posts`: All roles

---

### Data Isolation Features

#### Row-Level Security (RLS)
**Location**: `backend/migrations/005_add_organization_id_to_content.sql`
**Purpose**: Enforce multi-tenant data isolation

**Protected Tables**:
- `sites`
- `posts`
- `pages`
- `media_files`
- `categories`

**RLS Policy Example**:
```sql
CREATE POLICY org_isolation_sites ON sites
  USING (organization_id = current_setting('app.current_organization_id', true)::int);
```

**Usage Pattern**:
```sql
-- Set organization context at request start
SET app.current_organization_id = 42;

-- All queries automatically filtered
SELECT * FROM sites; -- Only returns sites for org 42
```

---

### Indexes

**Performance Optimizations**:
- `idx_organizations_slug`: O(log n) organization lookup
- `idx_subscriptions_stripe_customer`: Fast Stripe sync
- `idx_usage_quotas_org`: Sub-50ms quota checks
- `idx_org_members_user`: Fast permission lookups
- `idx_org_invites_token`: Instant invite validation

**All indexes tested for <50ms query times under load**

---

### Migration Scripts

**Location**: `backend/migrations/`
**Execution Order**:
1. `001_create_organizations.sql`
2. `002_create_subscriptions.sql`
3. `003_create_usage_quotas.sql`
4. `004_create_organization_members.sql`
5. `005_add_organization_id_to_content.sql`

**Helper Scripts**:
- `run_migrations.sh`: Execute all migrations
- `test_migrations.sql`: Comprehensive test suite

**Test Coverage**: 15+ scenarios, 100% passing

---

### Future Service Components

**Next Implementation** (EPIC-003 Phase 1-2):
- `SubscriptionService`: Stripe webhook handling (SF-003)
- `OrganizationService`: Org CRUD operations (SF-005)
- `QuotaService`: Quota enforcement middleware (SF-009)
- `EmailService`: Transactional emails (SF-013)

See `docs/tickets/EPIC-003_TICKET_INDEX.md` for complete component roadmap.