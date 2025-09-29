-- Migration: Content Versioning & Draft Preview System
-- Version: 001
-- Date: 2025-01-26
-- Description: Adds content versioning, preview tokens, and version comments tables

-- ========================================
-- PHASE 1: Core Versioning Tables
-- ========================================

-- Content Versions Table
-- Stores all versions of posts and pages with full content snapshots
CREATE TABLE IF NOT EXISTS content_versions (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('post', 'page')),
    content_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,

    -- Content snapshot fields (mirrors posts/pages structure)
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    content TEXT,
    excerpt TEXT,

    -- SEO fields snapshot
    meta_title VARCHAR(255),
    meta_description TEXT,
    og_image VARCHAR(500),

    -- Post-specific fields (NULL for pages)
    category_id INTEGER,
    status VARCHAR(20),
    featured_image VARCHAR(500),

    -- Page-specific fields (NULL for posts)
    template VARCHAR(100),
    parent_id INTEGER,
    order_index INTEGER,
    is_homepage BOOLEAN DEFAULT FALSE,

    -- Versioning metadata
    is_draft BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT FALSE,
    is_auto_save BOOLEAN DEFAULT FALSE,

    -- Change tracking
    change_summary TEXT,
    changed_fields JSONB DEFAULT '[]'::jsonb,

    -- User tracking
    created_by INTEGER NOT NULL,
    published_by INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,

    -- Foreign key constraints
    CONSTRAINT fk_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_published_by FOREIGN KEY (published_by)
        REFERENCES users(id) ON DELETE SET NULL,

    -- Unique constraint on version number per content item
    CONSTRAINT unique_content_version UNIQUE (content_type, content_id, version_number)
);

-- Indexes for performance
CREATE INDEX idx_content_versions_lookup ON content_versions(content_type, content_id, version_number DESC);
CREATE INDEX idx_content_versions_draft ON content_versions(content_type, content_id, is_draft) WHERE is_draft = TRUE;
CREATE INDEX idx_content_versions_published ON content_versions(content_type, content_id, is_published) WHERE is_published = TRUE;
CREATE INDEX idx_content_versions_auto_save ON content_versions(is_auto_save, created_by, created_at DESC) WHERE is_auto_save = TRUE;
CREATE INDEX idx_content_versions_created_at ON content_versions(created_at DESC);

-- ========================================
-- PHASE 2: Preview Token System
-- ========================================

-- Preview Tokens Table
-- Manages secure tokens for sharing draft previews
CREATE TABLE IF NOT EXISTS preview_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('post', 'page')),
    content_id INTEGER NOT NULL,
    version_id INTEGER NOT NULL,

    -- Access control
    password_protected BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    max_views INTEGER,
    view_count INTEGER DEFAULT 0,

    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE,

    -- Foreign key constraints
    CONSTRAINT fk_preview_version FOREIGN KEY (version_id)
        REFERENCES content_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_preview_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for preview tokens
CREATE INDEX idx_preview_tokens_active ON preview_tokens(token) WHERE is_active = TRUE;
CREATE INDEX idx_preview_tokens_content ON preview_tokens(content_type, content_id);
CREATE INDEX idx_preview_tokens_expiry ON preview_tokens(expires_at) WHERE is_active = TRUE;

-- ========================================
-- PHASE 3: Version Comments System
-- ========================================

-- Version Comments Table
-- Stores review comments on specific versions
CREATE TABLE IF NOT EXISTS version_comments (
    id SERIAL PRIMARY KEY,
    version_id INTEGER NOT NULL,
    parent_comment_id INTEGER,

    -- Comment content
    comment TEXT NOT NULL,

    -- Position reference (for inline comments)
    line_start INTEGER,
    line_end INTEGER,
    selection_text TEXT,

    -- Status tracking
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by INTEGER,
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- User tracking
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraints
    CONSTRAINT fk_comment_version FOREIGN KEY (version_id)
        REFERENCES content_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_parent FOREIGN KEY (parent_comment_id)
        REFERENCES version_comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_comment_resolved_by FOREIGN KEY (resolved_by)
        REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for comments
CREATE INDEX idx_version_comments_version ON version_comments(version_id);
CREATE INDEX idx_version_comments_parent ON version_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX idx_version_comments_unresolved ON version_comments(version_id, is_resolved) WHERE is_resolved = FALSE;

-- ========================================
-- PHASE 4: Update Existing Tables
-- ========================================

-- Add versioning columns to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS current_version_id INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS draft_version_id INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN DEFAULT FALSE;

-- Add versioning columns to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS current_version_id INTEGER;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS draft_version_id INTEGER;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN DEFAULT FALSE;

-- Add foreign key constraints after columns are created
ALTER TABLE posts
    ADD CONSTRAINT fk_posts_current_version
    FOREIGN KEY (current_version_id)
    REFERENCES content_versions(id) ON DELETE SET NULL;

ALTER TABLE posts
    ADD CONSTRAINT fk_posts_draft_version
    FOREIGN KEY (draft_version_id)
    REFERENCES content_versions(id) ON DELETE SET NULL;

ALTER TABLE pages
    ADD CONSTRAINT fk_pages_current_version
    FOREIGN KEY (current_version_id)
    REFERENCES content_versions(id) ON DELETE SET NULL;

ALTER TABLE pages
    ADD CONSTRAINT fk_pages_draft_version
    FOREIGN KEY (draft_version_id)
    REFERENCES content_versions(id) ON DELETE SET NULL;

-- ========================================
-- PHASE 5: Helper Functions
-- ========================================

-- Function to calculate next version number
CREATE OR REPLACE FUNCTION get_next_version_number(
    p_content_type VARCHAR(50),
    p_content_id INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(version_number) + 1
         FROM content_versions
         WHERE content_type = p_content_type
           AND content_id = p_content_id),
        1
    );
