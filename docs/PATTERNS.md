# Code Patterns & Conventions

## Service Response Pattern (CV-003, CV-006)

### Consistent API Response Structure
**All services return a standardized response format**

```typescript
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

// Success response
return {
  success: true,
  data: result
};

// Error response
return {
  success: false,
  error: 'Descriptive error message',
  details: { code: 'ERROR_CODE' }
};
```

## Event-Driven Architecture Pattern (CV-003)

### Service Event Emitters
**Services emit lifecycle events for decoupled operations**

```typescript
export class VersionService extends EventEmitter {
  async createVersion(input: CreateVersionInput): Promise<ServiceResponse<ContentVersion>> {
    // ... create version logic ...

    // Emit event for external handlers
    this.emit('version:created', {
      action: 'create',
      version: result,
      userId,
      siteId,
      metadata: { timestamp: new Date() }
    });

    return { success: true, data: result };
  }
}

// Event subscription
versionService.on('version:published', async (payload) => {
  await invalidateCache(payload.version.id);
  await notifySubscribers(payload);
});
```

## Token Caching Pattern (CV-006)

### In-Memory Cache with TTL
**Performance optimization for frequent validations**

```typescript
interface TokenCache {
  token: PreviewToken;
  version: ContentVersion;
  cachedAt: Date;
}

class PreviewService {
  private tokenCache: Map<string, TokenCache> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private getCacheKey(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private isCacheValid(cached: TokenCache): boolean {
    const age = Date.now() - cached.cachedAt.getTime();
    return age < this.CACHE_TTL_MS;
  }

  async validateToken(token: string): Promise<ValidationResult> {
    const cacheKey = this.getCacheKey(token);
    const cached = this.tokenCache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return { valid: true, data: cached };
    }

    // ... database validation ...

    // Cache the result
    this.tokenCache.set(cacheKey, {
      token: dbToken,
      version: dbVersion,
      cachedAt: new Date()
    });
  }
}
```

## Atomic Quota Management Pattern (SF-009)

### Check-Then-Act with Atomic Operations
**Prevent race conditions in multi-tenant quota enforcement**

```typescript
// CORRECT PATTERN: Check then increment atomically
async function createPost(data: PostInput, organizationId: number): Promise<ServiceResponse<Post>> {
  // 1. Check quota availability (does NOT increment)
  const quotaCheck = await quotaService.checkQuota({
    organizationId,
    dimension: 'posts',
    amount: 1,
  });

  if (!quotaCheck.success || !quotaCheck.data?.allowed) {
    return {
      success: false,
      error: 'Post quota exceeded. Please upgrade your plan.',
    };
  }

  // 2. Perform the actual operation
  const post = await pool.query(
    'INSERT INTO posts (...) VALUES (...) RETURNING *',
    [data.title, data.content]
  );

  // 3. Increment quota atomically (uses database function with SELECT FOR UPDATE)
  const incrementResult = await quotaService.incrementQuota({
    organizationId,
    dimension: 'posts',
  });

  if (!incrementResult.success) {
    // Rollback: delete the post if quota increment failed
    await pool.query('DELETE FROM posts WHERE id = $1', [post.rows[0].id]);
    return {
      success: false,
      error: 'Failed to update quota. Please try again.',
    };
  }

  return {
    success: true,
    data: post.rows[0],
  };
}

// Decrement quota on deletion
async function deletePost(postId: number, organizationId: number): Promise<ServiceResponse<void>> {
  // 1. Delete the resource
  await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

  // 2. Decrement quota (uses transaction with SELECT FOR UPDATE)
  await quotaService.decrementQuota({
    organizationId,
    dimension: 'posts',
  });

  return { success: true };
}
```

### Database-Level Atomicity
**PostgreSQL function for check-and-increment**

```sql
-- Atomic check and increment with row-level locking
CREATE OR REPLACE FUNCTION check_and_increment_quota(
  org_id INTEGER,
  quota_dimension VARCHAR(50),
  increment_amount BIGINT DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  current_val BIGINT;
  limit_val BIGINT;
BEGIN
  -- Lock row for update to prevent race conditions
  SELECT current_usage, quota_limit INTO current_val, limit_val
  FROM usage_quotas
  WHERE organization_id = org_id AND dimension = quota_dimension
  FOR UPDATE;

  -- Check if within limit
  IF current_val + increment_amount > limit_val THEN
    RETURN FALSE;
  END IF;

  -- Increment usage
  UPDATE usage_quotas
  SET current_usage = current_usage + increment_amount,
      updated_at = NOW()
  WHERE organization_id = org_id AND dimension = quota_dimension;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### Event-Driven Quota Monitoring
**Proactive threshold notifications with spam prevention (SF-012, SF-013)**

```typescript
import { emailService } from './services/EmailService';
import { quotaService, QuotaWarningEvent } from './services/QuotaService';

// RECOMMENDED: Use EmailService's built-in subscription (handles warnings automatically)
// EmailService initializes with SendGrid API (from SENDGRID_API_KEY env var)
emailService.initialize();
emailService.subscribeToQuotaWarnings(quotaService);

// EmailService automatically:
// 1. Listens for quota:warning events
// 2. Logs warnings with human-readable dimension labels
// 3. Emits email:quota_warning_sent for tracking
// 4. Sends emails via SendGrid in production (logs in test mode)

// ALTERNATIVE: Manual event handling for custom logic
quotaService.on('quota:warning', async (event: QuotaWarningEvent) => {
  const { organizationId, dimension, percentage, current, limit, remaining } = event;

  // Use EmailService helpers for subject and template
  const emailData = {
    organizationId,
    dimension,
    dimensionLabel: emailService.getDimensionLabel(dimension),
    percentage,
    current,
    limit,
    remaining,
    timestamp: event.timestamp,
  };

  // Generate HTML email with responsive design
  const html = emailService.generateQuotaWarningHtml(emailData);
  const text = emailService.generateQuotaWarningText(emailData);

  // Send via SendGrid (or log in test mode)
  const result = await emailService.sendEmail({
    to: [{ email: 'admin@example.com', name: 'Admin' }],
    subject: emailService.getQuotaWarningSubject(emailData),
    html,
    text,
  });

  if (!result.success) {
    console.error('Failed to send quota warning email:', result.error);
  }

  // Log for analytics
  await analytics.track('quota_threshold_reached', {
    organization_id: organizationId,
    dimension,
    percentage,
    remaining,
  });
});

quotaService.on('quota:exceeded', async (event) => {
  const { organizationId, dimension } = event;

  // Handle quota exceeded (implement as needed)
  console.log(`Quota exceeded for org ${organizationId}: ${dimension}`);

  // Create support ticket if Enterprise
  const org = await getOrganization(organizationId);
  if (org.plan_tier === 'enterprise') {
    await supportService.createTicket({
      organizationId,
      subject: `Quota exceeded: ${dimension}`,
      priority: 'high',
    });
  }
});
```

### Quota Warning Spam Prevention Pattern (SF-012)
**Emit warnings only once per threshold per org/dimension**

```typescript
// Warning thresholds in descending order
const WARNING_THRESHOLDS: WarningThreshold[] = [95, 90, 80];

// In-memory cache for warning tracking
private warningCache: Map<string, Date> = new Map();

/**
 * Generate cache key for warning tracking
 */
private getWarningCacheKey(orgId: number, dimension: QuotaDimension, threshold: WarningThreshold): string {
  return `${orgId}:${dimension}:${threshold}`;
}

/**
 * Check if warning was already sent
 */
wasWarningSent(orgId: number, dimension: QuotaDimension, threshold: WarningThreshold): boolean {
  const key = this.getWarningCacheKey(orgId, dimension, threshold);
  return this.warningCache.has(key);
}

/**
 * Mark warning as sent
 */
markWarningSent(orgId: number, dimension: QuotaDimension, threshold: WarningThreshold): void {
  const key = this.getWarningCacheKey(orgId, dimension, threshold);
  this.warningCache.set(key, new Date());
}

/**
 * Clear warnings for org/dimension (on quota reset or limit change)
 */
clearWarnings(orgId: number, dimension?: QuotaDimension): void {
  const prefix = dimension ? `${orgId}:${dimension}:` : `${orgId}:`;
  for (const key of this.warningCache.keys()) {
    if (key.startsWith(prefix)) {
      this.warningCache.delete(key);
    }
  }
}

/**
 * Clear all warnings across all organizations (on global quota reset)
 */
clearAllWarnings(): void {
  this.warningCache.clear();
}

/**
 * Check and emit warnings with spam prevention
 */
async checkAndWarn(orgId: number, dimension: QuotaDimension): Promise<void> {
  const statusResult = await this.getQuotaStatusForDimension(orgId, dimension);
  if (!statusResult.success || !statusResult.data) return;

  const { percentage_used, current_usage, quota_limit, remaining } = statusResult.data;

  // Check thresholds in descending order, emit only highest applicable
  for (const threshold of WARNING_THRESHOLDS) {
    if (percentage_used >= threshold && !this.wasWarningSent(orgId, dimension, threshold)) {
      this.emit('quota:warning', {
        organizationId: orgId,
        dimension,
        percentage: threshold,
        current: current_usage,
        limit: quota_limit,
        remaining,
        timestamp: new Date(),
      });
      this.markWarningSent(orgId, dimension, threshold);
      break; // Only emit highest threshold
    }
  }
}
```

**Key Features**:
- Warnings only emitted once per threshold per org/dimension
- Cache cleared on quota reset (`resetMonthlyQuotas`)
- Cache cleared on global reset (`resetAllMonthlyQuotas`) - critical for monthly cron
- Cache cleared on limit change (`setQuotaOverride`)
- Highest applicable threshold emitted first (95% before 90%)
- Warning data includes `remaining` quota for user-friendly messaging

**Integration with EmailService (SF-013)**:
```typescript
// Initialize and subscribe EmailService to quota warnings (done in index.ts)
import { emailService } from './services/EmailService';
import { quotaService } from './services/QuotaService';

