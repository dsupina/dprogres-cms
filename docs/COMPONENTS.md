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

### Billing Components (`frontend/src/components/billing/`)

#### CurrentPlanCard
**Purpose**: Display current subscription plan with upgrade and manage billing options
**Location**: `frontend/src/components/billing/CurrentPlanCard.tsx`
**Status**: ✅ Completed (December 2025)

```tsx
// Usage Example
<CurrentPlanCard
  subscription={subscriptionData}
  onUpgradeClick={() => setShowUpgradeModal(true)}
  onManageBillingClick={handleManageBilling}
/>
```

**Key Features**:
- Plan tier badge with color coding (free, starter, pro, enterprise)
- Price display with billing cycle
- Status indicators (active, past_due, trialing, canceled)
- Warning banner for past due or canceling subscriptions
- Next billing date display
- Upgrade and manage billing action buttons

---

#### UsageOverview
**Purpose**: Display 5 quota dimensions with progress bars, warning states, and upgrade CTAs
**Location**: `frontend/src/components/billing/UsageOverview.tsx`
**Status**: ✅ Enhanced with Upgrade CTAs (December 2025)
**Ticket**: SF-020

```tsx
// Usage Example
<UsageOverview
  usage={usageItems}
  onUpgradeClick={() => setShowUpgradeModal(true)}
/>
```

**Props**:
- `usage: UsageItem[]` - Array of quota status items
- `onUpgradeClick?: () => void` - Optional callback for upgrade button clicks

**Quota Dimensions**:
- Sites - Globe icon, blue
- Posts - FileText icon, green
- Team Members - Users icon, purple
- Storage - HardDrive icon, orange (displays as GB/MB)
- API Calls - Activity icon, cyan

**Color States**:
- Blue (normal): <80% usage
- Yellow (warning): 80-94% usage
- Red (danger): 95-99% usage
- Red + Upgrade CTA: 100%+ (exceeded)

**Key Features**:
- Progress bars with percentage display
- Warning state (yellow) at 80%+ usage with "Approaching limit" message
- Critical state (red) at 95%+ usage with "Critical" message
- Exceeded state (100%+) with "Quota exceeded" message and inline upgrade button
- Header "Upgrade Now" button when any quota is exceeded
- Footer "Upgrade for more resources" link when quotas are in warning/critical state
- Unlimited display for enterprise tiers (gradient background, no percentage)
- Human-readable number formatting (1K, 1M, 1GB)
- Data-testid attributes for all interactive elements

**Tests**: `frontend/src/components/billing/__tests__/UsageOverview.test.tsx` (36 tests)
- Basic rendering of all 5 quota dimensions
- Progress bar color states (normal, warning, critical)
- Unlimited quota handling
- Warning and critical message display
- Exceeded state with upgrade CTA
- Header/footer/inline upgrade button clicks
- Edge cases (empty data, unknown dimensions)

---

#### UpgradeModal
**Purpose**: Modal for plan comparison and upgrade flow with Stripe Checkout integration
**Location**: `frontend/src/components/billing/UpgradeModal.tsx`
**Status**: ✅ Completed (December 2025)
**Ticket**: SF-017, SF-018

```tsx
// Usage Example
<UpgradeModal
  plans={plans}
  currentPlanTier="free"
  onClose={() => setShowModal(false)}
  onUpgrade={handleUpgrade}
  isLoading={isCheckoutLoading}
/>
```

**Key Features**:
- Monthly/Annual toggle with 17% savings badge
- Plan comparison cards with features
- Most Popular badge for starter plan
- Disabled buttons for current plan
- Contact sales CTA for enterprise
- Loading state during checkout creation
- Responsive grid layout
- Stripe Checkout redirect flow (SF-018)

**Tests**: `frontend/src/components/billing/__tests__/UpgradeModal.test.tsx` (10 tests)
- Plan rendering and billing cycle toggle
- Upgrade button click handling
- Loading state display
- Current plan disabled state

---

#### BillingSuccessPage
**Purpose**: Stripe Checkout success confirmation page with auto-redirect
**Location**: `frontend/src/pages/admin/BillingSuccessPage.tsx`
**Status**: ✅ Completed (December 2025)
**Ticket**: SF-018

```tsx
// Route: /admin/billing/success
// Automatically redirects to /admin/billing after 5 seconds
```

**Key Features**:
- Success checkmark icon with confirmation message
- Countdown timer (5 seconds) with auto-redirect
- Manual "Go to Billing" link for immediate navigation
- "What's next?" information section
- Invalidates billing queries on mount (subscription, usage, invoices)
- Responsive design with centered layout

**User Flow**:
1. User clicks "Upgrade" in UpgradeModal
2. Redirects to Stripe Checkout
3. After successful payment, Stripe redirects to `/admin/billing/success`
4. Page shows confirmation, invalidates cache, auto-redirects to billing

**Tests**: `frontend/src/pages/admin/__tests__/BillingSuccessPage.test.tsx` (8 tests)

---

#### InvoiceTable
**Purpose**: Display invoice history with pagination and download links
**Location**: `frontend/src/components/billing/InvoiceTable.tsx`
**Status**: ✅ Completed (December 2025)

```tsx
// Usage Example
<InvoiceTable
  invoices={invoices}
  pagination={pagination}
  onPageChange={setInvoicePage}
  isLoading={isInvoicesLoading}
/>
```

**Key Features**:
- Responsive design (table on desktop, cards on mobile)
- Status badges (paid, open, draft, void, uncollectible)
- PDF download and hosted invoice links
- Pagination with page info
- Loading state
- Empty state for no invoices

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

### Organization Components (`frontend/src/components/organization/`)

