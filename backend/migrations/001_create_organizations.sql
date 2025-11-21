-- Migration: 001_create_organizations.sql
-- Epic: EPIC-003 SaaS Foundation (SF-001)
-- Purpose: Create organizations table for multi-tenant architecture
-- Created: 2025-01-21

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
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

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_plan_tier ON organizations(plan_tier);

-- Add organization context to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_organization_id INTEGER REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_current_org ON users(current_organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email_verification ON users(email_verification_token);

-- Comments
COMMENT ON TABLE organizations IS 'Multi-tenant organizations (workspaces)';
COMMENT ON COLUMN organizations.slug IS 'URL-safe unique identifier for organization';
COMMENT ON COLUMN organizations.plan_tier IS 'Current subscription tier (free, starter, pro, enterprise)';