// EmailService automatically detects SENDGRID_API_KEY from environment
// In development (no API key), runs in test mode (logs instead of sending)
emailService.initialize();
emailService.subscribeToQuotaWarnings(quotaService);

// EmailService internally handles quota:warning events and:
// - Logs warning with human-readable labels
// - Generates responsive HTML email templates
// - Sends via SendGrid API in production
// - Emits 'email:sent' or 'email:failed' for tracking
// - Emits 'email:quota_warning_sent' for testing

// Listen for delivery events
emailService.on('email:sent', (data) => {
  console.log(`Email sent: ${data.messageId} to ${data.to.join(', ')}`);
});

emailService.on('email:failed', (data) => {
  console.error(`Email failed: ${data.error}`);
});
```

### Quota Dimensions and Reset Policies
**Differentiate permanent vs. resetting quotas**

```typescript
// Permanent quotas (never reset)
const PERMANENT_QUOTAS: QuotaDimension[] = ['sites', 'posts', 'users', 'storage_bytes'];

// Resetting quotas (monthly)
const MONTHLY_QUOTAS: QuotaDimension[] = ['api_calls'];

// Scheduled job to reset monthly quotas (run on 1st of each month)
async function resetMonthlyQuotasJob(): Promise<void> {
  const result = await quotaService.resetAllMonthlyQuotas();
  console.log(`Reset ${result.data} monthly quotas`);

  // Emit event for monitoring
  await analytics.track('monthly_quota_reset', {
    quotas_reset: result.data,
    timestamp: new Date(),
  });
}
```

### Anti-Patterns to Avoid

```typescript
// ❌ WRONG: Check and increment separately (race condition)
const quotaCheck = await quotaService.checkQuota({...});
if (quotaCheck.data?.allowed) {
  await createPost(data); // Another request might increment here!
  await quotaService.incrementQuota({...}); // Might exceed quota
}

// ❌ WRONG: Increment without checking
await quotaService.incrementQuota({...}); // Will fail at limit, but action already performed
await createPost(data);

// ✅ CORRECT: Check, act, then atomically increment
const quotaCheck = await quotaService.checkQuota({...});
if (!quotaCheck.data?.allowed) return error;
const post = await createPost(data);
await quotaService.incrementQuota({...});
```

## Quota Enforcement Middleware Pattern (SF-010)

### Pre-Flight Quota Checks with Caching
**Enforce quotas before resource creation with subscription tier caching**

```typescript
import { enforceQuota, invalidateSubscriptionCache } from '../middleware/quota';

// Route-level quota enforcement
router.post('/api/sites',
  authenticateToken,      // JWT validation - req.user with organizationId
  requireAdmin,           // Permission check
  enforceQuota('sites'),  // Quota check - halts request if exceeded
  createSiteHandler       // Business logic executes only if quota allows
);

router.post('/api/posts',
  authenticateToken,
  requireAuthor,
  enforceQuota('posts'),
  createPostHandler
);

router.post('/api/media/upload',
  authenticateToken,
  requireAuthor,
  enforceQuota('storage_bytes'),
  uploadHandler
);
```

### Subscription Tier Caching
**Multi-level cache for frequently accessed vendor data**

```typescript
import { subscriptionCache } from '../utils/subscriptionCache';

// Automatic caching (handled by middleware)
// 1. Check cache first (5min TTL)
const cachedTier = subscriptionCache.getTier(organizationId);
if (cachedTier) {
  return cachedTier; // Cache hit - fast path
}

// 2. Query database if cache miss
const { rows } = await pool.query(
  'SELECT plan_tier, status FROM subscriptions WHERE organization_id = $1',
  [organizationId]
);

// 3. Cache the result
subscriptionCache.setTier(organizationId, {
  planTier: rows[0].plan_tier,
  status: rows[0].status,
});

// Cache vendor data with appropriate TTLs
subscriptionCache.setPricing(priceId, priceData);      // 1 hour TTL
subscriptionCache.setTaxRate(countryCode, taxRate);   // 24 hour TTL
```

### Enterprise Tier Bypass
**Skip quota checks for enterprise organizations**

```typescript
// Middleware implementation
export function enforceQuota(dimension: QuotaDimension) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const organizationId = req.user?.organizationId;
    const tier = await getSubscriptionTier(organizationId);

    // Enterprise tier bypasses all quota checks
    if (tier.planTier === 'enterprise') {
      console.log(`[QuotaEnforcement] Enterprise tier - bypassing quota check`);
      return next(); // Skip quota service entirely
    }

    // Check quota for non-enterprise tiers
    const result = await quotaService.checkQuota({
      organizationId,
      dimension,
      amount: 1,
    });

    if (!result.data?.allowed) {
      // Return 402 Payment Required with upgrade information
      return res.status(402).json({
        success: false,
        error: `Quota exceeded for ${dimension}`,
        errorCode: ServiceErrorCode.QUOTA_EXCEEDED,
        quota: {
          dimension,
          current: result.data?.current || 0,
          limit: result.data?.limit || 0,
          remaining: result.data?.remaining || 0,
          percentageUsed: result.data?.percentage_used || 100,
        },
        tier: tier.planTier,
        upgradeUrl: getBillingPortalUrl(),
        message: `You have reached your ${tier.planTier} plan limit for ${dimension}. Upgrade to increase your quota.`,
      });
    }

    next(); // Quota check passed
  };
}
```

### Cache Invalidation on Subscription Changes
**Invalidate subscription cache when billing changes occur**

```typescript
// In SubscriptionService or Webhook handler
import { invalidateSubscriptionCache } from '../middleware/quota';

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const organizationId = subscription.metadata.organizationId;

  // Update database
  await pool.query(
    'UPDATE subscriptions SET plan_tier = $1, status = $2 WHERE organization_id = $3',
    [newTier, newStatus, organizationId]
  );

  // Invalidate cache to ensure fresh data on next request
  invalidateSubscriptionCache(parseInt(organizationId));
}

