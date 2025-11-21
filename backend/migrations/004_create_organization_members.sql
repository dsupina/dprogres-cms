-- Migration: 004_create_organization_members.sql
-- Epic: EPIC-003 SaaS Foundation (SF-001)
-- Purpose: Create organization members, invites, and RBAC permission function
-- Created: 2025-01-21

-- Organization members table
CREATE TABLE IF NOT EXISTS organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'editor', 'publisher', 'viewer')),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- Organization invites table
CREATE TABLE IF NOT EXISTS organization_invites (
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

CREATE INDEX IF NOT EXISTS idx_org_invites_org ON organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON organization_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_org_invites_expires ON organization_invites(expires_at);

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
