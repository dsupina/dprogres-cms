# SF-001: Database Schema Migrations

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 1 (Database & Stripe Foundation)
**Priority**: P0 (Blocker - Required for all SaaS features)
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: None
**Assigned To**: Backend Engineer

---

## Objective

Create PostgreSQL schema for multi-tenant SaaS foundation, including organizations, subscriptions, quotas, members, and invites. This foundational database layer enables subscription management, usage tracking, and role-based access control.

---

## Requirements

### Functional Requirements

1. **Multi-Tenant Data Model**:
   - Organizations table with unique slugs
   - Foreign key `organization_id` on all content tables (posts, pages, media, categories)
   - Ensure data isolation between organizations

2. **Subscription Management**:
   - Subscriptions table with Stripe integration fields
   - Invoices table for billing history
   - Payment methods table for card details
   - Subscription events table for audit log

3. **Quota Tracking**:
   - Usage quotas table with dimensions (sites, posts, users, storage_bytes, api_calls)
   - Support for both permanent quotas (sites) and resetting quotas (api_calls)

4. **RBAC (Role-Based Access Control)**:
   - Organization members table with role field (owner, admin, editor, publisher, viewer)
   - Organization invites table for pending invitations

### Non-Functional Requirements

- **Performance**: All queries must support indexes for <50ms response time
- **Data Integrity**: Foreign key constraints prevent orphaned records
- **Audit Trail**: Timestamps on all tables for compliance
- **Scalability**: Schema supports 1,000+ organizations without restructuring

---

## Technical Design

### File Structure

```
backend/migrations/
├── 001_create_organizations.sql
├── 002_create_subscriptions.sql
├── 003_create_usage_quotas.sql
├── 004_create_organization_members.sql
├── 005_add_organization_id_to_content.sql
```

### Migration Scripts

#### 001_create_organizations.sql

```sql
-- Organizations table
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_tier VARCHAR(50) DEFAULT 'free' NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_plan_tier CHECK (plan_tier IN ('free', 'starter', 'pro', 'enterprise'))
);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_plan_tier ON organizations(plan_tier);

-- Add organization context to users table
ALTER TABLE users
  ADD COLUMN current_organization_id INTEGER REFERENCES organizations(id),
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN email_verification_token VARCHAR(255),
  ADD COLUMN email_verification_sent_at TIMESTAMP;

CREATE INDEX idx_users_current_org ON users(current_organization_id);
CREATE INDEX idx_users_email_verification ON users(email_verification_token);

-- Comments
COMMENT ON TABLE organizations IS 'Multi-tenant organizations (workspaces)';
COMMENT ON COLUMN organizations.slug IS 'URL-safe unique identifier for organization';
COMMENT ON COLUMN organizations.plan_tier IS 'Current subscription tier (free, starter, pro, enterprise)';
```

#### 002_create_subscriptions.sql

```sql
-- Subscriptions table
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL,
  billing_cycle VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_plan_tier CHECK (plan_tier IN ('free', 'starter', 'pro', 'enterprise')),
  CONSTRAINT valid_billing_cycle CHECK (billing_cycle IN ('monthly', 'annual')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid')),
  CONSTRAINT valid_amount CHECK (amount_cents >= 0),
  UNIQUE(organization_id) -- One active subscription per organization
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Invoices table
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL,
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  billing_reason VARCHAR(100),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  CONSTRAINT valid_invoice_status CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  CONSTRAINT valid_amount CHECK (amount_cents >= 0 AND amount_paid_cents >= 0)
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_stripe ON invoices(stripe_invoice_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created ON invoices(created_at DESC);

-- Payment methods table
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_type CHECK (type IN ('card', 'sepa_debit', 'us_bank_account')),
  CONSTRAINT valid_card_exp CHECK (
    (card_exp_month IS NULL AND card_exp_year IS NULL) OR
    (card_exp_month BETWEEN 1 AND 12 AND card_exp_year >= EXTRACT(YEAR FROM NOW()))
  )
);

CREATE INDEX idx_payment_methods_org ON payment_methods(organization_id);
CREATE INDEX idx_payment_methods_stripe ON payment_methods(stripe_payment_method_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(organization_id, is_default);

-- Subscription events (audit log)
CREATE TABLE subscription_events (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  processing_error TEXT
);

CREATE INDEX idx_subscription_events_org ON subscription_events(organization_id);
CREATE INDEX idx_subscription_events_subscription ON subscription_events(subscription_id);
CREATE INDEX idx_subscription_events_stripe ON subscription_events(stripe_event_id);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX idx_subscription_events_processed ON subscription_events(processed_at DESC);

-- Comments
COMMENT ON TABLE subscriptions IS 'Stripe subscription records linked to organizations';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'If true, subscription will cancel at period end (no renewal)';
COMMENT ON TABLE subscription_events IS 'Audit log of all Stripe webhook events';
```