// Also invalidate on:
// - Subscription canceled
// - Trial period ended
// - Plan changed (upgrade/downgrade)
```

### Error Handling & Fail-Safe
**Graceful degradation on database errors**

```typescript
async function getSubscriptionTier(organizationId: number): Promise<SubscriptionTier | null> {
  try {
    // ... cache check ...
    // ... database query ...
  } catch (error) {
    console.error('Error fetching subscription tier:', error);

    // Fail-safe: Default to free tier
    // Better to allow limited access than block all access
    return {
      planTier: 'free',
      status: 'active',
    };
  }
}
```

### HTTP Status Codes
**Standardized error responses**

| Code | Meaning | When Used |
|------|---------|-----------|
| **200** | OK | Quota check passed, request proceeds |
| **400** | Bad Request | Missing `organizationId` in JWT |
| **402** | Payment Required | Quota exceeded - includes `upgradeUrl` |
| **500** | Internal Server Error | QuotaService error or database failure |

### Performance Characteristics

| Operation | Performance | Notes |
|-----------|-------------|-------|
| Cache hit (tier lookup) | ~5ms | 85%+ hit rate in production |
| Cache miss (DB lookup) | ~35ms | Includes query + cache write |
| Enterprise bypass | ~10ms | No quota service call |
| Full quota check | ~45ms | Tier lookup + quota service |

### Testing Pattern
**Comprehensive unit and integration tests**

```typescript
// Unit test: Mock dependencies
describe('enforceQuota Middleware', () => {
  beforeEach(() => {
    jest.mock('../../utils/database');
    jest.mock('../../services/QuotaService');
    jest.mock('../../utils/subscriptionCache');
  });

  it('should allow request when quota is not exceeded', async () => {
    mockQuotaService.checkQuota.mockResolvedValue({
      success: true,
      data: { allowed: true, current: 5, limit: 10 }
    });

    const middleware = enforceQuota('sites');
    await middleware(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should return 402 when quota exceeded', async () => {
    mockQuotaService.checkQuota.mockResolvedValue({
      success: true,
      data: { allowed: false, current: 10, limit: 10 }
    });

    const middleware = enforceQuota('sites');
    await middleware(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(402);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

// Integration test: Full request flow
describe('POST /api/sites with quota', () => {
  it('should enforce quota on site creation', async () => {
    mockQuotaService.checkQuota.mockResolvedValue({
      success: true,
      data: { allowed: false, current: 10, limit: 10 }
    });

    const response = await request(app)
      .post('/api/sites')
      .send({ domain_id: 1, name: 'Test Site' });

    expect(response.status).toBe(402);
    expect(response.body.error).toBe('Quota exceeded for sites');
    expect(mockSiteService.createSite).not.toHaveBeenCalled();
  });
});
```

### Key Decisions

**Why 402 Payment Required?**
- Semantically correct for SaaS quota limits
- Differentiates from 403 Forbidden (permissions)
- Industry standard for billing-related blocks

**Why in-memory cache instead of Redis?**
- Low latency requirement (<50ms validation)
- Acceptable data staleness (5min is fine)
- Simpler deployment (no additional infrastructure)
- Easy migration path to Redis for multi-server setups

**Why cache vendor data (prices, tax rates)?**
- Reduces API calls to Stripe
- Data changes infrequently (weeks/months)
- Faster checkout experience
- Lower costs (fewer Stripe API calls)

**Related**: SF-009 (Quota Service), SF-002 (Stripe Integration), SF-007 (RBAC)

## Database Partitioning Pattern (CV-006)

### Time-Based Table Partitioning
**Scalable analytics storage**

```sql
-- Parent table with partitioning
CREATE TABLE preview_analytics (
  id BIGSERIAL,
  accessed_at TIMESTAMP NOT NULL,
  -- ... other columns ...
  partition_date DATE GENERATED ALWAYS AS (accessed_at::date) STORED
) PARTITION BY RANGE (partition_date);

-- Monthly partitions
CREATE TABLE preview_analytics_2025_01 PARTITION OF preview_analytics
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

```typescript
// Automatic partition creation
async function createMonthlyPartition(date: Date): Promise<void> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const tableName = `preview_analytics_${year}_${month}`;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName}
    PARTITION OF preview_analytics
    FOR VALUES FROM ($1) TO ($2)
  `, [startOfMonth, endOfMonth]);
}
```

## Audit Logging Pattern (CV-003, CV-006)

### Comprehensive Operation Tracking
**Security and compliance through detailed logging**

```typescript
interface AuditLog {
  action: string;
  entity_type: 'version' | 'preview_token';
  entity_id: number;
  user_id: number;
  site_id: number;
  ip_address?: string;
  user_agent?: string;
  metadata: Record<string, any>;
  created_at: Date;
}

async function auditOperation(
  operation: string,
  entityId: number,
  userId: number,
  metadata?: Record<string, any>
): Promise<void> {
  await pool.query(`
    INSERT INTO version_audit_log (
      action, entity_type, entity_id, user_id, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
  `, [operation, 'version', entityId, userId, JSON.stringify(metadata)]);
}

// Usage in service methods
async createVersion(input: CreateVersionInput): Promise<ServiceResponse<ContentVersion>> {
  // ... create version ...

  await auditOperation('version_create', version.id, userId, {
    version_type: input.version_type,
    site_id: input.site_id,
    ip_address: context.ip
  });
}
```

## Subscription Lifecycle State Machine Pattern (SF-016)

### State Machine Transitions
**Subscription status changes follow a defined state machine**

```typescript
// Valid state transitions
const STATE_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ['active', 'canceled', 'past_due', 'incomplete'],
  active: ['past_due', 'canceled', 'trialing'],
  past_due: ['active', 'canceled', 'unpaid'],
  canceled: [], // Terminal state
  incomplete: ['active', 'incomplete_expired', 'canceled'],
  incomplete_expired: [], // Terminal state
  unpaid: ['active', 'canceled'],
};

// Transition handler
async function handleStatusTransition(
  subscriptionId: number,
  newStatus: SubscriptionStatus
): Promise<ServiceResponse<StateTransitionResult>> {
  const subscription = await getSubscription(subscriptionId);
  const previousStatus = subscription.status;

  // Log unexpected transitions but still process (Stripe is source of truth)
  if (!STATE_TRANSITIONS[previousStatus].includes(newStatus)) {
    console.warn(`Unexpected transition: ${previousStatus} → ${newStatus}`);
  }

  // Update status and trigger side effects
  await updateSubscriptionStatus(subscriptionId, newStatus);

  // Handle specific transitions
  if (newStatus === 'past_due') {
    emit('lifecycle:grace_period_started', { subscriptionId, gracePeriodDays: 7 });
  }
  if (newStatus === 'canceled') {
    await downgradeToFreeTier(subscription.organization_id);
  }

  return { success: true, data: { previousStatus, newStatus } };
}
```

### Grace Period Enforcement
**7-day grace period before automatic cancellation**

```typescript
// Daily scheduled job
async function processGracePeriodExpirations(): Promise<void> {
  // Find subscriptions past grace period (7+ days in past_due)
  const expiredSubs = await pool.query(`
    SELECT id, organization_id
    FROM subscriptions
    WHERE status = 'past_due'
    AND updated_at <= NOW() - INTERVAL '7 days'
  `);

  for (const sub of expiredSubs) {
    // Cancel subscription
    await pool.query(
      `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW() WHERE id = $1`,
      [sub.id]
    );

    // Downgrade organization to free tier
    await downgradeToFreeTier(sub.organization_id);

    // Emit event for notifications
    emit('lifecycle:grace_period_expired', {
      organizationId: sub.organization_id,
      subscriptionId: sub.id,
    });
  }
}

// Warning emails at 3 days before expiration (4 days into grace period)
async function checkGracePeriodWarnings(): Promise<void> {
  const warningSubs = await pool.query(`
    SELECT s.id, s.organization_id, o.name
    FROM subscriptions s
    JOIN organizations o ON s.organization_id = o.id
    WHERE s.status = 'past_due'
    AND s.updated_at >= NOW() - INTERVAL '5 days'
    AND s.updated_at < NOW() - INTERVAL '4 days'
  `);

  for (const sub of warningSubs) {
    await sendPaymentFailedEmail(sub.organization_id, {
      daysRemaining: 3,
    });
  }
}
```

### Automatic Downgrade to Free Tier
**Quota reset and tier change on subscription cancellation**

```typescript
const FREE_TIER_QUOTAS = {
  sites: 1,
  posts: 100,
  users: 1,
  storage_bytes: 1073741824, // 1GB
  api_calls: 10000,
};

async function downgradeToFreeTier(organizationId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update organization plan tier
    await client.query(
      `UPDATE organizations SET plan_tier = 'free', updated_at = NOW() WHERE id = $1`,
      [organizationId]
    );

    // Reset quotas to free tier limits
    for (const [dimension, limit] of Object.entries(FREE_TIER_QUOTAS)) {
      await client.query(
        `UPDATE usage_quotas SET quota_limit = $1, updated_at = NOW()
         WHERE organization_id = $2 AND dimension = $3`,
        [limit, organizationId, dimension]
      );
    }

    await client.query('COMMIT');

    // Invalidate subscription cache
    invalidateSubscriptionCache(organizationId);

    // Emit events
    emit('lifecycle:downgrade_completed', { organizationId, newTier: 'free' });
    emit('lifecycle:quota_reset', { organizationId, newLimits: FREE_TIER_QUOTAS });

    // Send notification email (fire and forget)
    sendSubscriptionCanceledEmail(organizationId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Webhook Integration
**Lifecycle service integrated with Stripe webhooks**

```typescript
// In webhooks.ts
case 'customer.subscription.deleted':
  // Update status to canceled
  await updateSubscriptionStatus(subscriptionId, 'canceled');

  // Downgrade organization to free tier (SF-016)
  await downgradeToFreeTier(organizationId);

  // Invalidate cache
  invalidateSubscriptionCache(organizationId);

  // Send cancellation email
  return () => sendSubscriptionCanceledEmail(organizationId);

case 'invoice.payment_failed':
  // Get previous status
  const prevStatus = await getSubscriptionStatus(subscriptionId);

  // Update to past_due
  await updateSubscriptionStatus(subscriptionId, 'past_due');

  // Emit grace period started if transitioning to past_due
  if (prevStatus !== 'past_due') {
    emit('lifecycle:grace_period_started', {
      organizationId,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    });
  }
```

## Multi-Agent Development Pattern

### Specialized Agent Orchestration
**Complex features developed through specialized expertise**

```typescript
// Feature development workflow
interface AgentWorkflow {
  phases: {
    design: ['px-agent', 'tech-architect'];
    security: ['security-advisor', 'db-gatekeeper'];
    implementation: ['feature-conductor'];
    documentation: ['project-docs-manager'];
  };

  gates: {
    baseline: 'All tests must pass before branch creation';
    security: 'BLOCKER requirements must be resolved';
    performance: 'Target metrics must be achieved';
  };
}

// Agent responsibilities
const agentRoles = {
  'px-agent': 'User experience and workflows',
  'tech-architect': 'System design and API contracts',
  'security-advisor': 'Threat modeling and compliance',
  'db-gatekeeper': 'Schema optimization and queries',
  'feature-conductor': 'Implementation orchestration',
  'project-docs-manager': 'Documentation maintenance'
};
```

## TypeScript Type Patterns (CV-002)

### Type Guard Pattern
**Runtime validation for TypeScript interfaces**

```typescript
// Type guard with type predicate
export function isContentVersion(value: unknown): value is ContentVersion {
  if (!value || typeof value !== 'object') return false;

  const v = value as any;
  return (
    typeof v.id === 'number' &&
    typeof v.site_id === 'number' &&
    isContentType(v.content_type) &&
    typeof v.version_number === 'number'
  );
}

// Usage with type narrowing
if (isContentVersion(data)) {
  // TypeScript knows data is ContentVersion
  processVersion(data);
}
```

### Site Isolation Pattern
**Multi-tenant data isolation at type level**

```typescript
// Compile-time enforcement
export type SiteScopedQuery<T> = T & {
  site_id: number; // Required
  __site_isolation_enforced: true; // Phantom type
};

// Runtime enforcement
export function ensureSiteIsolation<T extends object>(
  query: T,
  allowed_sites: number[]
): T & { site_id: number } {
  if (!('site_id' in query)) {
    throw new Error('Site context required');
  }
  // Validate site access
  return query as T & { site_id: number };
}
```

### Discriminated Union Pattern
**Type-safe state machines for versions**

```typescript
export type DraftVersion = ContentVersion & {
  version_type: VersionType.DRAFT;
  is_current_draft: true;
  published_at: null;
};

export type PublishedVersion = ContentVersion & {
  version_type: VersionType.PUBLISHED;
  published_at: Date; // Non-null
};

// Type narrowing
function isDraftVersion(v: ContentVersion): v is DraftVersion {
  return v.version_type === VersionType.DRAFT;
}
```

### Input Sanitization Pattern
**Security-focused input cleaning**

```typescript
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

export function sanitizeFilePath(path: string): string {
  return path
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_\-./]/g, '');
}
```

## Backend Patterns

### API Route Pattern
**Standard structure for all route handlers**

```typescript
// backend/src/routes/{resource}.ts
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { auth } from '../middleware/auth';
import { validation } from '../middleware/validation';
import { pool } from '../utils/database';

const router = Router();

// Validation Schema
const createSchema = Joi.object({
  name: Joi.string().required().max(100),
  description: Joi.string().optional()
});

// GET /api/{resource}
router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM resources WHERE domain_id = $1',
      [req.domain?.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/{resource}
router.post('/',
  auth,
  validation(createSchema),
  async (req: Request, res: Response) => {
    // Implementation
  }
);

export default router;
```

---

### Service Layer Pattern
**Business logic separation**

```typescript
// backend/src/services/{resource}Service.ts
import { pool } from '../utils/database';

export class ResourceService {
  static async findByDomain(domainId: number) {
    const { rows } = await pool.query(
      'SELECT * FROM resources WHERE domain_id = $1',
      [domainId]
    );
    return rows;
  }

  static async create(data: CreateResourceDto) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Multiple operations in transaction
      const resource = await client.query('INSERT...');
      const audit = await client.query('INSERT INTO audit_log...');

      await client.query('COMMIT');
      return resource.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

---

### Error Handling Pattern
**Consistent error responses**

```typescript
// backend/src/utils/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any
  ) {
    super(message);
  }
}

// Usage in routes
router.post('/', async (req, res, next) => {
  try {
    // ... operation
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
        details: error.details
      });
    }
    next(error); // Pass to global error handler
  }
});
```

---

### Database Query Pattern
**Parameterized queries with type safety**

```typescript
// backend/src/utils/database.ts
interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

