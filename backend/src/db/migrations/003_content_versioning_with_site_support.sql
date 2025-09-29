-- Migration: Content Versioning System with Multi-Site Support
-- Ticket: CV-002
-- Description: Add content versioning tables with full site isolation support

-- ============================================
-- STEP 1: Create content_versions table
-- ============================================
CREATE TABLE IF NOT EXISTS content_versions (
    id SERIAL PRIMARY KEY,

    -- Multi-site context (CRITICAL for data isolation)
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    locale VARCHAR(10) DEFAULT 'en',

    -- Content reference
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'page')),
    content_id INTEGER NOT NULL,

    -- Version metadata
    version_number INTEGER NOT NULL DEFAULT 1,
    version_type VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (version_type IN ('draft', 'published', 'auto_save', 'archived')),
    is_current_draft BOOLEAN DEFAULT FALSE,
    is_current_published BOOLEAN DEFAULT FALSE,

    -- Content snapshot
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    content TEXT,
    excerpt TEXT,
    data JSONB DEFAULT '{}'::jsonb, -- Flexible content storage
    meta_data JSONB DEFAULT '{}'::jsonb, -- SEO, featured image, etc.

    -- Authorship and timing
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,

    -- Change tracking
    change_summary TEXT,
    diff_from_previous JSONB,

    -- Ensure unique version numbers per site, content, and type
    CONSTRAINT unique_content_version
        UNIQUE (site_id, content_type, content_id, version_number)
);

-- Performance indexes for multi-site queries
CREATE INDEX idx_content_versions_site_content
    ON content_versions(site_id, content_type, content_id, version_number DESC);

CREATE INDEX idx_content_versions_site_current_draft
    ON content_versions(site_id, content_id, is_current_draft)
    WHERE is_current_draft = TRUE;

CREATE INDEX idx_content_versions_site_current_published
    ON content_versions(site_id, content_id, is_current_published)
    WHERE is_current_published = TRUE;

CREATE INDEX idx_content_versions_created_at
    ON content_versions(created_at DESC);

CREATE INDEX idx_content_versions_published_at
    ON content_versions(published_at DESC)
    WHERE published_at IS NOT NULL;

-- JSONB indexes for efficient queries
CREATE INDEX idx_content_versions_data_gin
    ON content_versions USING GIN (data jsonb_path_ops);

CREATE INDEX idx_content_versions_meta_data_gin
    ON content_versions USING GIN (meta_data jsonb_path_ops);

-- ============================================
-- STEP 2: Create preview_tokens table
-- ============================================
CREATE TABLE IF NOT EXISTS preview_tokens (
    id SERIAL PRIMARY KEY,

    -- Multi-site context
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
    locale VARCHAR(10),

    -- Token details
    version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    token_type VARCHAR(20) NOT NULL DEFAULT 'preview'
        CHECK (token_type IN ('preview', 'share', 'embed')),

    -- Access control
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    max_uses INTEGER DEFAULT NULL,
    use_count INTEGER DEFAULT 0,

    -- Security settings
    password_hash VARCHAR(255),
    ip_whitelist TEXT[], -- Array of allowed IPs
    require_auth BOOLEAN DEFAULT FALSE,

    -- Activity tracking
    last_accessed_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    custom_settings JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Performance indexes for preview tokens
CREATE INDEX idx_preview_tokens_site_active
    ON preview_tokens(site_id, is_active, expires_at)
    WHERE is_active = TRUE;

CREATE INDEX idx_preview_tokens_token
    ON preview_tokens(token)
    WHERE is_active = TRUE;

CREATE INDEX idx_preview_tokens_version
    ON preview_tokens(version_id);

CREATE INDEX idx_preview_tokens_expires
    ON preview_tokens(expires_at)
    WHERE is_active = TRUE;

-- ============================================
-- STEP 3: Create version_comments table
-- ============================================
CREATE TABLE IF NOT EXISTS version_comments (
    id SERIAL PRIMARY KEY,

    -- Multi-site context
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

    -- Comment reference
    version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES version_comments(id) ON DELETE CASCADE,

    -- Comment content
    comment_text TEXT NOT NULL,
    comment_type VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (comment_type IN ('general', 'suggestion', 'issue', 'approval')),

    -- Positioning (for inline comments)
    line_number INTEGER,
    field_path VARCHAR(255), -- JSON path for structured content

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'resolved', 'archived')),
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,

    -- Authorship
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for comments
CREATE INDEX idx_version_comments_site_version
    ON version_comments(site_id, version_id);

CREATE INDEX idx_version_comments_version_status
    ON version_comments(version_id, status)
    WHERE status = 'active';