#### 003_create_usage_quotas.sql

```sql
-- Usage quotas table
CREATE TABLE usage_quotas (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dimension VARCHAR(50) NOT NULL,
  current_usage BIGINT DEFAULT 0 NOT NULL,
  quota_limit BIGINT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP,
  last_reset_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_dimension CHECK (dimension IN ('sites', 'posts', 'users', 'storage_bytes', 'api_calls')),
  CONSTRAINT valid_usage CHECK (current_usage >= 0),
  CONSTRAINT valid_limit CHECK (quota_limit > 0),
  UNIQUE(organization_id, dimension)
);

CREATE INDEX idx_usage_quotas_org ON usage_quotas(organization_id);
CREATE INDEX idx_usage_quotas_dimension ON usage_quotas(dimension);
CREATE INDEX idx_usage_quotas_period_end ON usage_quotas(period_end) WHERE period_end IS NOT NULL;

-- Function to check quota before increment
CREATE OR REPLACE FUNCTION check_and_increment_quota(
  org_id INTEGER,
  quota_dimension VARCHAR(50),
  increment_amount BIGINT DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  current_val BIGINT;
  limit_val BIGINT;
BEGIN
  -- Lock row for update
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

-- Function to reset monthly quotas (for API calls)
CREATE OR REPLACE FUNCTION reset_monthly_quotas() RETURNS INTEGER AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE usage_quotas
  SET current_usage = 0,
      last_reset_at = NOW(),
      period_start = NOW(),
      updated_at = NOW()
  WHERE dimension = 'api_calls'
    AND period_end IS NOT NULL
    AND period_end < NOW();

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE usage_quotas IS 'Usage tracking per organization per dimension';
COMMENT ON COLUMN usage_quotas.dimension IS 'Quota type: sites, posts, users, storage_bytes, api_calls';
COMMENT ON COLUMN usage_quotas.period_end IS 'NULL for non-resetting quotas (sites, posts), set for monthly resets (api_calls)';
COMMENT ON FUNCTION check_and_increment_quota IS 'Atomically check if quota allows action, then increment. Returns TRUE if allowed.';
```

#### 004_create_organization_members.sql

```sql
-- Organization members table
CREATE TABLE organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'editor', 'publisher', 'viewer')),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(role);

-- Organization invites table
CREATE TABLE organization_invites (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_role CHECK (role IN ('admin', 'editor', 'publisher', 'viewer')),
  CONSTRAINT invite_not_expired CHECK (accepted_at IS NULL OR accepted_at <= expires_at),
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_org_invites_org ON organization_invites(organization_id);
CREATE INDEX idx_org_invites_token ON organization_invites(invite_token);
CREATE INDEX idx_org_invites_email ON organization_invites(email);
CREATE INDEX idx_org_invites_expires ON organization_invites(expires_at);

-- Function to check if user has permission in organization
CREATE OR REPLACE FUNCTION user_has_permission(
  org_id INTEGER,
  user_id_param INTEGER,
  required_permission VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  user_role VARCHAR(50);
BEGIN
  -- Get user's role in organization
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = org_id AND user_id = user_id_param;

  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Permission matrix (simplified - implement full matrix in application layer)
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

-- Comments
COMMENT ON TABLE organization_members IS 'Members of organizations with roles';
COMMENT ON COLUMN organization_members.role IS 'RBAC role: owner, admin, editor, publisher, viewer';
COMMENT ON TABLE organization_invites IS 'Pending invitations to join organization';
```