// Type-safe query helper
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query(text, params);
}

// Usage
interface User {
  id: number;
  email: string;
  role: string;
}

const { rows } = await query<User>(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
```

---

## Frontend Patterns

### API Service Pattern
**Consistent API communication**

```typescript
// frontend/src/services/{resource}.ts
import axios from 'axios';
import { authStore } from '@/lib/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance with interceptors
const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = authStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Service methods
export const resourceService = {
  async getAll() {
    const { data } = await apiClient.get<Resource[]>('/resources');
    return data;
  },

  async getById(id: number) {
    const { data } = await apiClient.get<Resource>(`/resources/${id}`);
    return data;
  },

  async create(resource: CreateResourceDto) {
    const { data } = await apiClient.post<Resource>('/resources', resource);
    return data;
  },

  async update(id: number, resource: UpdateResourceDto) {
    const { data } = await apiClient.put<Resource>(`/resources/${id}`, resource);
    return data;
  },

  async delete(id: number) {
    await apiClient.delete(`/resources/${id}`);
  },
};
```

---

### React Query Pattern
**Data fetching with caching**

```typescript
// frontend/src/hooks/useResources.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resourceService } from '@/services/resources';
import toast from 'react-hot-toast';

// Query keys
const RESOURCE_KEYS = {
  all: ['resources'] as const,
  lists: () => [...RESOURCE_KEYS.all, 'list'] as const,
  list: (filters: string) => [...RESOURCE_KEYS.lists(), { filters }] as const,
  details: () => [...RESOURCE_KEYS.all, 'detail'] as const,
  detail: (id: number) => [...RESOURCE_KEYS.details(), id] as const,
};

// Fetch hook
export function useResources() {
  return useQuery({
    queryKey: RESOURCE_KEYS.lists(),
    queryFn: resourceService.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create hook with optimistic update
export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resourceService.create,
    onMutate: async (newResource) => {
      await queryClient.cancelQueries(RESOURCE_KEYS.lists());
      const previousResources = queryClient.getQueryData(RESOURCE_KEYS.lists());

      queryClient.setQueryData(RESOURCE_KEYS.lists(), (old: Resource[]) => [
        ...old,
        { ...newResource, id: Date.now() } // Temporary ID
      ]);

      return { previousResources };
    },
    onError: (err, newResource, context) => {
      queryClient.setQueryData(RESOURCE_KEYS.lists(), context?.previousResources);
      toast.error('Failed to create resource');
    },
    onSuccess: () => {
      queryClient.invalidateQueries(RESOURCE_KEYS.lists());
      toast.success('Resource created successfully');
    },
  });
}
```

---

### Form Pattern with React Hook Form
**Consistent form handling**

```tsx
// frontend/src/components/forms/ResourceForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Validation schema
const resourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  status: z.enum(['draft', 'published']),
});

type ResourceFormData = z.infer<typeof resourceSchema>;

interface ResourceFormProps {
  onSubmit: (data: ResourceFormData) => Promise<void>;
  defaultValues?: Partial<ResourceFormData>;
}

