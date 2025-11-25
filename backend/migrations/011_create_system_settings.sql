-- Migration: 011_create_system_settings.sql
-- Epic: EPIC-003 SaaS Foundation (SF-011)
-- Purpose: Create system_settings table for global configuration (quota reset schedule, feature flags, etc.)
-- Created: 2025-01-25

-- System settings table (key-value store for global configuration)
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(50) DEFAULT 'string' NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id),
  CONSTRAINT valid_setting_type CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'cron'))
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_public ON system_settings(is_public);

-- Insert default settings for quota reset job
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
  ('quota_reset_schedule', '0 * * * *', 'cron', 'Cron schedule for quota reset job (hourly at minute 0, max delay 1h instead of 23h)', FALSE),
  ('quota_reset_enabled', 'true', 'boolean', 'Enable/disable quota reset job', FALSE),
  ('quota_reset_timezone', 'UTC', 'string', 'Default timezone for quota reset (IANA format)', FALSE),
  ('otel_enabled', 'true', 'boolean', 'Enable OpenTelemetry instrumentation', FALSE),
  ('otel_endpoint', 'http://localhost:4318/v1/traces', 'string', 'OpenTelemetry collector endpoint (OTLP/HTTP)', FALSE),
  ('feature_flag_quota_warnings', 'true', 'boolean', 'Enable quota warning emails at 80%, 90%, 95%', FALSE)
ON CONFLICT (setting_key) DO NOTHING;

-- Comments
COMMENT ON TABLE system_settings IS 'Global system configuration key-value store (managed by super admin)';
COMMENT ON COLUMN system_settings.setting_key IS 'Unique configuration key (e.g., quota_reset_schedule, feature_flag_*)';
COMMENT ON COLUMN system_settings.setting_type IS 'Data type for validation: string, number, boolean, json, cron';
COMMENT ON COLUMN system_settings.is_public IS 'TRUE if setting can be read by non-admin users (e.g., feature flags)';
COMMENT ON COLUMN system_settings.updated_by IS 'User ID who last modified this setting (super admin)';

-- Function to get setting value by key
CREATE OR REPLACE FUNCTION get_system_setting(key TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT setting_value FROM system_settings WHERE setting_key = key LIMIT 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to set setting value by key (updates updated_at automatically)
CREATE OR REPLACE FUNCTION set_system_setting(key TEXT, value TEXT, user_id INTEGER DEFAULT NULL) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE system_settings
  SET setting_value = value,
      updated_at = NOW(),
      updated_by = user_id
  WHERE setting_key = key;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- DOWN Migration (if needed)
-- DROP FUNCTION IF EXISTS get_system_setting(TEXT);
-- DROP FUNCTION IF EXISTS set_system_setting(TEXT, TEXT, INTEGER);
-- DROP TABLE IF EXISTS system_settings;
