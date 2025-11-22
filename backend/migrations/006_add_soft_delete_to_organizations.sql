-- Migration: Add soft delete support to organizations table
-- Ticket: SF-005
-- Date: 2025-01-22

-- Add deleted_at column for soft delete functionality
ALTER TABLE organizations
  ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

-- Create index for faster queries on non-deleted organizations
CREATE INDEX idx_organizations_deleted_at ON organizations(deleted_at) WHERE deleted_at IS NULL;

-- Comment
COMMENT ON COLUMN organizations.deleted_at IS 'Soft delete timestamp - NULL means active, non-NULL means deleted';

-- Rollback instructions (if needed):
-- ALTER TABLE organizations DROP COLUMN deleted_at;
-- DROP INDEX IF EXISTS idx_organizations_deleted_at;