export function ResourceForm({ onSubmit, defaultValues }: ResourceFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues,
  });

  const handleFormSubmit = async (data: ResourceFormData) => {
    try {
      await onSubmit(data);
      reset();
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <div>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          {...register('name')}
          className={errors.name ? 'error' : ''}
        />
        {errors.name && <span>{errors.name.message}</span>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

---

### Protected Route Pattern
**Authentication-based routing**

```tsx
// frontend/src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

// Usage in App.tsx
<Route
  path="/admin/*"
  element={
    <ProtectedRoute requiredRole="admin">
      <AdminLayout />
    </ProtectedRoute>
  }
/>
```

---

## Database Patterns

### Migration Pattern
**Safe schema changes**

```sql
-- migrations/001_add_feature.sql
BEGIN;

-- Add column with default
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_featured
ON posts(featured)
WHERE featured = TRUE;

-- Update existing data if needed
UPDATE posts SET featured = FALSE WHERE featured IS NULL;

-- Add constraint after data is clean
ALTER TABLE posts
ALTER COLUMN featured SET NOT NULL;

COMMIT;
```

---

### Multi-tenant Query Pattern
**Domain isolation in queries**

```sql
-- Always filter by domain_id
SELECT p.*, c.name as category_name
FROM posts p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.domain_id = $1
  AND p.status = 'published'
  AND p.deleted_at IS NULL
ORDER BY p.created_at DESC
LIMIT $2 OFFSET $3;

-- Create view for common queries
CREATE VIEW domain_posts AS
SELECT p.*, d.hostname
FROM posts p
JOIN domains d ON p.domain_id = d.id
WHERE d.is_active = TRUE;
```

---

## Testing Patterns

### Backend Test Pattern
**Consistent test structure**

```typescript
// backend/src/__tests__/routes/resources.test.ts
import request from 'supertest';
import { app } from '../../index';
import { pool } from '../../utils/database';
import { generateToken } from '../../utils/jwt';

describe('Resources API', () => {
  let authToken: string;

  beforeAll(async () => {
    // Setup test data
    await pool.query('INSERT INTO test_user...');
    authToken = generateToken({ id: 1, role: 'admin' });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM resources WHERE...');
    await pool.end();
  });

  describe('GET /api/resources', () => {
    it('should return resources for authenticated user', async () => {
      const response = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeArray();
      expect(response.body[0]).toHaveProperty('id');
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .get('/api/resources')
        .expect(401);
    });
  });
});
```

---

### Frontend Test Pattern
**Component testing approach**

```tsx
// frontend/src/__tests__/components/ResourceList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { ResourceList } from '@/components/ResourceList';
import * as resourceService from '@/services/resources';

// Mock service
vi.mock('@/services/resources');

describe('ResourceList', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display resources', async () => {
    const mockResources = [
      { id: 1, name: 'Resource 1' },
      { id: 2, name: 'Resource 2' },
    ];

    vi.mocked(resourceService.getAll).mockResolvedValue(mockResources);

    render(<ResourceList />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Resource 1')).toBeInTheDocument();
      expect(screen.getByText('Resource 2')).toBeInTheDocument();
    });
  });
});
```

---

## Naming Conventions

### File Naming
```
Routes:         camelCase.ts       (posts.ts)
Components:     PascalCase.tsx     (PostList.tsx)
Hooks:          useCamelCase.ts    (usePostData.ts)
Utils:          camelCase.ts       (formatDate.ts)
Types:          PascalCase.ts      (PostTypes.ts)
Tests:          *.test.ts/tsx      (posts.test.ts)
```

### Variable Naming
```typescript
// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Interfaces/Types
interface UserProfile {
  firstName: string;
  lastName: string;
}

// Functions
function calculateTotal(items: Item[]): number {
  // ...
}

// React Components
function UserCard({ user }: UserCardProps) {
  // ...
}

// Boolean variables
const isLoading = true;
const hasPermission = false;
const canEdit = true;
```

### API Endpoint Naming
```
GET    /api/resources           # List
GET    /api/resources/:id       # Get one
POST   /api/resources           # Create
PUT    /api/resources/:id       # Update
DELETE /api/resources/:id       # Delete
POST   /api/resources/:id/publish  # Action
```

---

## Multi-Tenant Data Isolation Pattern (SF-001)

### Organization Context Middleware
**Use Case**: Enforce organization-scoped queries automatically
**Implementation**: Set PostgreSQL session variable per request

```javascript
// Middleware: Set organization context
async function setOrganizationContext(req, res, next) {
  if (!req.user || !req.user.organizationId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Set PostgreSQL session variable
  await db.query(
    'SET app.current_organization_id = $1',
    [req.user.organizationId]
  );

  next();
}

// Apply to all protected routes
app.use('/api/*', authenticateToken, setOrganizationContext);
```

**Benefits**:
- Row-Level Security (RLS) automatically filters queries
- No need to add `WHERE organization_id = ?` to every query
- Defense-in-depth security (database-enforced)
- Works with raw SQL, ORMs, and query builders

**Row-Level Security Policy**:
```sql
CREATE POLICY org_isolation_sites ON sites
  USING (organization_id = current_setting('app.current_organization_id', true)::int);
```

---

## Atomic Quota Enforcement Pattern (SF-001)

### Database-Level Quota Checking
**Use Case**: Prevent quota bypass via race conditions
**Implementation**: PostgreSQL function with row-level locking

```javascript
// Service layer
async function createSite(organizationId, siteData) {
  // Start transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check and increment quota atomically
    const quotaResult = await client.query(
      'SELECT check_and_increment_quota($1, $2, $3)',
      [organizationId, 'sites', 1]
    );

    if (!quotaResult.rows[0].check_and_increment_quota) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'Site quota exceeded. Please upgrade your plan.',
        code: 'QUOTA_EXCEEDED'
      };
    }

    // Create site
    const site = await client.query(
      'INSERT INTO sites (name, organization_id) VALUES ($1, $2) RETURNING *',
      [siteData.name, organizationId]
    );

    await client.query('COMMIT');
    return { success: true, data: site.rows[0] };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**PostgreSQL Function**:
```sql
CREATE FUNCTION check_and_increment_quota(
  org_id INTEGER,
  quota_dimension VARCHAR(50),
  increment_amount BIGINT DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  current_val BIGINT;
  limit_val BIGINT;
BEGIN
  -- Lock row for update (prevents race conditions)
  SELECT current_usage, quota_limit INTO current_val, limit_val
  FROM usage_quotas
  WHERE organization_id = org_id AND dimension = quota_dimension
  FOR UPDATE;

  -- Check if within limit
  IF current_val + increment_amount > limit_val THEN
    RETURN FALSE;
  END IF;

  -- Increment usage atomically
  UPDATE usage_quotas
  SET current_usage = current_usage + increment_amount,
      updated_at = NOW()
  WHERE organization_id = org_id AND dimension = quota_dimension;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

**Key Features**:
- `SELECT FOR UPDATE` locks the row
- Atomic check + increment in single transaction
- Returns boolean for easy handling
- No race conditions possible

**Error Handling**:
```javascript
// Client-side handling
try {
  const result = await createSite(orgId, siteData);
  if (!result.success) {
    if (result.code === 'QUOTA_EXCEEDED') {
      // Show upgrade prompt
      showUpgradeModal();
    } else {
      showError(result.error);
    }
  }
} catch (error) {
  showError('Failed to create site');
}
```

---

## RBAC Permission Check Pattern (SF-001)

### Database-Level Permission Validation
**Use Case**: Fast, consistent permission checking
**Implementation**: PostgreSQL function with role hierarchy

```javascript
// Service layer
async function checkPermission(organizationId, userId, permission) {
  const result = await db.query(
    'SELECT user_has_permission($1, $2, $3) AS allowed',
    [organizationId, userId, permission]
  );

  return result.rows[0].allowed;
}

// Middleware
async function requirePermission(permission) {
  return async (req, res, next) => {
    const allowed = await checkPermission(
      req.user.organizationId,
      req.user.id,
      permission
    );

    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        requiredPermission: permission
      });
    }

    next();
  };
}

// Usage
app.post('/api/sites',
  authenticateToken,
  requirePermission('create_sites'),
  createSite
);
```

**PostgreSQL Function**:
```sql
CREATE FUNCTION user_has_permission(
  org_id INTEGER,
  user_id_param INTEGER,
  required_permission VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  user_role VARCHAR(50);
BEGIN
  -- Get user's role
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = org_id AND user_id = user_id_param;

  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Permission matrix (hierarchical)
  CASE required_permission
    WHEN 'manage_billing' THEN
      RETURN user_role = 'owner';
    WHEN 'invite_users' THEN
      RETURN user_role IN ('owner', 'admin');
    WHEN 'create_sites' THEN
      RETURN user_role IN ('owner', 'admin');
    WHEN 'create_posts' THEN
      RETURN user_role IN ('owner', 'admin', 'editor');
    WHEN 'publish_posts' THEN
      RETURN user_role IN ('owner', 'admin', 'editor', 'publisher');
    WHEN 'view_posts' THEN
      RETURN TRUE; -- All roles can view
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql;
```

**Benefits**:
- Single source of truth for permissions
- Fast lookups (<5ms)
- Hierarchical role model
- Easy to extend with new permissions

---

## Foreign Key Cascade Pattern (SF-001)

### Smart Cascade Rules for Multi-Tenant Data
**Use Case**: Automatic cleanup without data loss
**Implementation**: Different cascade rules per relationship type

```sql
-- CASCADE: Organization owns this data, delete it
CREATE TABLE usage_quotas (
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE
);

-- SET NULL: Keep audit record, remove reference
CREATE TABLE subscription_events (
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL
);

-- RESTRICT: Critical reference, prevent deletion
CREATE TABLE organizations (
  owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT
);
```

**Decision Matrix**:
| Data Type | Rule | Rationale |
|-----------|------|-----------|
| Quotas | CASCADE | Organization-owned, no value without org |
| Members | CASCADE | Membership tied to organization |
| Audit Logs | SET NULL | Keep history, anonymize org reference |
| Owner | RESTRICT | Must transfer ownership before delete |

**Usage Pattern**:
```javascript
// Delete organization
async function deleteOrganization(organizationId, userId) {
  try {
    // Check if user is owner
    const org = await db.query(
      'SELECT owner_id FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (org.rows[0].owner_id !== userId) {
      return { success: false, error: 'Only owner can delete organization' };
    }

    // Delete will CASCADE to quotas, members, etc.
    // Will SET NULL on audit logs
    // Will RESTRICT if owner_id referenced elsewhere
    await db.query('DELETE FROM organizations WHERE id = $1', [organizationId]);

    return { success: true };
  } catch (error) {
    if (error.code === '23503') { // Foreign key violation
      return { success: false, error: 'Cannot delete: referenced by other records' };
    }
    throw error;
  }
}
```

---

## Migration Versioning Pattern (SF-001)

### Sequential, Reversible Database Migrations
**Use Case**: Safe, trackable schema changes
**Implementation**: Numbered SQL files with rollback

**File Naming Convention**:
```
backend/migrations/
├── 001_create_organizations.sql
├── 002_create_subscriptions.sql
├── 003_create_usage_quotas.sql
├── 004_create_organization_members.sql
└── 005_add_organization_id_to_content.sql
```

**Migration Template**:
```sql
-- Migration: 001_create_table.sql
-- Epic: EPIC-003 SaaS Foundation (SF-001)
-- Purpose: [Description]
-- Created: [Date]

-- Create table
CREATE TABLE IF NOT EXISTS table_name (
  id SERIAL PRIMARY KEY,
  -- columns...
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_table_field ON table_name(field);

-- Comments for documentation
COMMENT ON TABLE table_name IS 'Purpose and usage';
```

**Rollback Script** (separate file):
```sql
-- Rollback: 001_rollback_create_table.sql
DROP INDEX IF EXISTS idx_table_field;
DROP TABLE IF EXISTS table_name CASCADE;
```

**Migration Runner**:
```bash
#!/bin/bash
# run_migrations.sh
migrations=(
  "001_create_organizations.sql"
  "002_create_subscriptions.sql"
  # ...
)

for migration in "${migrations[@]}"; do
  echo "Running: $migration"
  psql -U postgres -d cms_db -f "$migration" || exit 1
done
```

**Benefits**:
- Sequential execution prevents dependency issues
- IF NOT EXISTS allows idempotent reruns
- Rollback scripts enable safe reversions
- Comments document intent for future developers

## RBAC Pattern (SF-007)

### Permission-Based Access Control
**Role-based access control for organization-scoped resources**

```typescript
// 1. Define permissions and roles
export enum Permission {
  MANAGE_BILLING = 'manage_billing',
  CREATE_POSTS = 'create_posts',
  // ... more permissions
}

export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  // ... more roles
}

// 2. Define permissions matrix
export const PERMISSIONS_MATRIX: Record<Permission, Set<OrganizationRole>> = {
  [Permission.MANAGE_BILLING]: new Set([OrganizationRole.OWNER]),
  [Permission.CREATE_POSTS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
  ]),
  // ... more mappings
};

// 3. Helper function for permission checks
export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS_MATRIX[permission];
  return allowedRoles ? allowedRoles.has(role) : false;
}
```

### Middleware Usage
**Three enforcement modes: single, any, all**

```typescript
import { requirePermission, requireAnyPermission, requireAllPermissions } from '../middleware/rbac';
import { Permission } from '../config/permissions';

// Single permission - user must have this exact permission
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

### Organization Context Resolution
**Priority: req.organizationId > params.organizationId > body.organizationId**

```typescript
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Check authentication
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 2. Resolve organization ID with priority chain
    const organizationId =
      req.organizationId ||
      parseInt(req.params.organizationId) ||
      parseInt(req.body.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // 3. Check permission
    const hasAccess = await checkPermission(organizationId, req.user.userId, permission);

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Permission denied',
        required: permission,
      });
    }

    // 4. Attach organizationId to request for downstream handlers
    req.organizationId = organizationId;

    next();
  };
}
```

### Permission Caching Pattern
**In-memory cache with TTL and automatic cleanup**

```typescript
class PermissionCache {
  private cache: Map<string, CacheEntry>;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.cache = new Map();
    // Cleanup expired entries every minute
    // Use unref() so timer doesn't prevent process exit (important for tests)
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    this.cleanupTimer.unref();
  }

  get(organizationId: number, userId: number): OrganizationRole | null {
    const key = `${organizationId}:${userId}`;
    const entry = this.cache.get(key);

    if (!entry || Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.role;
  }

  set(organizationId: number, userId: number, role: OrganizationRole): void {
    const key = `${organizationId}:${userId}`;
    this.cache.set(key, {
      role,
      timestamp: Date.now(),
    });
  }

  // Invalidation methods for cache management
  invalidate(organizationId: number, userId: number): void {
    const key = `${organizationId}:${userId}`;
    this.cache.delete(key);
  }

  invalidateOrganization(organizationId: number): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${organizationId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // Stop the cleanup timer and clear cache
  // Call this in test teardown to prevent event loop hanging
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }
}
```

**Important**: The `unref()` call on the cleanup timer is critical to prevent Jest from hanging. Without it, the timer keeps the Node.js event loop active, causing tests to never exit.

### Cache Invalidation Strategy
**Invalidate cache when roles change to prevent stale permissions**

```typescript
// In MemberService after updating member role
async updateMemberRole(input: UpdateMemberRoleInput): Promise<ServiceResponse<OrganizationMember>> {
  // ... update role in database ...
  await client.query('COMMIT');

  // CRITICAL: Invalidate permission cache for this user (security: prevent stale permissions)
  permissionCache.invalidate(input.organizationId, targetMember.user_id);

  // Emit event for external handlers
  this.emit('member:role_updated', {
    memberId,
    organizationId,
    userId: targetMember.user_id,
    oldRole: targetMember.role,
    newRole,
    updatedBy: actorId,
  });

  return { success: true, data: updated };
}