#### OrganizationDetailsForm
**Purpose**: Display and edit organization details (name, logo)
**Location**: `frontend/src/components/organization/OrganizationDetailsForm.tsx`
**Status**: ✅ Completed (December 2025)
**Ticket**: SF-021

```tsx
// Usage Example
<OrganizationDetailsForm
  organization={organizationData}
  canEdit={userRole === 'owner'}
/>
```

**Key Features**:
- Organization name display/edit
- Logo upload with preview
- Owner-only editing permission
- Plan tier badge display

---

#### MembersTable
**Purpose**: Display organization members with role management actions
**Location**: `frontend/src/components/organization/MembersTable.tsx`
**Status**: ✅ Completed (December 2025)
**Ticket**: SF-021

```tsx
// Usage Example
<MembersTable
  organizationId={orgId}
  members={membersList}
  currentUserRole={userRole}
  currentUserId={userId}
  onTransferOwnership={handleTransferOwnership}
/>
```

**Key Features**:
- Member list with role badges (owner, admin, editor, publisher, viewer)
- Role change dropdown menu
- Remove member action
- Transfer ownership option (owner only)
- Current user indicator "(You)"

---

#### InviteMemberForm
**Purpose**: Invite new members and manage pending invitations
**Location**: `frontend/src/components/organization/InviteMemberForm.tsx`
**Status**: ✅ Completed (December 2025)
**Ticket**: SF-021

```tsx
// Usage Example
<InviteMemberForm
  organizationId={orgId}
  canInvite={['owner', 'admin'].includes(userRole)}
/>
```

**Key Features**:
- Email and role input form
- Optional custom message
- Pending invitations list
- Revoke invitation action
- Expiration date display

---

#### TransferOwnershipModal
**Purpose**: Confirmation modal for transferring organization ownership
**Location**: `frontend/src/components/organization/TransferOwnershipModal.tsx`
**Status**: ✅ Completed (December 2025)
**Ticket**: SF-021

```tsx
// Usage Example
<TransferOwnershipModal
  organizationId={orgId}
  organizationName="My Organization"
  newOwnerId={memberId}
  newOwnerName="New Owner"
  onClose={() => setShowModal(false)}
/>
```

**Key Features**:
- Warning banner about irreversible action
- Transfer details summary
- "TRANSFER" confirmation text requirement
- Auto-capitalization of input
- What will change checklist

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

#### RBAC Middleware (SF-007)
**Purpose**: Role-based access control for organization-scoped resources
**Location**: `backend/src/middleware/rbac.ts`
**Config**: `backend/src/config/permissions.ts`
**Status**: ✅ Completed (January 2025)

```typescript
// Usage Examples
import { requirePermission, requireAnyPermission, requireAllPermissions } from '../middleware/rbac';
import { Permission } from '../config/permissions';

// Single permission check
router.post('/sites',
  authenticateToken,
  requirePermission(Permission.CREATE_SITES),
  createSiteHandler
);

// OR logic - user needs ANY of the permissions
router.get('/content',
  authenticateToken,
  requireAnyPermission([Permission.EDIT_POSTS, Permission.VIEW_POSTS]),
  getContentHandler
);

// AND logic - user needs ALL of the permissions
router.delete('/organization',
  authenticateToken,
  requireAllPermissions([Permission.MANAGE_ORGANIZATION, Permission.MANAGE_BILLING]),
  deleteOrgHandler
);
```