CREATE INDEX idx_version_comments_parent
    ON version_comments(parent_id)
    WHERE parent_id IS NOT NULL;

-- ============================================
-- STEP 4: Create preview access logs table
-- ============================================
CREATE TABLE IF NOT EXISTS preview_access_logs (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL REFERENCES preview_tokens(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    user_id INTEGER REFERENCES users(id),
    success BOOLEAN NOT NULL DEFAULT TRUE,
    failure_reason VARCHAR(255)
);

CREATE INDEX idx_preview_access_logs_token
    ON preview_access_logs(token_id, accessed_at DESC);

-- ============================================
-- STEP 5: Create version activity logs table
-- ============================================
CREATE TABLE IF NOT EXISTS version_activity_logs (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_version_activity_site_version
    ON version_activity_logs(site_id, version_id, created_at DESC);

-- ============================================
-- STEP 6: Create update triggers
-- ============================================

-- Update trigger for version_comments
CREATE OR REPLACE FUNCTION update_version_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_version_comments_updated_at
    BEFORE UPDATE ON version_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_version_comments_updated_at();

-- ============================================
-- STEP 7: Create helper functions
-- ============================================

-- Function to get the next version number for a content item
CREATE OR REPLACE FUNCTION get_next_version_number(
    p_site_id INTEGER,
    p_content_type VARCHAR,
    p_content_id INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(version_number) + 1
         FROM content_versions
         WHERE site_id = p_site_id
           AND content_type = p_content_type
           AND content_id = p_content_id),
        1
    );
END;
$$ LANGUAGE plpgsql;

-- Function to set current draft version
CREATE OR REPLACE FUNCTION set_current_draft_version(
    p_version_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_site_id INTEGER;
    v_content_type VARCHAR;
    v_content_id INTEGER;
BEGIN
    -- Get the version details
    SELECT site_id, content_type, content_id
    INTO v_site_id, v_content_type, v_content_id
    FROM content_versions
    WHERE id = p_version_id;

    -- Clear existing current draft flags
    UPDATE content_versions
    SET is_current_draft = FALSE
    WHERE site_id = v_site_id
      AND content_type = v_content_type
      AND content_id = v_content_id
      AND is_current_draft = TRUE;

    -- Set the new current draft
    UPDATE content_versions
    SET is_current_draft = TRUE
    WHERE id = p_version_id;
END;
$$ LANGUAGE plpgsql;

-- Function to publish a version
CREATE OR REPLACE FUNCTION publish_version(
    p_version_id INTEGER
) RETURNS VOID AS $$
DECLARE
    v_site_id INTEGER;
    v_content_type VARCHAR;
    v_content_id INTEGER;
BEGIN
    -- Get the version details
    SELECT site_id, content_type, content_id
    INTO v_site_id, v_content_type, v_content_id
    FROM content_versions
    WHERE id = p_version_id;

    -- Clear existing published flags
    UPDATE content_versions
    SET is_current_published = FALSE
    WHERE site_id = v_site_id
      AND content_type = v_content_type
      AND content_id = v_content_id
      AND is_current_published = TRUE;

    -- Set the new published version
    UPDATE content_versions
    SET
        is_current_published = TRUE,
        version_type = 'published',
        published_at = CURRENT_TIMESTAMP
    WHERE id = p_version_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 8: Migrate existing content to versions
-- ============================================

-- Migrate existing posts to content versions
INSERT INTO content_versions (
    site_id,
    content_type,
    content_id,
    version_number,
    version_type,
    is_current_draft,
    is_current_published,
    title,
    slug,
    content,
    excerpt,
    meta_data,
    created_by,
    created_at,
    published_at,
    change_summary
)
SELECT
    COALESCE(p.site_id, s.id) as site_id,
    'post' as content_type,
    p.id as content_id,
    1 as version_number,
    CASE
        WHEN p.status = 'published' THEN 'published'
        ELSE 'draft'
    END as version_type,
    CASE WHEN p.status != 'published' THEN TRUE ELSE FALSE END as is_current_draft,
    CASE WHEN p.status = 'published' THEN TRUE ELSE FALSE END as is_current_published,
    p.title,
    p.slug,
    p.content,
    p.excerpt,
    jsonb_build_object(
        'featured_image', p.featured_image,
        'meta_title', p.meta_title,
        'meta_description', p.meta_description,
        'seo_indexed', p.seo_indexed,
        'category_id', p.category_id,
        'featured', p.featured,
        'view_count', p.view_count
    ) as meta_data,
    COALESCE(p.author_id, 1) as created_by,
    p.created_at,
    CASE WHEN p.status = 'published' THEN p.updated_at ELSE NULL END as published_at,
    'Initial version - migrated from posts table' as change_summary
FROM posts p
LEFT JOIN sites s ON s.is_default = TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM content_versions cv
    WHERE cv.content_type = 'post'
      AND cv.content_id = p.id
);

-- Migrate existing pages to content versions
INSERT INTO content_versions (
    site_id,
    content_type,
    content_id,
    version_number,
    version_type,
    is_current_draft,
    is_current_published,
    title,
    slug,
    content,
    data,
    meta_data,
    created_by,
    created_at,
    published_at,
    change_summary
)
SELECT
    COALESCE(p.site_id, s.id) as site_id,
    'page' as content_type,
    p.id as content_id,
    1 as version_number,
    CASE
        WHEN p.published = TRUE THEN 'published'
        ELSE 'draft'
    END as version_type,
    CASE WHEN p.published != TRUE THEN TRUE ELSE FALSE END as is_current_draft,
    CASE WHEN p.published = TRUE THEN TRUE ELSE FALSE END as is_current_published,
    p.title,
    p.slug,
    p.content,
    p.data,
    jsonb_build_object(
        'template', p.template,
        'meta_title', p.meta_title,
        'meta_description', p.meta_description,
        'seo_indexed', p.seo_indexed
    ) as meta_data,
    1 as created_by, -- Default to admin user
    p.created_at,
    CASE WHEN p.published = TRUE THEN p.updated_at ELSE NULL END as published_at,
    'Initial version - migrated from pages table' as change_summary
FROM pages p
LEFT JOIN sites s ON s.is_default = TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM content_versions cv
    WHERE cv.content_type = 'page'
      AND cv.content_id = p.id
);