#### 005_add_organization_id_to_content.sql

```sql
-- Add organization_id to all content tables for multi-tenant isolation

-- Sites
ALTER TABLE sites
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE sites SET organization_id = 1 WHERE organization_id IS NULL; -- Migrate existing data to default org

ALTER TABLE sites ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_sites_organization ON sites(organization_id);

-- Posts
ALTER TABLE posts
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE posts SET organization_id = 1 WHERE organization_id IS NULL;

ALTER TABLE posts ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_posts_organization ON posts(organization_id);

-- Pages
ALTER TABLE pages
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE pages SET organization_id = 1 WHERE organization_id IS NULL;

ALTER TABLE pages ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_pages_organization ON pages(organization_id);

-- Media files
ALTER TABLE media_files
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE media_files SET organization_id = 1 WHERE organization_id IS NULL;

ALTER TABLE media_files ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_media_organization ON media_files(organization_id);

-- Categories
ALTER TABLE categories
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE categories SET organization_id = 1 WHERE organization_id IS NULL;

ALTER TABLE categories ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_categories_organization ON categories(organization_id);

-- Tags (if applicable)
ALTER TABLE tags
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE tags SET organization_id = 1 WHERE organization_id IS NULL;

ALTER TABLE tags ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_tags_organization ON tags(organization_id);

-- Enable Row-Level Security (RLS) for defense-in-depth
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (enforced when app sets current_organization_id)
CREATE POLICY org_isolation_sites ON sites
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

CREATE POLICY org_isolation_posts ON posts
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

CREATE POLICY org_isolation_pages ON pages
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

CREATE POLICY org_isolation_media ON media_files
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

CREATE POLICY org_isolation_categories ON categories
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

-- Comments
COMMENT ON COLUMN sites.organization_id IS 'Foreign key for multi-tenant isolation';
COMMENT ON POLICY org_isolation_sites ON sites IS 'Row-level security: Users can only access their organization data';
```

### Environment Variables

Add to `.env`:

```env
# Default Organization (for data migration)
DEFAULT_ORGANIZATION_ID=1
```

---

## Acceptance Criteria

- [ ] All migration scripts run successfully on fresh database
- [ ] All migration scripts run successfully on existing database with data
- [ ] Organizations table created with unique slug constraint
- [ ] Subscriptions table created with Stripe integration fields
- [ ] Usage quotas table created with dimension constraints
- [ ] Organization members and invites tables created
- [ ] All content tables have `organization_id` foreign key
- [ ] Existing data migrated to default organization (ID = 1)
- [ ] All indexes created for performance (<50ms queries)
- [ ] Row-level security policies created for data isolation
- [ ] PostgreSQL functions work correctly:
  - `check_and_increment_quota()` returns TRUE when quota allows action
  - `check_and_increment_quota()` returns FALSE when quota exceeded
  - `reset_monthly_quotas()` resets API call quotas at period end
  - `user_has_permission()` returns correct permissions based on role
- [ ] Foreign key constraints prevent orphaned records
- [ ] Database schema documented in comments

---

## Testing

### Unit Tests (Database Functions)

```sql
-- Test check_and_increment_quota function
DO $$
DECLARE
  allowed BOOLEAN;
BEGIN
  -- Setup: Create test organization and quota
  INSERT INTO organizations (id, name, slug, owner_id, plan_tier)
  VALUES (999, 'Test Org', 'test-org', 1, 'free');

  INSERT INTO usage_quotas (organization_id, dimension, current_usage, quota_limit, period_start)
  VALUES (999, 'sites', 0, 3, NOW());

  -- Test 1: Should allow first site (0 < 3)
  SELECT check_and_increment_quota(999, 'sites', 1) INTO allowed;
  ASSERT allowed = TRUE, 'Should allow first site';

  -- Verify increment
  ASSERT (SELECT current_usage FROM usage_quotas WHERE organization_id = 999 AND dimension = 'sites') = 1,
    'Usage should be incremented to 1';

  -- Test 2: Should allow second site (1 < 3)
  SELECT check_and_increment_quota(999, 'sites', 1) INTO allowed;
  ASSERT allowed = TRUE, 'Should allow second site';

  -- Test 3: Should allow third site (2 < 3)
  SELECT check_and_increment_quota(999, 'sites', 1) INTO allowed;
  ASSERT allowed = TRUE, 'Should allow third site';

  -- Test 4: Should NOT allow fourth site (3 >= 3)
  SELECT check_and_increment_quota(999, 'sites', 1) INTO allowed;
  ASSERT allowed = FALSE, 'Should block fourth site (quota exceeded)';

  -- Cleanup
  DELETE FROM usage_quotas WHERE organization_id = 999;
  DELETE FROM organizations WHERE id = 999;

  RAISE NOTICE 'All tests passed!';
END $$;
```