// In MemberService after removing member
async removeMember(organizationId: number, memberId: number, actorId: number): Promise<ServiceResponse<void>> {
  // ... soft delete member ...
  await client.query('COMMIT');

  // Invalidate permission cache for this user (security: prevent stale permissions)
  permissionCache.invalidate(organizationId, targetMember.user_id);

  return { success: true };
}

// In OrganizationService after ownership transfer
async transferOwnership(
  organizationId: number,
  newOwnerId: number,
  currentOwnerId: number
): Promise<ServiceResponse<Organization>> {
  // ... update owner_id and member roles ...
  await client.query('COMMIT');

  // Invalidate permission cache for both users (security: prevent stale roles)
  permissionCache.invalidate(organizationId, currentOwnerId); // Old owner now admin
  permissionCache.invalidate(organizationId, newOwnerId);     // New owner now owner

  return { success: true, data: updated };
}
```

**Security Note**: Cache invalidation must happen immediately after role changes are committed to prevent unauthorized access windows. Without invalidation, demoted users retain elevated permissions until the 5-minute TTL expires.

### Performance Monitoring
**Track slow permission checks**

```typescript
export async function checkPermission(
  organizationId: number,
  userId: number,
  permission: Permission
): Promise<boolean> {
  const startTime = Date.now();

  try {
    // ... permission check logic ...

    // Log performance (target: <20ms)
    const duration = Date.now() - startTime;
    if (duration > 20) {
      console.warn(
        `[RBAC] Slow permission check: ${duration}ms (orgId: ${organizationId}, userId: ${userId}, permission: ${permission})`
      );
    }

    return hasAccess;
  } catch (error) {
    console.error('[RBAC] Error checking permission:', error);
    return false;
  }
}
```

### JWT Integration
**Include organizationId in JWT payload**

```typescript
export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  organizationId?: number; // Optional organization context
}

// Generate token with organization context
const token = generateToken({
  userId: user.id,
  email: user.email,
  role: user.role,
  organizationId: user.active_organization_id, // Include if user has active org
});
```

### Testing Pattern
**Mock OrganizationService for isolated tests**

```typescript
jest.mock('../../services/OrganizationService', () => ({
  organizationService: {
    getMemberRole: jest.fn(),
  },
}));

describe('RBAC Middleware', () => {
  beforeEach(() => {
    // Clear cache before each test
    permissionCache.clear();
    jest.clearAllMocks();
  });

  it('should allow access when user has permission', async () => {
    (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
      success: true,
      data: OrganizationRole.ADMIN,
    });

    const middleware = requirePermission(Permission.MANAGE_MEMBERS);
    await middleware(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });
});
```

**Benefits**:
- Centralized permission management
- Type-safe permission definitions
- Performance-optimized with caching
- Clear separation of concerns
- Easily testable with mocks
- Scalable to Redis for distributed systems
- Comprehensive audit trail via events

---

## SendGrid Email Integration Pattern (SF-013)

### Transactional Email Service
**Purpose**: Reliable email delivery via SendGrid with test mode support

```typescript
import { emailService, EmailSendResult } from './services/EmailService';

// Initialize (auto-detects SENDGRID_API_KEY from environment)
emailService.initialize();

// Or initialize with explicit config
emailService.initialize({
  apiKey: 'SG.your-api-key',
  fromEmail: 'noreply@dprogres.com',
  fromName: 'DProgres CMS',
  testMode: false, // Set true for development
});
```

### Test Mode Pattern
**Automatically enabled when no API key or in development**

```typescript
// Test mode behavior:
// 1. Logs email details instead of sending
// 2. Returns success with mock messageId
// 3. Emits events for testing
// 4. Records delivery logs

const result = await emailService.sendEmail({
  to: [{ email: 'test@example.com' }],
  subject: 'Test',
  html: '<p>Test content</p>',
});

// Check if running in test mode
if (emailService.isTestMode()) {
  console.log('Running in test mode - emails will be logged');
}

// Access delivery logs for testing
const logs = emailService.getDeliveryLogs(50);
expect(logs[0].status).toBe('sent');
emailService.clearDeliveryLogs(); // Clear after test
```

### HTML Email with Plain Text Fallback
**Always provide both for accessibility**

```typescript
const result = await emailService.sendEmail({
  to: [{ email: 'user@example.com', name: 'John Doe' }],
  subject: 'Welcome to DProgres CMS',
  html: `
    <h1>Welcome, John!</h1>
    <p>Your account has been created.</p>
  `,
  text: 'Welcome, John! Your account has been created.',
});
```

### Dynamic Template Pattern
**Use SendGrid dynamic templates for complex emails**

```typescript
const result = await emailService.sendEmail({
  to: [{ email: 'user@example.com' }],
  subject: 'Your Weekly Report',
  templateId: 'd-xxxxxxxxxxxxx', // SendGrid template ID
  dynamicData: {
    firstName: 'John',
    reportDate: new Date().toLocaleDateString(),
    metrics: {
      views: 1234,
      posts: 5,
    },
  },
});
```

### Event-Driven Email Tracking
**Listen for delivery events**

```typescript
// Track sent emails
emailService.on('email:sent', (data) => {
  console.log(`Email sent: ${data.messageId}`);
  console.log(`Recipients: ${data.to.join(', ')}`);
  if (data.testMode) {
    console.log('(Test mode - not actually sent)');
  }
});

// Track failures
emailService.on('email:failed', (data) => {
  console.error(`Email failed: ${data.error}`);
  await alertService.notify({
    type: 'email_failure',
    recipients: data.to,
    error: data.error,
  });
});
```

### Quota Warning Email Pattern
**Built-in templates for quota notifications (SF-012)**

```typescript
import { emailService, QuotaWarningEmailData } from './services/EmailService';
import { quotaService } from './services/QuotaService';

// Option 1: Automatic subscription (recommended)
emailService.initialize();
emailService.subscribeToQuotaWarnings(quotaService);

// Option 2: Manual handling for custom logic
quotaService.on('quota:warning', async (event) => {
  const emailData: QuotaWarningEmailData = {
    organizationId: event.organizationId,
    dimension: event.dimension,
    dimensionLabel: emailService.getDimensionLabel(event.dimension),
    percentage: event.percentage,
    current: event.current,
    limit: event.limit,
    remaining: event.remaining,
    timestamp: event.timestamp,
  };

  // Generate responsive HTML email
  const html = emailService.generateQuotaWarningHtml(emailData);
  const text = emailService.generateQuotaWarningText(emailData);

  // Send to organization admins
  const admins = await getOrganizationAdmins(event.organizationId);
  await emailService.sendEmail({
    to: admins.map(a => ({ email: a.email, name: a.name })),
    subject: emailService.getQuotaWarningSubject(emailData),
    html,
    text,
  });
});
```

### CC/BCC and Reply-To Pattern
**Support for additional recipients**

```typescript
await emailService.sendEmail({
  to: [{ email: 'primary@example.com', name: 'Primary Contact' }],
  cc: [
    { email: 'manager@example.com', name: 'Manager' },
    { email: 'team@example.com' },
  ],
  bcc: [{ email: 'audit@example.com' }],
  replyTo: 'support@example.com',
  subject: 'Team Update',
  html: '<p>Update content</p>',
});
```

### Error Handling Pattern
**Graceful degradation with detailed error info**

```typescript
const result = await emailService.sendEmail({
  to: [{ email: 'user@example.com' }],
  subject: 'Test',
  html: '<p>Content</p>',
});

