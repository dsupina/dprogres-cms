-- Migration: 003_create_usage_quotas.sql
-- Epic: EPIC-003 SaaS Foundation (SF-001)
-- Purpose: Create usage quotas table and PostgreSQL functions for quota checking
-- Created: 2025-01-21

-- Usage quotas table
CREATE TABLE IF NOT EXISTS usage_quotas (
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

CREATE INDEX IF NOT EXISTS idx_usage_quotas_org ON usage_quotas(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_dimension ON usage_quotas(dimension);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_period_end ON usage_quotas(period_end) WHERE period_end IS NOT NULL;

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

  -- Check if quota record exists
  IF current_val IS NULL THEN
    RETURN FALSE; -- No quota record = deny operation
  END IF;

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
      period_end = period_end + INTERVAL '1 month',
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