### Integration Tests (Data Isolation)

```sql
-- Test multi-tenant data isolation
DO $$
BEGIN
  -- Setup: Create two organizations
  INSERT INTO organizations (id, name, slug, owner_id) VALUES
    (1001, 'Org A', 'org-a', 1),
    (1002, 'Org B', 'org-b', 2);

  -- Create sites for each organization
  INSERT INTO sites (id, name, organization_id) VALUES
    (1001, 'Site A1', 1001),
    (1002, 'Site B1', 1002);

  -- Set current organization context (simulates app setting)
  PERFORM set_config('app.current_organization_id', '1001', false);

  -- Test: Should only see Site A1
  ASSERT (SELECT COUNT(*) FROM sites WHERE organization_id = 1001) = 1,
    'Should see 1 site for Org A';

  ASSERT (SELECT COUNT(*) FROM sites WHERE organization_id = 1002) = 0,
    'Should not see sites for Org B';

  -- Switch context to Org B
  PERFORM set_config('app.current_organization_id', '1002', false);

  -- Test: Should only see Site B1
  ASSERT (SELECT COUNT(*) FROM sites WHERE organization_id = 1002) = 1,
    'Should see 1 site for Org B';

  -- Cleanup
  DELETE FROM sites WHERE id IN (1001, 1002);
  DELETE FROM organizations WHERE id IN (1001, 1002);

  RAISE NOTICE 'Data isolation tests passed!';
END $$;
```

### Manual Testing Checklist

```bash
# 1. Run migrations on fresh database
psql -U postgres -d cms_db_test < backend/migrations/001_create_organizations.sql
psql -U postgres -d cms_db_test < backend/migrations/002_create_subscriptions.sql
psql -U postgres -d cms_db_test < backend/migrations/003_create_usage_quotas.sql
psql -U postgres -d cms_db_test < backend/migrations/004_create_organization_members.sql
psql -U postgres -d cms_db_test < backend/migrations/005_add_organization_id_to_content.sql

# 2. Verify tables created
psql -U postgres -d cms_db_test -c "\dt"
# Should show: organizations, subscriptions, invoices, payment_methods, subscription_events, usage_quotas, organization_members, organization_invites

# 3. Verify indexes created
psql -U postgres -d cms_db_test -c "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;"

# 4. Test quota function
psql -U postgres -d cms_db_test -c "SELECT check_and_increment_quota(1, 'sites', 1);"

# 5. Test permission function
psql -U postgres -d cms_db_test -c "SELECT user_has_permission(1, 1, 'create_sites');"

# 6. Verify existing data migrated
psql -U postgres -d cms_db_test -c "SELECT COUNT(*) FROM sites WHERE organization_id = 1;"
```

---

## Documentation

- [ ] Update `CLAUDE.md` with new database schema overview
- [ ] Add migration instructions to `docs/ARCHITECTURE.md`
- [ ] Document multi-tenant data model in `docs/DECISIONS.md`
- [ ] Create `docs/DATABASE_SCHEMA.md` with full schema reference

### Schema Documentation Template