**Key Features**:
- 14 permissions across 5 categories (billing, members, sites, content, analytics/data, read)
- 5 hierarchical roles (owner > admin > editor > publisher > viewer)
- In-memory permission caching with 5-minute TTL
- Automatic cache cleanup every 60 seconds (unref'd to prevent event loop blocking)
- Performance target: <20ms per check
- Site isolation for multi-tenant data security
- Organization context from JWT token
- **Security Hardened**: Automatic cache invalidation on role changes, soft-delete filtering

**Permissions Matrix**:
- **Billing & Organization**: `MANAGE_BILLING`, `MANAGE_ORGANIZATION` (owner only)
- **Member Management**: `INVITE_USERS`, `MANAGE_MEMBERS` (owner, admin)
- **Site Management**: `CREATE_SITES`, `MANAGE_SITES` (owner, admin)
- **Content Management**: `CREATE_POSTS`, `EDIT_POSTS`, `PUBLISH_POSTS`, `DELETE_POSTS`
- **Analytics & Data**: `VIEW_ANALYTICS`, `EXPORT_DATA`
- **Read Access**: `VIEW_POSTS`, `VIEW_SETTINGS` (all roles)

**Cache Methods**:
```typescript
import { permissionCache } from '../middleware/rbac';

// Invalidate specific user-org combination (automatic on role changes)
permissionCache.invalidate(organizationId, userId);

// Invalidate all cache entries for an organization
permissionCache.invalidateOrganization(organizationId);

// Clear entire cache
permissionCache.clear();

// Stop cleanup timer and clear cache (use in test teardown)
permissionCache.destroy();

// Get cache statistics
const stats = permissionCache.getStats(); // { size: number, ttl: number }
```

**Automatic Cache Invalidation**: Cache is automatically invalidated when:
- Member role is updated (`MemberService.updateMemberRole`)
- Member is removed (`MemberService.removeMember`)
- Member re-joins organization (`MemberService.acceptInvite`)
- Ownership is transferred (`OrganizationService.transferOwnership`)

This prevents stale permissions and ensures immediate security enforcement.

**Integration**:
- Works with `OrganizationService.getMemberRole()` for role resolution
- **Security**: getMemberRole filters `deleted_at IS NULL` to exclude soft-deleted members
- Requires `organizationId` in req, params, or body
- Extends Express Request with `req.organizationId`
- Returns 401 (unauthenticated), 400 (missing org), or 403 (denied)

**Redis Migration Path**: Documented in code for future distributed caching:
```typescript
// Future Redis implementation
// Key format: rbac:${organizationId}:${userId} => role
// TTL: 300 seconds
```

**Tests**:
- `backend/src/__tests__/middleware/rbac.test.ts` (35 tests - includes timer management & soft-delete tests)
- `backend/src/__tests__/config/permissions.test.ts` (29 tests)
- `backend/src/__tests__/services/MemberService.cache.test.ts` (5 tests - cache invalidation)
- `backend/src/__tests__/services/OrganizationService.cache.test.ts` (3 tests - ownership transfer)
- **Total**: 72 tests, 100% pass rate

**Security Hardening** (4 P1 issues resolved):
1. ✅ Cache invalidation on role changes (prevents stale permissions)
2. ✅ Soft-delete filtering in getMemberRole (prevents removed users from regaining access)
3. ✅ Dual cache invalidation on ownership transfer (old owner + new owner)
4. ✅ Timer leak prevention with .unref() (prevents event loop blocking in tests)

---

#### Quota Enforcement Middleware (SF-010)
**Purpose**: Enforce usage quotas before resource creation to prevent exceeding plan limits
**Location**: `backend/src/middleware/quota.ts`
**Cache**: `backend/src/utils/subscriptionCache.ts`
**Status**: ✅ Completed (November 2025)

```typescript
// Usage Examples
import { enforceQuota } from '../middleware/quota';

// Enforce sites quota
router.post('/sites',
  authenticateToken,
  requireAdmin,
  enforceQuota('sites'),
  createSiteHandler
);

// Enforce posts quota
router.post('/posts',
  authenticateToken,
  requireAuthor,
  enforceQuota('posts'),
  createPostHandler
);

// Enforce storage quota for media uploads
router.post('/media/upload',
  authenticateToken,
  requireAuthor,
  enforceQuota('storage_bytes'),
  uploadHandler
);
```

**Key Features**:
- **Pre-flight quota checks** before POST/PUT operations
- **HTTP 402 Payment Required** when quota exceeded with upgrade URL
- **Enterprise tier bypass** - Enterprise organizations skip all quota checks
- **In-memory caching** of subscription tiers (5min TTL)
- **Comprehensive logging** for quota events (exceeded, bypassed, allowed)
- **Fail-safe design** - Defaults to free tier on database errors
- **Dynamic billing URL** - Reads from `BILLING_PORTAL_URL` environment variable

**Quota Dimensions**:
- `sites` - Number of sites per organization
- `posts` - Number of posts per organization
- `users` - Number of team members per organization
- `storage_bytes` - Total file storage in bytes
- `api_calls` - API requests per month (future)

**Error Response (402)**:
```json
{
  "success": false,
  "error": "Quota exceeded for sites",
  "errorCode": "QUOTA_EXCEEDED",
  "quota": {
    "dimension": "sites",
    "current": 10,
    "limit": 10,
    "remaining": 0,
    "percentageUsed": 100
  },
  "tier": "pro",
  "upgradeUrl": "/billing/upgrade",
  "message": "You have reached your pro plan limit for sites. Upgrade to increase your quota."
}
```

**SubscriptionCache** (`backend/src/utils/subscriptionCache.ts`):
```typescript
import { subscriptionCache } from '../utils/subscriptionCache';

// Cache subscription tier (automatic in middleware)
subscriptionCache.setTier(organizationId, { planTier: 'pro', status: 'active' });

// Get cached tier
const tier = subscriptionCache.getTier(organizationId);

// Invalidate cache (call after subscription changes)
subscriptionCache.invalidateTier(organizationId);

// Cache pricing data (1 hour TTL)
subscriptionCache.setPricing(priceId, priceData);
const pricing = subscriptionCache.getPricing(priceId);

// Cache tax rates (24 hour TTL)
subscriptionCache.setTaxRate(countryCode, taxRateData);
const taxRate = subscriptionCache.getTaxRate(countryCode);

// Get cache statistics
const stats = subscriptionCache.getStats();
// { tierCacheSize: 15, pricingCacheSize: 8, taxRateCacheSize: 5 }
```

**Cache TTLs**:
- Subscription tiers: 5 minutes (frequent access, changes rare)
- Stripe pricing data: 1 hour (vendor data, rarely changes)
- VAT/tax rates: 24 hours (regulatory data, stable)

**Integration**:
- Requires `organizationId` in `req.user` (from JWT)
- Returns **400** if organizationId missing
- Returns **402** if quota exceeded
- Returns **500** on QuotaService errors
- Integrates with `QuotaService.checkQuota()` (SF-009)

**Configuration**:
```bash
# Environment variables
BILLING_PORTAL_URL=https://billing.example.com/upgrade  # Default: /billing/upgrade
```

**Tests**:
- `backend/src/__tests__/middleware/quota.test.ts` (18 unit tests)
- `backend/src/__tests__/integration/sf010-quota-enforcement.integration.test.ts` (11 integration tests)
- **Total**: 29 tests, 100% pass rate

**Automatic Cache Invalidation**:
```typescript
import { invalidateSubscriptionCache } from '../middleware/quota';

// Invalidate after subscription changes
invalidateSubscriptionCache(organizationId);
```

Call `invalidateSubscriptionCache()` when:
- Subscription tier changes (upgrade/downgrade)
- Subscription status changes (canceled, expired)
- Trial period ends

**Performance**:
- Subscription lookup (cached): ~5ms
- Subscription lookup (database): ~35ms
- Quota check + enforcement: ~45ms total
- Enterprise tier bypass: ~10ms (no quota service call)

**Related**: SF-009 (Quota Service), SF-002 (Stripe Integration), SF-008 (Organization Onboarding)

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

#### Subscription Lifecycle Service (SF-016)
**Purpose**: Subscription state machine management, grace period enforcement, and automatic downgrade to Free tier
**Location**: `backend/src/services/SubscriptionLifecycleService.ts`
**Status**: ✅ Completed (December 2025)

```typescript
// Usage Example
import {
  subscriptionLifecycleService,
  GRACE_PERIOD_DAYS,
  FREE_TIER_QUOTAS
} from '../services/SubscriptionLifecycleService';

// Handle subscription status transition (typically called from webhook handlers)
const result = await subscriptionLifecycleService.handleStatusTransition(
  subscriptionId: 1,
  newStatus: 'past_due'
);

// Process expired grace periods (called by scheduled job)
const expirations = await subscriptionLifecycleService.processGracePeriodExpirations();

// Check for subscriptions needing grace period warnings (3 days before expiry)
const warnings = await subscriptionLifecycleService.checkGracePeriodWarnings();

// Manually downgrade an organization to free tier
const downgrade = await subscriptionLifecycleService.downgradeToFreeTier(organizationId);

// Reset quotas to free tier limits
await subscriptionLifecycleService.resetQuotasToFreeTier(organizationId);

// Get subscription status
const status = await subscriptionLifecycleService.getSubscriptionStatus(organizationId);
```

**State Machine Transitions**:
- `trialing → active` (payment succeeds)
- `active → past_due` (payment fails, starts 7-day grace period)
- `past_due → active` (payment retried, succeeds)
- `past_due → canceled` (grace period expires after 7 days)
- `active → canceled` (user cancels)
- `* → canceled` (subscription.deleted webhook)

**Grace Period Enforcement**:
- 7-day grace period for past_due subscriptions
- Automatic cancellation after grace period expires
- Warning emails sent at 3 days remaining
- Daily job (`gracePeriodCheck.ts`) processes expirations

**Free Tier Quotas**:
- Sites: 1
- Posts: 100
- Users: 1
- Storage: 1GB (1073741824 bytes)
- API Calls: 10,000/month

**Lifecycle Events**:
- `lifecycle:state_changed` - Fired on any status transition
- `lifecycle:grace_period_started` - Fired when subscription enters past_due
- `lifecycle:grace_period_warning` - Fired 3 days before expiration
- `lifecycle:grace_period_expired` - Fired when grace period expires
- `lifecycle:downgrade_completed` - Fired when org is downgraded to free
- `lifecycle:quota_reset` - Fired when quotas are reset to free tier

**Integration Points**:
- Webhook handlers call `handleStatusTransition()` on status changes
- Daily cron job runs `processGracePeriodExpirations()` and `checkGracePeriodWarnings()`
- Integrates with EmailService for notification emails
- Invalidates subscription cache on tier changes

**Tests**: `backend/src/__tests__/services/SubscriptionLifecycleService.test.ts` (20 tests, 100% passing)

---

#### Quota Service (SF-009)
**Purpose**: Usage quota tracking and enforcement with atomic operations
**Location**: `backend/src/services/QuotaService.ts`
**Status**: ✅ Completed (January 2025)

```typescript
// Usage Example
import { quotaService } from '../services/QuotaService';

// Check if organization can perform action (does NOT increment)
const check = await quotaService.checkQuota({
  organizationId: 1,
  dimension: 'sites',
  amount: 1, // Optional, defaults to 1
});
if (check.data?.allowed) {
  // Proceed with action, then increment
}

// Increment quota atomically after successful action
const result = await quotaService.incrementQuota({
  organizationId: 1,
  dimension: 'sites',
  amount: 1,
});

// Decrement quota (when deleting resources)
await quotaService.decrementQuota({
  organizationId: 1,
  dimension: 'posts',
  amount: 5,
});

// Get quota status for all dimensions
const status = await quotaService.getQuotaStatus(organizationId);
// Returns: { sites: {...}, posts: {...}, users: {...}, storage_bytes: {...}, api_calls: {...} }

// Reset monthly quotas (api_calls)
await quotaService.resetMonthlyQuotas(organizationId);

// Set quota override (Enterprise customers)
await quotaService.setQuotaOverride({
  organizationId: 1,
  dimension: 'sites',
  newLimit: 100,
});

// Reset all monthly quotas (scheduled job)
const rowsUpdated = await quotaService.resetAllMonthlyQuotas();
```

**Key Features**:
- **Atomic Operations**: Uses PostgreSQL `check_and_increment_quota()` function with SELECT FOR UPDATE
- **Event-Driven Architecture**: Extends EventEmitter for quota threshold notifications
- **Performance Optimized**: <50ms for quota checks (verified in tests)
- **Race Condition Safe**: Transaction-based decrements with row-level locking
- **ServiceResponse Pattern**: Consistent error handling with success/error states
- **Multi-Dimensional Quotas**: Supports 5 quota types (sites, posts, users, storage_bytes, api_calls)
- **Type Safety**: Full TypeScript coverage with exported interfaces and types

**Quota Dimensions**:
1. **sites** - Number of sites per organization (permanent quota)
2. **posts** - Number of posts per organization (permanent quota)
3. **users** - Number of users/members per organization (permanent quota)
4. **storage_bytes** - Total storage usage in bytes (permanent quota)
5. **api_calls** - Monthly API call limit (resets monthly)

**Service Methods**:
1. `checkQuota(input)` - Check if organization can perform action (within quota)
2. `incrementQuota(input)` - Atomically increment usage (returns false if quota exceeded)
3. `decrementQuota(input)` - Decrement usage when deleting resources
4. `getQuotaStatus(organizationId)` - Get current status for all dimensions
5. `resetMonthlyQuotas(organizationId)` - Reset monthly quotas for organization
6. `resetAllMonthlyQuotas()` - Reset all monthly quotas (scheduled job)
7. `setQuotaOverride(input)` - Set custom quota limit (Enterprise)

**Lifecycle Events**:
- `quota:warning` - Fired at 80%, 90%, 95% with spam prevention (SF-012)
- `quota:limit_reached` - Fired when usage reaches exactly 100%
- `quota:exceeded` - Fired when increment attempt is rejected (over limit)
- `quota:reset` - Fired when monthly quotas are reset (clears warning cache)
- `quota:override_set` - Fired when quota limit is manually changed (clears warning cache)
- `quota:incremented` - Fired when usage is incremented
- `quota:decremented` - Fired when usage is decremented

**Exported Interfaces**:
- `QuotaDimension` - Type for quota dimensions ('sites' | 'posts' | 'users' | 'storage_bytes' | 'api_calls')
- `QuotaStatus` - Quota status for a single dimension
- `QuotaCheckResult` - Result from checkQuota method
- `CheckQuotaInput` - Input for checking quota
- `IncrementQuotaInput` - Input for incrementing quota
- `DecrementQuotaInput` - Input for decrementing quota
- `SetQuotaOverrideInput` - Input for setting quota override
- `WarningThreshold` - Type for warning thresholds (80 | 90 | 95) (SF-012)
- `QuotaWarningEvent` - Warning event data with remaining quota (SF-012)

**Warning System (SF-012)**:
The QuotaService includes a spam-prevention mechanism for quota warnings:
- Warnings are emitted only once per threshold per org/dimension
- Warning cache is cleared on quota reset or limit override
- Warning cache is cleared on global reset (`resetAllMonthlyQuotas`)
- `checkAndWarn(orgId, dimension)` method for manual warning checks
- `wasWarningSent()`, `markWarningSent()`, `clearWarnings()`, `clearAllWarnings()` for cache management

**Integration Points**:
- Uses SF-001 database schema (usage_quotas table)
- PostgreSQL functions: `check_and_increment_quota()`, `reset_monthly_quotas()`
- Integrates with subscription tiers (free/starter/pro/enterprise)
- Event system for quota warning notifications (future: EmailService integration)

**API Endpoints**: `backend/src/routes/quotas.ts`
- `GET /api/quotas/:organizationId` - Get quota status for all dimensions
- `POST /api/quotas/:organizationId/check` - Check quota without incrementing
- `POST /api/quotas/:organizationId/increment` - Increment quota atomically
- `POST /api/quotas/:organizationId/decrement` - Decrement quota
- `POST /api/quotas/:organizationId/reset` - Reset monthly quotas
- `PUT /api/quotas/:organizationId/:dimension/override` - Set quota override
- `POST /api/quotas/reset-all` - Reset all monthly quotas (admin only)

**Tests**:
- `backend/src/__tests__/services/QuotaService.test.ts` (35 tests, 100% passing)
- `backend/src/__tests__/services/QuotaWarning.test.ts` (26 tests, 100% passing) - SF-012

**Performance Metrics**:
- Quota check: <50ms (target met)
- Atomic increment: ~85ms average
- Event emission: <5ms overhead
- Test coverage: 100% of all methods and edge cases

---

#### Email Service (SF-012, SF-013)
**Purpose**: Transactional email notifications via SendGrid for quota warnings and system events
**Location**: `backend/src/services/EmailService.ts`
**Status**: ✅ Completed with SendGrid integration (December 2025)

```typescript
// Usage Example
import { emailService } from '../services/EmailService';
import { quotaService } from '../services/QuotaService';

// Initialize with SendGrid API key (from environment or config)
emailService.initialize();
// Or with explicit config:
emailService.initialize({
  apiKey: 'SG.your-api-key',
  fromEmail: 'noreply@yourapp.com',
  fromName: 'Your App',
  testMode: false, // Set true for development
});

// Subscribe to quota warnings (automatic email on threshold)
emailService.subscribeToQuotaWarnings(quotaService);

// Send simple HTML email
const result = await emailService.sendEmail({
  to: [{ email: 'user@example.com', name: 'John' }],
  subject: 'Welcome!',
  html: '<h1>Welcome to DProgres CMS</h1>',
  text: 'Welcome to DProgres CMS', // Optional fallback
});

// Send email with SendGrid dynamic template
const templateResult = await emailService.sendEmail({
  to: [{ email: 'user@example.com' }],
  subject: 'Your Report',
  templateId: 'd-xxxxx', // SendGrid template ID
  dynamicData: { firstName: 'John', reportUrl: '...' },
});

// Send with CC/BCC
await emailService.sendEmail({
  to: [{ email: 'primary@example.com' }],
  cc: [{ email: 'cc@example.com' }],
  bcc: [{ email: 'bcc@example.com' }],
  subject: 'Team Update',
  html: '<p>Update content</p>',
  replyTo: 'support@example.com',
});

// Generate quota warning email content
const warningData = {
  organizationId: 1,
  dimension: 'posts',
  dimensionLabel: 'Posts',
  percentage: 90,
  current: 90,
  limit: 100,
  remaining: 10,
  timestamp: new Date(),
};
const html = emailService.generateQuotaWarningHtml(warningData);
const text = emailService.generateQuotaWarningText(warningData);

// Access delivery logs
const logs = emailService.getDeliveryLogs(50); // Last 50
emailService.clearDeliveryLogs(); // Clear logs
```

**Key Features**:
- **SendGrid Integration**: Full SendGrid API v3 support for transactional emails
- **Test Mode**: Automatically enabled in development (logs instead of sending)
- **Dynamic Templates**: Support for SendGrid dynamic template system
- **Event-Driven Architecture**: Listens to `quota:warning` events from QuotaService
- **Delivery Logging**: In-memory logging of all email attempts (up to 1000 entries)
- **Graceful Error Handling**: Extracts user-friendly errors from SendGrid responses
- **Multiple Recipients**: Support for to, cc, bcc fields
- **HTML Email Templates**: Built-in responsive templates for quota warnings

**Service Methods**:
1. `initialize(config?)` - Initialize with optional SendGrid configuration
2. `isTestMode()` - Check if running in test/stub mode
3. `subscribeToQuotaWarnings(emitter)` - Subscribe to quota warning events
4. `sendEmail(options)` - Send email via SendGrid or test mode
5. `getDeliveryLogs(limit?)` - Get recent delivery logs
6. `clearDeliveryLogs()` - Clear delivery log history
7. `getQuotaWarningSubject(data)` - Generate email subject for quota warning
8. `getQuotaWarningTemplate(percentage)` - Get template name for percentage
9. `generateQuotaWarningHtml(data)` - Generate responsive HTML email
10. `generateQuotaWarningText(data)` - Generate plain text email
11. `getDimensionLabel(dimension)` - Get human-readable dimension name

**Email Templates**:
- **quota_warning_80**: Blue "Notice" styling, informational message
- **quota_warning_90**: Orange "Warning" styling, action required
- **quota_warning_95**: Red "Critical" styling, upgrade CTA button

**Dimension Labels**:
- `sites` → "Sites"
- `posts` → "Posts"
- `users` → "Users"
- `storage_bytes` → "Storage"
- `api_calls` → "API Calls"

**Lifecycle Events Emitted**:
- `email:sent` - Fired on successful email send (includes messageId, recipients)
- `email:failed` - Fired on send failure (includes error, recipients)
- `email:quota_warning_sent` - Fired when quota warning is processed

**Exported Interfaces**:
- `EmailTemplate` - All supported template types
- `QuotaEmailTemplate` - Template types for quota warnings
- `EmailRecipient` - Recipient with email and optional name
- `SendEmailOptions` - Full options for sendEmail method
- `EmailSendResult` - Result with success, messageId, error, statusCode
- `QuotaWarningEmailData` - Processed warning data for templates
- `EmailDeliveryLog` - Delivery log entry structure
- `EmailServiceConfig` - Configuration options for initialize

**Environment Variables**:
```bash
SENDGRID_API_KEY=SG.your-api-key-here
SENDGRID_FROM_EMAIL=noreply@dprogres.com
SENDGRID_FROM_NAME=DProgres CMS
```

**Integration Points**:
- SendGrid Mail API v3 (@sendgrid/mail package)
- Subscribes to QuotaService `quota:warning` events
- Uses ServiceResponse pattern for error handling
- Auto-initializes on first sendEmail call if not initialized

**Tests**:
- `backend/src/__tests__/services/EmailService.test.ts` (47 tests, 100% passing)
- `backend/src/__tests__/services/QuotaWarning.test.ts` (EmailService section: 8 tests, 100% passing)
- **Total Coverage**: 55 tests covering initialization, validation, SendGrid integration, error handling, delivery logging, template generation

---

#### Email Template Service (SF-014)
**Purpose**: Email template management for SaaS lifecycle events with consistent branding
**Location**: `backend/src/services/EmailTemplateService.ts`
**Status**: ✅ Completed (December 2025)

```typescript
// Usage Example
import { emailTemplateService } from '../services/EmailTemplateService';

// Generate a welcome email
const { html, text, subject } = emailTemplateService.generateTemplate('welcome_email', {
  user_name: 'John Doe',
  organization_name: 'Acme Corp',
});

// Generate payment failed email
const paymentFailed = emailTemplateService.generateTemplate('payment_failed', {
  user_name: 'John',
  plan_tier: 'Professional',
  amount: '49.99',
  failure_reason: 'Card declined',
  update_payment_url: 'https://app.example.com/billing/payment',
});

// Update branding configuration
emailTemplateService.updateBranding({
  companyName: 'My CMS',
  primaryColor: '#ff5500',
  supportEmail: 'help@mycms.com',
});

// Variable interpolation for custom templates
const result = emailTemplateService.interpolate(
  'Hello {{name}}, your quota is at {{percentage}}%',
  { name: 'John', percentage: 90 }
);
```

**10 SaaS Email Templates**:
1. **welcome_email**: User signup welcome
2. **subscription_confirmation**: First payment confirmation
3. **payment_receipt**: Recurring payment receipts
4. **payment_failed**: Failed payment retry prompt
5. **quota_warning**: Usage threshold alerts (80%, 90%, 95%)
6. **quota_exceeded**: Hard limit notification
7. **member_invite**: Team member invitation
8. **subscription_canceled**: Cancellation confirmation
9. **trial_ending**: Trial ending warning (3-day notice) - Added in SF-015
10. **invoice_upcoming**: Invoice upcoming notification (7-day notice) - Added in SF-015

**Template Variables**:
- `{{user_name}}` - Recipient's name
- `{{organization_name}}` - Organization name
- `{{plan_tier}}` - Subscription tier (Starter, Pro, Enterprise)
- `{{amount}}` - Payment amount
- `{{currency}}` - Currency code (USD, EUR, etc.)
- `{{quota_dimension}}` - Resource type (Sites, Posts, Storage, etc.)
- `{{quota_percentage}}` - Current usage percentage
- `{{upgrade_url}}` - Configurable URL for plan upgrades

**Key Features**:
- **Consistent Branding**: All templates share common styles, colors, and footer
- **Responsive Design**: Inline CSS for email client compatibility
- **Dual Format**: Both HTML and plain text versions for all templates
- **XSS Protection**: HTML entity escaping for user-provided values
- **Configurable URLs**: Dashboard, upgrade, and support URLs via environment or constructor
- **Urgency Levels**: Color-coded warnings (blue notice, orange warning, red critical)

**Branding Configuration**:
```typescript
interface BrandingConfig {
  companyName: string;   // Default: 'DProgres CMS'
  primaryColor: string;  // Default: '#2563eb'
  logoUrl: string;       // Optional logo URL
  supportEmail: string;  // Default: 'support@dprogres.com'
  dashboardUrl: string;  // Default: 'https://app.dprogres.com'
  upgradeUrl: string;    // Configurable upgrade URL
  websiteUrl: string;    // Company website
}
```

**Environment Variables**:
```bash
EMAIL_COMPANY_NAME=My CMS
EMAIL_PRIMARY_COLOR=#2563eb
EMAIL_LOGO_URL=https://example.com/logo.png
EMAIL_SUPPORT_EMAIL=support@example.com
EMAIL_DASHBOARD_URL=https://app.example.com
EMAIL_UPGRADE_URL=https://app.example.com/billing/upgrade
EMAIL_WEBSITE_URL=https://example.com
```

**EmailService Integration** (SF-014):
```typescript
import { emailService } from '../services/EmailService';

// Convenience methods for each template type
await emailService.sendWelcomeEmail(recipients, variables);
await emailService.sendSubscriptionConfirmation(recipients, variables);
await emailService.sendPaymentReceipt(recipients, variables);
await emailService.sendPaymentFailed(recipients, variables);
await emailService.sendQuotaWarningEmail(recipients, variables);
await emailService.sendQuotaExceededEmail(recipients, variables);
await emailService.sendMemberInvite(recipients, variables);
await emailService.sendSubscriptionCanceled(recipients, variables);

// Generic templated email
await emailService.sendTemplatedEmail('payment_receipt', recipients, variables);
```

**Exported Types**:
- `SaaSEmailTemplate` - Union type of all 8 template names
- `TemplateVariables` - Union type of all variable interfaces
- `WelcomeEmailVariables`, `PaymentFailedVariables`, etc. - Template-specific variable interfaces
- `GeneratedTemplate` - Output with subject, html, and text
- `EmailTemplateServiceConfig` - Constructor configuration

**Tests**:
- `backend/src/__tests__/services/EmailTemplateService.test.ts` (67 tests, 100% passing)
- `backend/src/__tests__/services/EmailServiceTemplateIntegration.test.ts` (13 tests, 100% passing)
- **Total Coverage**: 80 tests, 100% statement coverage for EmailTemplateService

---

#### Monitoring Service (SF-026)
**Purpose**: Centralized monitoring and alerting service for subscription system and critical metrics
**Location**: `backend/src/services/MonitoringService.ts`
**Status**: ✅ Completed (December 2025)

```typescript
// Usage Example
import { monitoringService } from '../services/MonitoringService';

// Initialize the service
monitoringService.initialize();

// Record a webhook metric
monitoringService.recordWebhookMetric({
  eventId: 'evt_123',
  eventType: 'invoice.payment_succeeded',
  processingTimeMs: 150,
  success: true,
  timestamp: new Date(),
});

// Record an error
monitoringService.recordError('webhook', 'Signature verification failed');

// Get webhook statistics
const stats = monitoringService.getWebhookStats(60); // Last 60 minutes
console.log(`Failure rate: ${stats.failureRate}%`);

// Get billing metrics
const billingResult = await monitoringService.getBillingMetrics();
console.log(`MRR: $${(billingResult.data.mrr / 100).toFixed(2)}`);

// Get system health status
const healthResult = await monitoringService.getHealthStatus();
console.log(`Overall: ${healthResult.data.overall}`);

// Listen for alerts
monitoringService.on('monitoring:alert_triggered', (event) => {
  console.log(`Alert: ${event.alertName} - ${event.message}`);
});
```

**Key Features**:
- **Webhook Metrics**: Track processing times, success/failure rates, event type breakdown
- **Alert System**: Threshold-based alerting with configurable cooldown periods
- **Multi-Channel Notifications**: Email, Slack, and Sentry integration
- **Billing Metrics**: MRR, ARR, subscription counts, churn rate, conversion rate
- **Payment Metrics**: Success rate, revenue tracking, average payment amounts
- **Health Checks**: Database, Stripe, email, and webhook health monitoring

**Default Alerts**:
| Alert ID | Category | Threshold | Window | Severity |
|----------|----------|-----------|--------|----------|
| webhook_failure_rate | webhook | >5 failures | 60 min | critical |
| payment_failure_rate | payment | >3 failures | 60 min | critical |
| quota_enforcement_errors | quota | >10 errors | 60 min | warning |
| api_response_time | api | >300ms p95 | 5 min | warning |
| database_connection_errors | database | >3 errors | 5 min | critical |
| email_delivery_failures | email | >5 failures | 60 min | warning |

**Environment Variables**:
```bash
SENTRY_DSN=https://xxx@sentry.io/123           # Optional: Sentry error tracking
SLACK_WEBHOOK_URL=https://hooks.slack.com/... # Optional: Slack alerts
ALERT_EMAIL=alerts@example.com                # Optional: Email alerts
```

**API Endpoints** (`/api/metrics/*`):
- `GET /billing` - MRR, subscriptions, churn metrics
- `GET /webhooks` - Webhook processing statistics
- `GET /payments` - Payment success rates and revenue
- `GET /health` - System health status
- `GET /alerts` - Alert configurations and cooldowns
- `PATCH /alerts/:id` - Update alert configuration
- `POST /alerts/:id/reset` - Reset alert cooldown
- `GET /summary` - Combined dashboard metrics

**Events Emitted**:
- `monitoring:alert_triggered` - When an alert threshold is breached
- `monitoring:metric_recorded` - When a metric is recorded
- `monitoring:health_check` - When health check is performed

**Types**:
- `WebhookMetric` - Webhook processing metric
- `WebhookStats` - Aggregated webhook statistics
- `AlertConfig` - Alert configuration
- `AlertEvent` - Alert trigger event
- `BillingMetrics` - MRR, churn, subscription metrics
- `PaymentMetrics` - Payment success and revenue metrics
- `HealthStatus` - System health status

**Tests**:
- `backend/src/__tests__/services/MonitoringService.test.ts` (24 tests, 100% passing)
- **Coverage**: Initialization, webhook metrics, error tracking, alert system, health checks

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
- **Re-Invitation Support**: Can re-invite users who previously accepted and left organization
- **Member Re-Activation**: UPSERT logic reactivates soft-deleted members instead of creating duplicates
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
- Requires partial unique indexes for re-invitation support (migrations 008, 009)
- Requires JWT_INVITE_SECRET environment variable
- Requires AWS SES configuration (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_SENDER_EMAIL)
- Email templates in `backend/src/utils/email.ts`
- JWT token generation/validation (7-day expiration)
- Role hierarchy: owner → admin → editor → publisher → viewer

**Database Migrations**:
- **Migration 007**: Add deleted_at to organization_members
- **Migration 008**: Partial unique index on organization_members (WHERE deleted_at IS NULL)
- **Migration 009**: Partial unique index on organization_invites (WHERE accepted_at IS NULL)

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

**Tests**: `backend/src/__tests__/services/MemberService.test.ts` (35 tests, 100% passing)
- 33 original tests covering all service methods
- 1 test for re-activating soft-deleted members (P1 fix)
- 1 test for re-inviting users with accepted invites (P1 fix)

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
---

### Authentication Routes (SF-008)

#### Public Signup Endpoint
**Purpose**: User registration with automatic free-tier organization creation
**Location**: `backend/src/routes/auth.ts`
**Status**: ✅ Completed (January 2025)
**Ticket**: SF-008

```typescript
// POST /api/auth/signup
{
  email: "user@example.com",
  password: "SecurePass123!",
  first_name: "John",
  last_name: "Doe"
}

// Response (201 Created)
{
  message: "Signup successful! Please check your email to verify your account.",
  user: {
    id: 123,
    email: "user@example.com",
    first_name: "John",
    last_name: "Doe"
  },
  organization: {
    id: 456,
    name: "John's Organization",
    slug: "john-s-organization-abc123"
  },
  verificationUrl: "http://localhost:5173/verify-email?token=..." // Dev mode only
}
```

**Key Features**:
- **Atomic Transaction**: User + Organization + Quotas + Membership created together
- **Free Tier Auto-Provisioning**:
  - Sites: 1
  - Posts: 20
  - Users: 2
  - Storage: 500MB (524,288,000 bytes)
  - API Calls: 10k/month (with monthly reset period)
- **Email Verification**: Generates secure token for email confirmation
- **Unique Slug Generation**: Random 6-character suffix prevents collisions
- **Rollback Safety**: Transaction rolls back on any failure
- **Dev Mode**: Returns verification URL for testing (NODE_ENV=development)

**Security**:
- Password minimum 6 characters (Joi validation)
- Email format validation
- Duplicate email prevention
- 32-byte random verification token (crypto.randomBytes)
- Email verification required before login

**Email Verification Flow**:
```typescript
// GET /api/auth/verify-email?token=<token>
// Marks user as verified, clears verification token
// Returns: { message: "Email verified successfully!", email: "user@example.com" }
```

**Login Protection**:
- Users with `email_verified = false` blocked from login (403 Forbidden)
- Legacy users (email_verified = null) allowed for backward compatibility
- Returns error code: `EMAIL_NOT_VERIFIED`

**Tests**: `backend/src/__tests__/routes/auth.signup.test.ts` (15 tests, 11 passing)
- Signup flow with org/quota creation
- Email verification and token validation
- Login blocking for unverified users
- Duplicate email prevention
- Input validation (email format, password length, required fields)
- Transaction safety and rollback

**TODO**:
- SF-013: Send actual verification emails via EmailService (currently logs to console in dev mode)
- Integration with frontend signup form
- Email resend functionality
- Password reset flow

---

## SaaS Documentation (SF-027)

Comprehensive documentation for the SaaS billing system is available in the following files:

### API Documentation
- **[API_BILLING.md](./API_BILLING.md)** - Complete API reference for billing, quotas, metrics, and webhook endpoints with request/response examples

### Architecture
- **[ARCHITECTURE_SAAS.md](./ARCHITECTURE_SAAS.md)** - System architecture diagrams including:
  - Component architecture
  - Database schema
  - Stripe integration flow
  - Subscription lifecycle state machine
  - Quota enforcement pipeline
  - Monitoring architecture
  - Security layers
  - Deployment architecture

### Deployment
- **[DEPLOYMENT_SAAS.md](./DEPLOYMENT_SAAS.md)** - Production deployment guide covering:
  - Environment configuration
  - Database setup and migrations
  - Stripe configuration
  - SendGrid email setup
  - Monitoring setup (Sentry, Slack)
  - Pre-deployment and post-deployment checklists
  - Security checklist

### Operations
- **[RUNBOOK_BILLING.md](./RUNBOOK_BILLING.md)** - Operational procedures for:
  - Routine operations (quota reset, grace period processing, reports)
  - Customer support operations (upgrades, downgrades, refunds, cancellations)
  - Incident response (webhook failures, mass payment failures, state mismatches)
  - Database migration rollback

### Troubleshooting
- **[TROUBLESHOOTING_BILLING.md](./TROUBLESHOOTING_BILLING.md)** - 14 common issues with diagnostic steps:
  - Webhook processing issues
  - Payment failures
  - Subscription state mismatches
  - Quota enforcement problems
  - Email notification failures
  - Grace period issues
  - And more...

---
