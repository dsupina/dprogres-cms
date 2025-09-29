-- Migration: Version Audit Log for CV-003
-- Version: 004
-- Date: 2025-09-26
-- Ticket: CV-003
-- Purpose: Add comprehensive audit logging for version operations

-- =========================================
-- Create version_audit_log table
-- =========================================
CREATE TABLE IF NOT EXISTS version_audit_log (
    id SERIAL PRIMARY KEY,

    -- Audit details
    action VARCHAR(50) NOT NULL, -- created, updated, published, etc.
    version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,

    -- User and site context
    user_id INTEGER NOT NULL REFERENCES users(id),
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

    -- Request context
    ip_address INET,
    user_agent TEXT,

    -- Audit payload
    details JSONB DEFAULT '{}',
    data_classification VARCHAR(20) DEFAULT 'internal',

    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Constraints
    CONSTRAINT check_action CHECK (
        action IN ('created', 'updated', 'published', 'unpublished', 'archived', 'restored', 'deleted', 'comment_added', 'comment_resolved')
    ),
    CONSTRAINT check_data_classification CHECK (
        data_classification IN ('public', 'internal', 'confidential', 'restricted', 'secret')
    )
);

-- Create indexes for audit log queries
CREATE INDEX idx_version_audit_log_version ON version_audit_log(version_id);
CREATE INDEX idx_version_audit_log_user ON version_audit_log(user_id);
CREATE INDEX idx_version_audit_log_site ON version_audit_log(site_id);
CREATE INDEX idx_version_audit_log_action ON version_audit_log(action);
CREATE INDEX idx_version_audit_log_created_at ON version_audit_log(created_at DESC);
CREATE INDEX idx_version_audit_log_classification ON version_audit_log(data_classification);

-- Composite indexes for common queries
CREATE INDEX idx_version_audit_log_site_version ON version_audit_log(site_id, version_id);
CREATE INDEX idx_version_audit_log_user_site ON version_audit_log(user_id, site_id);

-- GIN index for JSONB details
CREATE INDEX idx_version_audit_log_details_gin ON version_audit_log USING GIN(details);

-- =========================================
-- Add comments for documentation
-- =========================================
COMMENT ON TABLE version_audit_log IS 'Comprehensive audit trail for all version operations with compliance support';
COMMENT ON COLUMN version_audit_log.action IS 'Type of action performed on the version';
COMMENT ON COLUMN version_audit_log.details IS 'JSON payload with action-specific details';
COMMENT ON COLUMN version_audit_log.data_classification IS 'Security classification of the audited data';
COMMENT ON COLUMN version_audit_log.ip_address IS 'IP address of the user performing the action';
COMMENT ON COLUMN version_audit_log.user_agent IS 'User agent string from the request';

-- =========================================
-- Create retention policy function
-- =========================================
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Keep audit logs for 7 years for compliance
    DELETE FROM version_audit_log
    WHERE created_at < CURRENT_DATE - INTERVAL '7 years';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- Initial statistics
-- =========================================
ANALYZE version_audit_log;