```markdown
# Database Schema - Multi-Tenant SaaS

## Organizations
- **Purpose**: Multi-tenant workspaces
- **Key Fields**: id, name, slug, owner_id, plan_tier
- **Relationships**: Has many members, subscriptions, quotas, sites, posts

## Subscriptions
- **Purpose**: Stripe subscription tracking
- **Key Fields**: organization_id, stripe_subscription_id, plan_tier, status
- **Lifecycle**: trialing → active → past_due → canceled

## Usage Quotas
- **Purpose**: Track usage per organization per dimension
- **Dimensions**: sites, posts, users, storage_bytes, api_calls
- **Resetting**: api_calls resets monthly, others permanent

## Organization Members
- **Purpose**: RBAC for team collaboration
- **Roles**: owner, admin, editor, publisher, viewer
- **Permissions**: See RBAC matrix in EPIC-003 document
```

---

## Deployment Notes

### Local Development

```bash
# 1. Backup existing database (if applicable)
pg_dump -U postgres cms_db > backup_$(date +%Y%m%d).sql

# 2. Run migrations
cd backend/migrations
psql -U postgres -d cms_db -f 001_create_organizations.sql
psql -U postgres -d cms_db -f 002_create_subscriptions.sql
psql -U postgres -d cms_db -f 003_create_usage_quotas.sql
psql -U postgres -d cms_db -f 004_create_organization_members.sql
psql -U postgres -d cms_db -f 005_add_organization_id_to_content.sql

# 3. Verify migrations
psql -U postgres -d cms_db -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"

# 4. Create default organization for existing data
psql -U postgres -d cms_db -c "INSERT INTO organizations (id, name, slug, owner_id) VALUES (1, 'Default Organization', 'default', 1) ON CONFLICT DO NOTHING;"
```

### Staging/Production

```bash
# 1. Use database migration tool (e.g., Flyway, Liquibase) or manual execution
# 2. Run migrations during maintenance window (minimal downtime expected: <5 minutes)
# 3. Verify data integrity after migration

# Check all content has organization_id
SELECT
  'sites' AS table_name, COUNT(*) AS total, COUNT(organization_id) AS with_org_id
FROM sites
UNION ALL
SELECT 'posts', COUNT(*), COUNT(organization_id) FROM posts
UNION ALL
SELECT 'pages', COUNT(*), COUNT(organization_id) FROM pages;

# Should show: total = with_org_id for all tables
```

### Rollback Plan

```sql
-- If migrations fail, rollback in reverse order

-- Rollback 005: Remove organization_id from content
ALTER TABLE sites DROP COLUMN organization_id;
ALTER TABLE posts DROP COLUMN organization_id;
ALTER TABLE pages DROP COLUMN organization_id;
ALTER TABLE media_files DROP COLUMN organization_id;
ALTER TABLE categories DROP COLUMN organization_id;

-- Rollback 004: Drop RBAC tables
DROP TABLE organization_invites;
DROP TABLE organization_members;

-- Rollback 003: Drop quotas table
DROP FUNCTION reset_monthly_quotas();
DROP FUNCTION check_and_increment_quota(INTEGER, VARCHAR, BIGINT);
DROP TABLE usage_quotas;

-- Rollback 002: Drop subscription tables
DROP TABLE subscription_events;
DROP TABLE payment_methods;
DROP TABLE invoices;
DROP TABLE subscriptions;

-- Rollback 001: Drop organizations table
ALTER TABLE users DROP COLUMN current_organization_id;
ALTER TABLE users DROP COLUMN email_verified;
ALTER TABLE users DROP COLUMN email_verification_token;
ALTER TABLE users DROP COLUMN email_verification_sent_at;
DROP TABLE organizations;

-- Restore from backup
-- psql -U postgres -d cms_db < backup_YYYYMMDD.sql
```

---

## Risk Mitigation

### Risk 1: Data Migration Breaks Existing Content
**Mitigation**:
- Backup database before migration
- Test migrations on staging first
- Default organization_id = 1 for all existing content
- Rollback script ready

### Risk 2: Performance Degradation
**Mitigation**:
- All queries use indexed columns
- Row-level locking prevents race conditions
- Test with 1,000+ organizations in staging

### Risk 3: Foreign Key Constraint Violations
**Mitigation**:
- ON DELETE CASCADE for organization-owned records
- ON DELETE SET NULL for audit tables (subscription_events)
- ON DELETE RESTRICT for critical references (organizations.owner_id)

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