if (!result.success) {
  // result.error contains user-friendly error message
  // result.statusCode contains HTTP status from SendGrid
  console.error(`Email failed: ${result.error}`);

  // Log for debugging
  if (result.statusCode === 401) {
    console.error('Invalid API key - check SENDGRID_API_KEY');
  } else if (result.statusCode === 429) {
    console.error('Rate limited - consider retry with backoff');
  }
}
```

### Environment Configuration
**Required environment variables**

```bash
# SendGrid Configuration (SF-013)
SENDGRID_API_KEY=SG.your-api-key-here  # Required for production
SENDGRID_FROM_EMAIL=noreply@dprogres.com
SENDGRID_FROM_NAME=DProgres CMS
```

### Testing Pattern
**Mock SendGrid for unit tests**

```typescript
// In test file
const mockSend = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: mockSend,
  default: { setApiKey: jest.fn(), send: mockSend },
}));

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailService();
    emailService.initialize({ apiKey: 'SG.test', testMode: false });
  });

  it('should send email via SendGrid', async () => {
    mockSend.mockResolvedValueOnce([{
      statusCode: 202,
      headers: { 'x-message-id': 'test-123' },
    }, {}]);

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('test-123');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: 'test@example.com', name: undefined }],
        subject: 'Test',
        html: '<p>Test</p>',
      })
    );
  });
});
```

**Benefits**:
- **Automatic test mode**: No API key needed in development
- **Event-driven tracking**: Monitor delivery success/failure
- **Built-in templates**: Quota warning emails ready to use
- **Delivery logging**: Track all email attempts
- **Type-safe**: Full TypeScript support
- **Graceful errors**: User-friendly error messages

---

## Email Template Pattern (SF-014)

### Centralized Email Template Service
**Purpose**: Consistent, branded email templates for SaaS lifecycle events

```typescript
import { emailTemplateService } from './services/EmailTemplateService';
import { emailService } from './services/EmailService';

// Generate email content from template
const { html, text, subject } = emailTemplateService.generateTemplate('welcome_email', {
  user_name: 'John Doe',
  organization_name: 'Acme Corp',
  login_url: 'https://app.example.com/login',
});

// Send via EmailService
await emailService.sendEmail({
  to: [{ email: 'john@acme.com', name: 'John Doe' }],
  subject,
  html,
  text,
});
```

### Template Variable Interpolation
**Simple {{variable}} syntax for dynamic content**

```typescript
// Built-in interpolation method
const result = emailTemplateService.interpolate(
  'Hello {{name}}, your quota is at {{percentage}}%',
  { name: 'John', percentage: 90 }
);
// Result: "Hello John, your quota is at 90%"

// Handles missing variables gracefully (returns empty string)
const safe = emailTemplateService.interpolate(
  '{{greeting}}, {{name}}!',
  { name: 'John' }
);
// Result: ", John!"

// Converts non-string values to strings
const numbers = emailTemplateService.interpolate(
  'Count: {{count}}, Active: {{active}}',
  { count: 42, active: true }
);
// Result: "Count: 42, Active: true"
```

### Branding Configuration Pattern
**Consistent visual identity across all templates**

```typescript
// Option 1: Constructor configuration
const templateService = new EmailTemplateService({
  companyName: 'My CMS',
  primaryColor: '#ff5500',
  supportEmail: 'help@mycms.com',
  dashboardUrl: 'https://app.mycms.com',
  upgradeUrl: 'https://app.mycms.com/upgrade', // Configurable
});

// Option 2: Runtime update
emailTemplateService.updateBranding({
  companyName: 'Rebranded CMS',
  primaryColor: '#00ff00',
});

// Option 3: Environment variables (defaults)
// EMAIL_COMPANY_NAME=My CMS
// EMAIL_PRIMARY_COLOR=#2563eb
// EMAIL_SUPPORT_EMAIL=support@example.com
// EMAIL_DASHBOARD_URL=https://app.example.com
// EMAIL_UPGRADE_URL=https://app.example.com/billing/upgrade
```

### Template Type Safety Pattern
**TypeScript interfaces for each template type**

```typescript
import {
  SaaSEmailTemplate,
  WelcomeEmailVariables,
  PaymentFailedVariables,
  QuotaWarningVariables,
} from './services/EmailTemplateService';

// Type-safe template generation
function sendWelcome(user: User, org: Organization) {
  const variables: WelcomeEmailVariables = {
    user_name: user.name,
    user_email: user.email,
    organization_name: org.name,
    login_url: `https://app.example.com/login`,
    getting_started_url: `https://docs.example.com/start`,
  };

  return emailTemplateService.generateTemplate('welcome_email', variables);
}

// All 8 template types have specific interfaces:
// - WelcomeEmailVariables
// - SubscriptionConfirmationVariables
// - PaymentReceiptVariables
// - PaymentFailedVariables
// - QuotaWarningVariables
// - QuotaExceededVariables
// - MemberInviteVariables
// - SubscriptionCanceledVariables
```

### Convenience Methods Pattern (EmailService Integration)
**Pre-built methods for each template type**

```typescript
import { emailService } from './services/EmailService';

// Each template has a dedicated method
await emailService.sendWelcomeEmail(
  [{ email: 'user@example.com', name: 'User' }],
  { user_name: 'User', organization_name: 'Acme' }
);

await emailService.sendPaymentFailed(
  [{ email: 'billing@example.com' }],
  {
    plan_tier: 'Pro',
    amount: '49.99',
    failure_reason: 'Card declined',
    update_payment_url: 'https://app.example.com/billing/update',
  }
);

await emailService.sendMemberInvite(
  [{ email: 'invitee@example.com' }],
  {
    inviter_name: 'Team Lead',
    organization_name: 'Acme Corp',
    role: 'Editor',
    invite_url: 'https://app.example.com/invite/abc123',
    expires_at: 'January 15, 2025',
  }
);

// Generic method for dynamic template selection
const templateType: SaaSEmailTemplate = getTemplateBasedOnEvent(event);
await emailService.sendTemplatedEmail(templateType, recipients, variables);
```

### Responsive Email Design Pattern
**Inline CSS for email client compatibility**

```typescript
// All templates use inline styles (not external CSS)
// EmailTemplateService automatically wraps content with:
// - Mobile-responsive viewport meta
// - Fallback fonts (-apple-system, Roboto, Arial)
// - Max-width container (600px)
// - Centered layout with padding
// - Footer with company info and copyright

// Template structure:
const html = emailTemplateService.wrapHtml(`
  <div class="header">
    <h1>Welcome!</h1>
  </div>
  <div class="content">
    <p>Your content here...</p>
  </div>
  <!-- Footer automatically added -->
`);
```

### XSS Protection Pattern
**HTML entity escaping for user-provided values**

```typescript
// All user input is automatically escaped in templates
const result = emailTemplateService.generateTemplate('welcome_email', {
  user_name: '<script>alert("xss")</script>',
  organization_name: 'Test & Co <Corp>',
});

// HTML output contains escaped entities:
// &lt;script&gt;alert("xss")&lt;/script&gt;
// Test &amp; Co &lt;Corp&gt;

// Private escape method (used internally):
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
```

### Urgency Level Pattern (Quota Warnings)
**Color-coded warnings for different severity levels**

```typescript
// Quota warning templates use color coding:
// 80% (Notice):  Blue (#2563eb)  - Informational
// 90% (Warning): Orange (#f59e0b) - Action suggested
// 95% (Critical): Red (#dc2626) - Immediate action required

// Template automatically applies styling based on percentage
const warning = emailTemplateService.generateTemplate('quota_warning', {
  quota_dimension: 'Sites',
  quota_percentage: 95, // -> Red "Critical" styling
  current_usage: 95,
  quota_limit: 100,
  remaining: 5,
});

// For 90%+, includes "Action Required" text and upgrade CTA button
// For 80%, includes informational message without urgency
```

### Plain Text Fallback Pattern
**Every template generates both HTML and plain text**

```typescript
const { html, text, subject } = emailTemplateService.generateTemplate('payment_receipt', {
  plan_tier: 'Pro',
  amount: '99.00',
  invoice_number: 'INV-2025-001',
});

// HTML version: Full styling with buttons, badges, etc.
// Text version: Clean text with URLs as plain links
// Both contain identical information, different formatting