-- ============================================
-- STEP 9: Add versioning columns to content tables
-- ============================================

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS current_version_id INTEGER REFERENCES content_versions(id),
    ADD COLUMN IF NOT EXISTS draft_version_id INTEGER REFERENCES content_versions(id);

ALTER TABLE pages
    ADD COLUMN IF NOT EXISTS current_version_id INTEGER REFERENCES content_versions(id),
    ADD COLUMN IF NOT EXISTS draft_version_id INTEGER REFERENCES content_versions(id);

-- Update current version references
UPDATE posts p
SET current_version_id = cv.id
FROM content_versions cv
WHERE cv.content_type = 'post'
  AND cv.content_id = p.id
  AND cv.is_current_published = TRUE;

UPDATE posts p
SET draft_version_id = cv.id
FROM content_versions cv
WHERE cv.content_type = 'post'
  AND cv.content_id = p.id
  AND cv.is_current_draft = TRUE;

UPDATE pages p
SET current_version_id = cv.id
FROM content_versions cv
WHERE cv.content_type = 'page'
  AND cv.content_id = p.id
  AND cv.is_current_published = TRUE;

UPDATE pages p
SET draft_version_id = cv.id
FROM content_versions cv
WHERE cv.content_type = 'page'
  AND cv.content_id = p.id
  AND cv.is_current_draft = TRUE;

-- ============================================
-- STEP 10: Create validation constraints
-- ============================================

-- Ensure only one current draft per content item per site
CREATE OR REPLACE FUNCTION check_single_current_draft() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current_draft = TRUE THEN
        IF EXISTS (
            SELECT 1 FROM content_versions
            WHERE site_id = NEW.site_id
              AND content_type = NEW.content_type
              AND content_id = NEW.content_id
              AND is_current_draft = TRUE
              AND id != COALESCE(NEW.id, -1)
        ) THEN
            RAISE EXCEPTION 'Only one current draft allowed per content item';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_single_current_draft
    BEFORE INSERT OR UPDATE ON content_versions
    FOR EACH ROW
    EXECUTE FUNCTION check_single_current_draft();

-- Ensure only one current published per content item per site
CREATE OR REPLACE FUNCTION check_single_current_published() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current_published = TRUE THEN
        IF EXISTS (
            SELECT 1 FROM content_versions
            WHERE site_id = NEW.site_id
              AND content_type = NEW.content_type
              AND content_id = NEW.content_id
              AND is_current_published = TRUE
              AND id != COALESCE(NEW.id, -1)
        ) THEN
            RAISE EXCEPTION 'Only one current published version allowed per content item';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_single_current_published
    BEFORE INSERT OR UPDATE ON content_versions
    FOR EACH ROW
    EXECUTE FUNCTION check_single_current_published();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- This migration creates a complete content versioning system with:
-- 1. Full multi-site support with data isolation
-- 2. Preview token generation and management
-- 3. Version commenting and collaboration
-- 4. Activity tracking and audit logging
-- 5. Performance-optimized indexes
-- 6. Data integrity constraints
-- 7. Helper functions for common operations
-- 8. Migration of existing content to versioning system