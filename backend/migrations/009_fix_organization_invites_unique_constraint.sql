-- Migration 009: Fix organization_invites unique constraint for re-inviting
-- Ticket: SF-006 (P1 fix from automated review)
-- Author: System
-- Date: 2025-01-22

-- Drop existing UNIQUE constraint
ALTER TABLE organization_invites
  DROP CONSTRAINT IF EXISTS organization_invites_organization_id_email_key;

-- Create partial UNIQUE index that only enforces uniqueness for unaccepted invites
-- This allows re-inviting users who have accepted their previous invites
-- Note: Cannot use expires_at > NOW() because NOW() is not IMMUTABLE
-- Expired check is enforced in application logic
CREATE UNIQUE INDEX organization_invites_organization_id_email_pending_key
  ON organization_invites(organization_id, email)
  WHERE accepted_at IS NULL;

COMMENT ON INDEX organization_invites_organization_id_email_pending_key IS
  'Ensures one unaccepted invite per email per organization.
   Allows re-inviting users who have already accepted previous invites.
   Expired invites are handled by application logic before INSERT.';
