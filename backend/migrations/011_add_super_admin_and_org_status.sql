-- Migration: Add super admin and organization status columns
-- Required for: Super Admin System (feat/super-admin-system)

-- ==============================================
-- USERS TABLE: Add super admin and soft delete columns
-- ==============================================

-- Add is_super_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- Add deleted_at column for soft delete support
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create index for super admin lookups
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = TRUE;

-- Create index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- ==============================================
-- ORGANIZATIONS TABLE: Add status and suspension columns
-- ==============================================

-- Add status column with valid states
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' NOT NULL;

-- Add constraint for valid status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_org_status'
    ) THEN
        ALTER TABLE organizations ADD CONSTRAINT valid_org_status
        CHECK (status IN ('active', 'suspended', 'pending_deletion'));
    END IF;
END $$;

-- Add suspension tracking columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspension_warning_sent_at TIMESTAMP;

-- Create indexes for status-based queries
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_suspended ON organizations(status, suspended_at) WHERE status = 'suspended';
CREATE INDEX IF NOT EXISTS idx_organizations_grace_period ON organizations(grace_period_ends_at) WHERE grace_period_ends_at IS NOT NULL;

-- ==============================================
-- VALIDATION
-- ==============================================

DO $$
DECLARE
    users_has_super_admin BOOLEAN;
    users_has_deleted_at BOOLEAN;
    orgs_has_status BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_super_admin'
    ) INTO users_has_super_admin;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'deleted_at'
    ) INTO users_has_deleted_at;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'status'
    ) INTO orgs_has_status;

    IF users_has_super_admin AND users_has_deleted_at AND orgs_has_status THEN
        RAISE NOTICE 'Migration 011 completed successfully: super admin and org status columns added.';
    ELSE
        RAISE WARNING 'Migration 011 may be incomplete. Please verify columns exist.';
    END IF;
END $$;
