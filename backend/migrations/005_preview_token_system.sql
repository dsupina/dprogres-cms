-- CV-006 Preview Token System Migration
-- Purpose: Create tables and indexes for secure preview token functionality
-- Date: 2025-09-28

-- =========================================
-- Create preview_tokens table
-- =========================================

CREATE TABLE IF NOT EXISTS preview_tokens (
  id SERIAL PRIMARY KEY,

  -- Token identification
  token VARCHAR(500) UNIQUE NOT NULL,
  token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash for lookups
  token_type VARCHAR(20) DEFAULT 'preview', -- 'preview', 'share', 'embed'

  -- Content reference
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
  locale VARCHAR(10),

  -- Security settings
  expires_at TIMESTAMP NOT NULL,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  password_protected BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255), -- bcrypt hash if password protected

  -- Access restrictions
  allowed_ips TEXT[], -- Array of allowed IP addresses
  allowed_emails TEXT[], -- Array of allowed email addresses

  -- Settings
  settings JSONB DEFAULT '{}', -- Additional settings (device preview, etc.)

  -- Tracking
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_by INTEGER REFERENCES users(id),

  -- Indexes for performance
  INDEX idx_preview_tokens_hash (token_hash),
  INDEX idx_preview_tokens_site (site_id, created_at DESC),
  INDEX idx_preview_tokens_expires (expires_at) WHERE revoked_at IS NULL,
  INDEX idx_preview_tokens_version (version_id)
);

-- =========================================
-- Create preview_analytics table with partitioning
-- =========================================

CREATE TABLE IF NOT EXISTS preview_analytics (
  id BIGSERIAL PRIMARY KEY,

  -- Token and content reference
  token_id INTEGER NOT NULL REFERENCES preview_tokens(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,

  -- Access details
  ip_address INET,
  user_agent TEXT,
  referer TEXT,
  country_code CHAR(2),
  device_type VARCHAR(20), -- 'desktop', 'tablet', 'mobile'

  -- Timing
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  response_time_ms INTEGER,

  -- Session tracking
  session_id VARCHAR(64),
  view_duration_seconds INTEGER,

  -- Partitioning key
  partition_date DATE GENERATED ALWAYS AS (accessed_at::date) STORED
) PARTITION BY RANGE (partition_date);

-- Create initial partitions (current month + next 2 months)
CREATE TABLE preview_analytics_2025_01 PARTITION OF preview_analytics
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE preview_analytics_2025_02 PARTITION OF preview_analytics
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE preview_analytics_2025_03 PARTITION OF preview_analytics
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Indexes on partitioned table
CREATE INDEX idx_preview_analytics_token ON preview_analytics(token_id, accessed_at DESC);
CREATE INDEX idx_preview_analytics_site ON preview_analytics(site_id, accessed_at DESC);
CREATE INDEX idx_preview_analytics_session ON preview_analytics(session_id);

-- =========================================
-- Create short_urls table for QR codes
-- =========================================

CREATE TABLE IF NOT EXISTS short_urls (
  id SERIAL PRIMARY KEY,

  -- Short URL mapping
  short_code VARCHAR(12) UNIQUE NOT NULL,
  preview_token_id INTEGER NOT NULL REFERENCES preview_tokens(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Metadata
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,

  -- Analytics
  click_count INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMP,

  -- QR code settings
  qr_code_settings JSONB DEFAULT '{}'
);

-- High-performance indexes
CREATE UNIQUE INDEX idx_short_urls_code ON short_urls(short_code);
CREATE INDEX idx_short_urls_token ON short_urls(preview_token_id);
CREATE INDEX idx_short_urls_site ON short_urls(site_id, created_at DESC);

-- =========================================
-- Create preview_feedback table
-- =========================================

CREATE TABLE IF NOT EXISTS preview_feedback (
  id SERIAL PRIMARY KEY,

  -- Reference
  token_id INTEGER NOT NULL REFERENCES preview_tokens(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,

  -- Feedback content
  feedback_type VARCHAR(20) DEFAULT 'general', -- 'general', 'bug', 'suggestion'
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  -- Submitter info
  submitter_email VARCHAR(255),
  submitter_name VARCHAR(255),

  -- Status
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'reviewed', 'resolved'
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes
CREATE INDEX idx_preview_feedback_token ON preview_feedback(token_id);
CREATE INDEX idx_preview_feedback_status ON preview_feedback(status);

-- =========================================
-- Performance optimization functions
-- =========================================

-- Fast token validation function
CREATE OR REPLACE FUNCTION validate_preview_token(p_token_hash VARCHAR)
RETURNS TABLE (
  valid BOOLEAN,
  token_id INTEGER,
  version_id INTEGER,
  site_id INTEGER,
  requires_password BOOLEAN,
  expired BOOLEAN,
  exceeded_uses BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN pt.id IS NULL THEN FALSE
      WHEN pt.revoked_at IS NOT NULL THEN FALSE
      WHEN pt.expires_at <= CURRENT_TIMESTAMP THEN FALSE
      WHEN pt.max_uses IS NOT NULL AND pt.use_count >= pt.max_uses THEN FALSE
      ELSE TRUE
    END as valid,
    pt.id as token_id,
    pt.version_id,
    pt.site_id,
    pt.password_protected as requires_password,
    (pt.expires_at <= CURRENT_TIMESTAMP) as expired,
    (pt.max_uses IS NOT NULL AND pt.use_count >= pt.max_uses) as exceeded_uses
  FROM preview_tokens pt
  WHERE pt.token_hash = p_token_hash;
END;
$$ LANGUAGE plpgsql STABLE;

-- Cleanup expired tokens function
CREATE OR REPLACE FUNCTION cleanup_expired_preview_tokens()
RETURNS TABLE (deleted_tokens INTEGER, deleted_analytics BIGINT) AS $$
DECLARE
  tokens_deleted INTEGER;
  analytics_deleted BIGINT;
BEGIN
  -- Delete expired tokens older than 30 days
  DELETE FROM preview_tokens
  WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

  GET DIAGNOSTICS tokens_deleted = ROW_COUNT;

  -- Delete old analytics data (older than 90 days)
  DELETE FROM preview_analytics
  WHERE accessed_at < CURRENT_TIMESTAMP - INTERVAL '90 days';

  GET DIAGNOSTICS analytics_deleted = ROW_COUNT;

  RETURN QUERY SELECT tokens_deleted, analytics_deleted;
END;
$$ LANGUAGE plpgsql;

-- Create monthly partition function
CREATE OR REPLACE FUNCTION create_monthly_analytics_partition(target_date DATE)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := date_trunc('month', target_date);
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'preview_analytics_' || to_char(start_date, 'YYYY_MM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF preview_analytics FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- Comments for documentation
-- =========================================

COMMENT ON TABLE preview_tokens IS 'Stores preview tokens for secure content sharing';
COMMENT ON TABLE preview_analytics IS 'Tracks preview token usage with time-based partitioning';
COMMENT ON TABLE short_urls IS 'Maps short URLs to preview tokens for easy sharing and QR codes';
COMMENT ON TABLE preview_feedback IS 'Stores feedback collected from preview viewers';
COMMENT ON FUNCTION validate_preview_token IS 'High-performance token validation';
COMMENT ON FUNCTION cleanup_expired_preview_tokens IS 'Removes expired tokens and old analytics';

-- Initial statistics
ANALYZE preview_tokens;
ANALYZE preview_analytics;
ANALYZE short_urls;
ANALYZE preview_feedback;