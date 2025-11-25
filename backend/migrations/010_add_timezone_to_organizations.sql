-- Migration: 010_add_timezone_to_organizations.sql
-- Epic: EPIC-003 SaaS Foundation (SF-011)
-- Purpose: Add timezone column to organizations for per-org quota reset scheduling
-- Created: 2025-01-25

-- Add timezone column to organizations table
-- Defaults to UTC, uses IANA timezone names (e.g., 'America/New_York', 'Europe/Zagreb', 'Asia/Tokyo')
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC' NOT NULL;

-- Create index for timezone-based queries (for job scheduling)
CREATE INDEX IF NOT EXISTS idx_organizations_timezone ON organizations(timezone);

-- Backfill existing organizations with UTC
UPDATE organizations
SET timezone = 'UTC'
WHERE timezone IS NULL;

-- Add constraint to validate timezone format (basic validation)
ALTER TABLE organizations
  ADD CONSTRAINT valid_timezone CHECK (timezone ~ '^[A-Za-z_]+/[A-Za-z_]+$' OR timezone = 'UTC');

-- Comments
COMMENT ON COLUMN organizations.timezone IS 'IANA timezone for organization (e.g., America/New_York, Europe/Zagreb) - used for quota reset scheduling';

-- DOWN Migration (if needed)
-- ALTER TABLE organizations DROP COLUMN IF EXISTS timezone;
-- DROP INDEX IF EXISTS idx_organizations_timezone;
