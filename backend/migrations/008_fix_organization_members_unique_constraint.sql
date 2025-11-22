-- Migration 008: Fix organization_members unique constraint for soft delete compatibility
-- Ticket: SF-006 (P1 fix from automated review)
-- Author: System
-- Date: 2025-01-22

-- Drop existing UNIQUE constraint
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_organization_id_user_id_key;

-- Create partial UNIQUE index that ignores soft-deleted rows
-- This allows re-inviting previously removed members
CREATE UNIQUE INDEX organization_members_organization_id_user_id_active_key
  ON organization_members(organization_id, user_id)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX organization_members_organization_id_user_id_active_key IS
  'Ensures one active membership per user per organization.
   Allows re-inviting soft-deleted members by ignoring deleted_at IS NOT NULL rows.';