END;
$$ LANGUAGE plpgsql;

-- Function to generate secure preview token
CREATE OR REPLACE FUNCTION generate_preview_token() RETURNS VARCHAR(255) AS $$
DECLARE
    token VARCHAR(255);
BEGIN
    LOOP
        token := encode(gen_random_bytes(32), 'hex');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM preview_tokens WHERE preview_tokens.token = token);
    END LOOP;
    RETURN token;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- PHASE 6: Triggers
-- ========================================

-- Trigger to update has_unpublished_changes flag
CREATE OR REPLACE FUNCTION update_unpublished_changes_flag()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_draft = TRUE THEN
        IF NEW.content_type = 'post' THEN
            UPDATE posts
            SET has_unpublished_changes = TRUE,
                draft_version_id = NEW.id
            WHERE id = NEW.content_id;
        ELSIF NEW.content_type = 'page' THEN
            UPDATE pages
            SET has_unpublished_changes = TRUE,
                draft_version_id = NEW.id
            WHERE id = NEW.content_id;
        END IF;
    ELSIF NEW.is_published = TRUE THEN
        IF NEW.content_type = 'post' THEN
            UPDATE posts
            SET has_unpublished_changes = FALSE,
                current_version_id = NEW.id,
                draft_version_id = NULL
            WHERE id = NEW.content_id;
        ELSIF NEW.content_type = 'page' THEN
            UPDATE pages
            SET has_unpublished_changes = FALSE,
                current_version_id = NEW.id,
                draft_version_id = NULL
            WHERE id = NEW.content_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_unpublished_changes
    AFTER INSERT OR UPDATE ON content_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_unpublished_changes_flag();

-- ========================================
-- PHASE 7: Initial Data & Permissions
-- ========================================

-- Grant necessary permissions (adjust based on your user roles)
-- GRANT SELECT, INSERT, UPDATE ON content_versions TO cms_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON preview_tokens TO cms_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON version_comments TO cms_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cms_user;

-- ========================================
-- ROLLBACK SCRIPT (Keep for reference)
-- ========================================
/*
-- To rollback this migration, run:

-- Remove triggers
DROP TRIGGER IF EXISTS trigger_update_unpublished_changes ON content_versions;

-- Remove functions
DROP FUNCTION IF EXISTS update_unpublished_changes_flag();
DROP FUNCTION IF EXISTS generate_preview_token();
DROP FUNCTION IF EXISTS get_next_version_number(VARCHAR, INTEGER);

-- Remove foreign key constraints from existing tables
ALTER TABLE posts DROP CONSTRAINT IF EXISTS fk_posts_current_version;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS fk_posts_draft_version;
ALTER TABLE pages DROP CONSTRAINT IF EXISTS fk_pages_current_version;
ALTER TABLE pages DROP CONSTRAINT IF EXISTS fk_pages_draft_version;

-- Remove columns from existing tables
ALTER TABLE posts DROP COLUMN IF EXISTS current_version_id;
ALTER TABLE posts DROP COLUMN IF EXISTS draft_version_id;
ALTER TABLE posts DROP COLUMN IF EXISTS has_unpublished_changes;
ALTER TABLE pages DROP COLUMN IF EXISTS current_version_id;
ALTER TABLE pages DROP COLUMN IF EXISTS draft_version_id;
ALTER TABLE pages DROP COLUMN IF EXISTS has_unpublished_changes;

-- Drop tables
DROP TABLE IF EXISTS version_comments CASCADE;
DROP TABLE IF EXISTS preview_tokens CASCADE;
DROP TABLE IF EXISTS content_versions CASCADE;
*/