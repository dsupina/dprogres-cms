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
**Proactive threshold notifications with spam prevention (SF-012)**

```typescript
// Listen for quota:warning events (emitted with spam prevention)
quotaService.on('quota:warning', async (event: QuotaWarningEvent) => {
  const { organizationId, dimension, percentage, current, limit, remaining } = event;

  // Send warning email to organization owner
  await emailService.sendQuotaWarning({
    organizationId,
    subject: `${dimension} quota at ${percentage}%`,
    message: `You've used ${current} of ${limit} ${dimension}. ${remaining} remaining.`,
  });

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

  // Alert owner immediately
  await emailService.sendQuotaExceeded({
    organizationId,
    dimension,
  });

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

**Integration with EmailService**:
```typescript
// EmailService subscribes to quota warnings
emailService.subscribeToQuotaWarnings(quotaService);

// Automatically handles quota:warning events
quotaService.on('quota:warning', (event) => {
  this.handleQuotaWarning(event);
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