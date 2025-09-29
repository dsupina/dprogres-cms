-- Rollback Migration: Content Versioning & Draft Preview System
-- Version: 003
-- Date: 2025-09-26
-- Ticket: CV-001

-- =========================================
-- Drop triggers first
-- =========================================
DROP TRIGGER IF EXISTS update_version_comments_updated_at ON version_comments;

-- =========================================
-- Drop functions (without CASCADE to avoid affecting other tables)
-- =========================================
-- Note: update_updated_at_column might be used by other tables, so we don't drop it
DROP FUNCTION IF EXISTS get_next_version_number(VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS generate_preview_token();

-- =========================================
-- Drop tables (CASCADE to handle dependencies)
-- =========================================
DROP TABLE IF EXISTS version_comments CASCADE;
DROP TABLE IF EXISTS preview_tokens CASCADE;
DROP TABLE IF EXISTS content_versions CASCADE;

-- =========================================
-- Note: This rollback will permanently delete:
-- - All stored content versions
-- - All preview tokens
-- - All version comments
--
-- Ensure you have backed up any critical data before running this rollback
-- =========================================