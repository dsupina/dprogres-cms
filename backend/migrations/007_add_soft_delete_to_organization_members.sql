-- Migration 007: Add soft delete to organization_members for GDPR/CCPA compliance
-- Ticket: SF-006
-- Author: System
-- Date: 2025-01-22

-- Add soft delete column to organization_members
ALTER TABLE organization_members
  ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

-- Add partial index for active members (performance optimization)
CREATE INDEX idx_organization_members_deleted_at
  ON organization_members(deleted_at)
  WHERE deleted_at IS NULL;

-- Add index for GDPR data retention queries (members deleted > 30 days ago)
CREATE INDEX idx_organization_members_retention
  ON organization_members(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Add comment explaining GDPR/CCPA compliance
COMMENT ON COLUMN organization_members.deleted_at IS
  'Soft delete timestamp for GDPR/CCPA compliance. NULL = active member.
   Members are soft-deleted when removed from organization.
   Hard deletion occurs after 30-day retention period for audit compliance.';

-- Note: Hard deletion logic should be implemented in application layer or scheduled job
-- to permanently delete records where deleted_at < NOW() - INTERVAL ''30 days''