// Text version structure:
// - No HTML tags
// - URLs as plain text links
// - Company signature separator (---)
// - Bullet points as dashes
```

### Testing Pattern
**Comprehensive test coverage for templates**

```typescript
describe('EmailTemplateService', () => {
  let templateService: EmailTemplateService;

  beforeEach(() => {
    templateService = new EmailTemplateService();
  });

  it('should generate all 8 templates successfully', () => {
    const templates: SaaSEmailTemplate[] = [
      'welcome_email',
      'subscription_confirmation',
      'payment_receipt',
      'payment_failed',
      'quota_warning',
      'quota_exceeded',
      'member_invite',
      'subscription_canceled',
    ];

    templates.forEach((template) => {
      const result = templateService.generateTemplate(template, getMinimalVariables(template));

      expect(result.subject).toBeTruthy();
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.text).toBeTruthy();
      expect(result.text).not.toMatch(/<[a-z][\s\S]*>/i); // No HTML in text
    });
  });

  it('should escape HTML entities in user input', () => {
    const result = templateService.generateTemplate('welcome_email', {
      user_name: '<script>alert("xss")</script>',
    });

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });

  it('should handle missing optional variables gracefully', () => {
    const result = templateService.generateTemplate('welcome_email', {});

    expect(result.html).toContain('Hi there'); // Default fallback
    expect(result.text).toContain('Hi there');
  });
});
```

**Benefits**:
- **Type-safe templates**: Compile-time validation of template variables
- **Consistent branding**: All emails share visual identity
- **Dual format**: HTML and plain text for all templates
- **XSS protection**: Automatic HTML entity escaping
- **Configurable URLs**: upgrade_url, dashboard_url configurable per environment
- **Urgency levels**: Visual cues for quota warnings
- **Easy testing**: Templates can be unit tested in isolation

---

## Stripe Webhook Handler Pattern (SF-004, SF-015)

### Transaction-Safe Webhook Processing
**Purpose**: Reliable, idempotent webhook handling with database transactions

```typescript
// Main webhook handler with idempotency
export async function handleWebhookEvent(
  event: Stripe.Event,
  client: PoolClient
): Promise<{ processed: boolean; skipped?: boolean }> {
  // 1. Check if already processed (idempotency)
  const existingEvent = await client.query(
    'SELECT id FROM webhook_events WHERE stripe_event_id = $1',
    [event.id]
  );

  if (existingEvent.rows.length > 0) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`);
    return { processed: true, skipped: true };
  }

  // 2. Record event start
  const eventRecord = await client.query(
    `INSERT INTO webhook_events (stripe_event_id, event_type, status, created_at)
     VALUES ($1, $2, 'processing', NOW())
     RETURNING id`,
    [event.id, event.type]
  );
  const eventRecordId = eventRecord.rows[0].id;

  // 3. Route to specific handler
  try {
    switch (event.type) {
      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer, eventRecordId, client);
        break;
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod, eventRecordId, client);
        break;
      // ... more handlers
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // 4. Mark as processed
    await client.query(
      'UPDATE webhook_events SET status = $1, processed_at = NOW() WHERE id = $2',
      ['processed', eventRecordId]
    );

    return { processed: true };
  } catch (error) {
    // 5. Mark as failed (allows retry)
    await client.query(
      'UPDATE webhook_events SET status = $1, error_message = $2, processed_at = NOW() WHERE id = $3',
      ['failed', error.message, eventRecordId]
    );
    throw error;
  }
}
```

### Nested Transaction Pattern with providedClient
**Pass client through nested calls for transaction integrity**

```typescript
// Handler receives client for nested queries
async function handlePaymentMethodAttached(
  paymentMethod: Stripe.PaymentMethod,
  eventRecordId: number,
  providedClient: PoolClient
): Promise<void> {
  const customerId = paymentMethod.customer as string;

  // 1. Look up organization (within transaction)
  const orgResult = await providedClient.query(
    'SELECT id FROM organizations WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (orgResult.rows.length === 0) {
    console.warn(`[Webhook] Organization not found for customer: ${customerId}`);
    return;
  }

  const organizationId = orgResult.rows[0].id;

  // 2. Check for existing payment methods
  const existingMethods = await providedClient.query(
    'SELECT id FROM payment_methods WHERE organization_id = $1 AND deleted_at IS NULL',
    [organizationId]
  );
  const isFirstMethod = existingMethods.rows.length === 0;

  // 3. Insert payment method
  await providedClient.query(
    `INSERT INTO payment_methods (
      organization_id, stripe_payment_method_id, type, last_four,
      exp_month, exp_year, brand, is_default, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (stripe_payment_method_id) DO UPDATE SET
      last_four = EXCLUDED.last_four,
      exp_month = EXCLUDED.exp_month,
      exp_year = EXCLUDED.exp_year,
      brand = EXCLUDED.brand,
      deleted_at = NULL`,
    [
      organizationId,
      paymentMethod.id,
      paymentMethod.type,
      paymentMethod.card?.last4 || null,
      paymentMethod.card?.exp_month || null,
      paymentMethod.card?.exp_year || null,
      paymentMethod.card?.brand || null,
      isFirstMethod, // First payment method becomes default
    ]
  );

  console.log(`[Webhook] Payment method ${paymentMethod.id} attached to org ${organizationId}`);
}
```

### Email Notifications Outside Transaction
**Send emails after transaction commit for reliability**

```typescript
// Route handler pattern: emails outside transaction
router.post('/stripe', async (req: Request, res: Response) => {
  const client = await pool.connect();
  let emailNotifications: Array<() => Promise<void>> = [];

  try {
    await client.query('BEGIN');

    // Process webhook (may queue email notifications)
    const result = await handleWebhookEvent(event, client, (notificationFn) => {
      emailNotifications.push(notificationFn);
    });

    await client.query('COMMIT');

    // Send emails AFTER successful commit
    for (const sendEmail of emailNotifications) {
      try {
        await sendEmail();
      } catch (emailError) {
        // Log but don't fail - webhook was processed
        console.error('[Webhook] Email notification failed:', emailError);
      }
    }

    res.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Handler queues notification instead of sending directly
async function handleTrialWillEnd(
  subscription: Stripe.Subscription,
  eventRecordId: number,
  client: PoolClient,
  queueEmail?: (fn: () => Promise<void>) => void
): Promise<void> {
  // ... database operations within transaction ...

  // Queue email for after commit
  if (queueEmail) {
    queueEmail(async () => {
      await emailService.sendTrialEnding(adminEmails, {
        plan_tier: subscription.items.data[0]?.price?.product?.name || 'Pro',
        trial_end_date: trialEndFormatted,
        days_remaining: 3,
        features_at_risk: ['Priority Support', 'Advanced Analytics'],
      });
    });
  }
}
```

### Soft Delete Pattern for Payment Methods
**Use deleted_at instead of hard delete for audit trail**

```typescript
async function handlePaymentMethodDetached(
  paymentMethod: Stripe.PaymentMethod,
  eventRecordId: number,
  providedClient: PoolClient
): Promise<void> {
  // Soft delete - preserves audit trail
  const result = await providedClient.query(
    `UPDATE payment_methods
     SET deleted_at = NOW(), is_default = false
     WHERE stripe_payment_method_id = $1 AND deleted_at IS NULL
     RETURNING organization_id, is_default`,
    [paymentMethod.id]
  );

  if (result.rows.length === 0) {
    console.log(`[Webhook] Payment method ${paymentMethod.id} not found or already deleted`);
    return;
  }

  // Promote another method to default if this was default
  const { organization_id, is_default } = result.rows[0];
  if (is_default) {
    await providedClient.query(
      `UPDATE payment_methods
       SET is_default = true
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [organization_id]
    );
  }
}
```

### Customer Data Sync Pattern
**Sync Stripe customer updates to local database**

```typescript
async function handleCustomerUpdated(
  customer: Stripe.Customer,
  eventRecordId: number,
  providedClient: PoolClient
): Promise<void> {
  // Only sync non-sensitive fields
  const result = await providedClient.query(
    `UPDATE organizations
     SET
       name = COALESCE($1, name),
       billing_email = COALESCE($2, billing_email),
       updated_at = NOW()
     WHERE stripe_customer_id = $3
     RETURNING id, name`,
    [
      customer.name,
      customer.email,
      customer.id,
    ]
  );

  if (result.rows.length === 0) {
    console.warn(`[Webhook] Organization not found for customer: ${customer.id}`);
    return;
  }

  console.log(`[Webhook] Synced customer data for org ${result.rows[0].id}`);
}
```

### Testing Pattern for Webhooks
**Mock database client and verify transaction integrity**

```typescript
describe('Webhook Handlers', () => {
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    // Reset to default success responses
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('should handle payment_method.attached', async () => {
    // Setup: org lookup returns result
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // org lookup
      .mockResolvedValueOnce({ rows: [] })          // existing methods
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert

    const event = createStripeEvent('payment_method.attached', {
      id: 'pm_123',
      customer: 'cus_123',
      type: 'card',
      card: { last4: '4242', exp_month: 12, exp_year: 2025, brand: 'visa' },
    });

    await handlePaymentMethodAttached(
      event.data.object as Stripe.PaymentMethod,
      1,
      mockClient
    );

    // Verify INSERT was called with correct params
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO payment_methods'),
      expect.arrayContaining(['pm_123', 'card', '4242'])
    );
  });

  it('should handle idempotent retry', async () => {
    // Simulate already-processed event
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 1 }], // Event already exists
    });

    const result = await handleWebhookEvent(event, mockClient);

    expect(result.skipped).toBe(true);
    expect(mockClient.query).toHaveBeenCalledTimes(1); // Only idempotency check
  });
});
```

### Error Handling and Retry
**Mark failed events for retry processing**

```typescript
// Failed events can be retried via admin endpoint
router.post('/webhooks/retry/:eventId', async (req, res) => {
  const { eventId } = req.params;

  const event = await pool.query(
    'SELECT * FROM webhook_events WHERE id = $1 AND status = $2',
    [eventId, 'failed']
  );

  if (event.rows.length === 0) {
    return res.status(404).json({ error: 'Failed event not found' });
  }

  // Re-fetch from Stripe and reprocess
  const stripeEvent = await stripe.events.retrieve(event.rows[0].stripe_event_id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset status for reprocessing
    await client.query(
      'UPDATE webhook_events SET status = $1 WHERE id = $2',
      ['processing', eventId]
    );

    await handleWebhookEvent(stripeEvent, client);
    await client.query('COMMIT');

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
```

**Key Patterns**:
- **Idempotency**: Check stripe_event_id before processing
- **Transaction safety**: All database ops in single transaction
- **providedClient**: Pass client to nested handlers
- **Email after commit**: Queue notifications, send after COMMIT
- **Soft delete**: Use deleted_at for audit trail
- **Status tracking**: processing → processed/failed
- **Error recovery**: Failed events can be retried

**Handled Events (SF-015)**:
| Event | Handler | Action |
|-------|---------|--------|
| `customer.updated` | `handleCustomerUpdated` | Sync name/email to org |
| `payment_method.attached` | `handlePaymentMethodAttached` | Store card details |
| `payment_method.detached` | `handlePaymentMethodDetached` | Soft delete, promote default |
| `customer.subscription.trial_will_end` | `handleTrialWillEnd` | Send 3-day warning email |
| `invoice.upcoming` | `handleInvoiceUpcoming` | Send 7-day renewal notice |