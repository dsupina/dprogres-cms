-- Migration: Add content_hash column for auto-save functionality
-- CV-005: Auto-Save System

-- Add content_hash column to existing content_versions table
ALTER TABLE content_versions
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Create index for efficient auto-save queries
CREATE INDEX IF NOT EXISTS idx_content_versions_autosave
  ON content_versions(content_type, content_id, created_at DESC)
  WHERE version_type = 'auto_save';

-- Create index for content hash lookups
CREATE INDEX IF NOT EXISTS idx_content_versions_hash
  ON content_versions(content_hash)
  WHERE content_hash IS NOT NULL;

-- Comment on the new column
COMMENT ON COLUMN content_versions.content_hash IS 'SHA-256 hash of content for change detection in auto-save';