-- Migration: Content Versioning & Draft Preview System (Multi-Site Support)
-- Version: 003
-- Date: 2025-09-26
-- Ticket: CV-001
-- Updated: Added site_id and locale support for multi-site architecture

-- Enable pgcrypto extension for secure token generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================
-- Create content_versions table
-- =========================================
-- Primary storage for all content versions
CREATE TABLE IF NOT EXISTS content_versions (
    id SERIAL PRIMARY KEY,

    -- Site context (for multi-site support)
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    locale VARCHAR(10) DEFAULT 'en-US',

    -- Content type and reference
    content_type VARCHAR(50) NOT NULL, -- 'post' or 'page'
    content_id INTEGER NOT NULL,

    -- Version metadata
    version_number INTEGER NOT NULL,
    version_type VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, published, auto_save, archived
    is_current_draft BOOLEAN DEFAULT FALSE,
    is_current_published BOOLEAN DEFAULT FALSE,

    -- Content snapshot (complete content at this version)
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    content TEXT,
    excerpt TEXT,
    data JSONB DEFAULT '{}', -- For pages.data and other flexible content
    meta_data JSONB DEFAULT '{}', -- SEO meta, featured image, etc.

    -- Authorship and timing
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at TIMESTAMP,

    -- Change tracking
    change_summary TEXT,
    diff_from_previous JSONB, -- Optional: store diff for storage optimization

    -- Constraints
    CONSTRAINT check_version_type CHECK (
        version_type IN ('draft', 'published', 'auto_save', 'archived')
    ),
    CONSTRAINT check_content_type CHECK (
        content_type IN ('post', 'page')
    ),
    -- Ensure version numbers are positive
    CONSTRAINT check_version_number CHECK (version_number > 0)
);

-- Create indexes for efficient queries (with site context)
CREATE INDEX idx_content_versions_site_lookup ON content_versions(site_id, content_type, content_id, version_number DESC);
CREATE INDEX idx_content_versions_site_current ON content_versions(site_id, content_type, content_id)
    WHERE is_current_draft = TRUE OR is_current_published = TRUE;
CREATE INDEX idx_content_versions_site_locale ON content_versions(site_id, locale, content_type, content_id);
CREATE INDEX idx_content_versions_type ON content_versions(version_type);
CREATE INDEX idx_content_versions_created_by ON content_versions(created_by);
CREATE INDEX idx_content_versions_created_at ON content_versions(created_at DESC);
CREATE INDEX idx_content_versions_site ON content_versions(site_id);

-- Create unique partial indexes to ensure only one current draft/published per content item per site
CREATE UNIQUE INDEX unique_current_draft_per_site ON content_versions(site_id, content_type, content_id)
    WHERE is_current_draft = TRUE;
CREATE UNIQUE INDEX unique_current_published_per_site ON content_versions(site_id, content_type, content_id)
    WHERE is_current_published = TRUE;

-- Add GIN index for JSONB fields for efficient querying
CREATE INDEX idx_content_versions_data_gin ON content_versions USING GIN(data);
CREATE INDEX idx_content_versions_meta_gin ON content_versions USING GIN(meta_data);

-- =========================================
-- Create preview_tokens table
-- =========================================
-- Stores secure preview access tokens with multi-site support
CREATE TABLE IF NOT EXISTS preview_tokens (
    id SERIAL PRIMARY KEY,

    -- Site and domain context
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
    locale VARCHAR(10) DEFAULT 'en-US',

    -- Token details
    token VARCHAR(255) UNIQUE NOT NULL,
    token_type VARCHAR(20) DEFAULT 'preview', -- preview, share, embed

    -- Link to specific version
    version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,

    -- Access control
    created_by INTEGER NOT NULL REFERENCES users(id),
    expires_at TIMESTAMP NOT NULL,
    max_uses INTEGER, -- NULL = unlimited
    use_count INTEGER DEFAULT 0,

    -- Additional settings
    password_protected BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255), -- If password_protected = true
    allowed_ips INET[], -- Optional IP restriction
    settings JSONB DEFAULT '{}', -- Flexible settings storage

    -- Tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,

    -- Constraints
    CONSTRAINT check_token_type CHECK (
        token_type IN ('preview', 'share', 'embed')
    ),
    CONSTRAINT check_max_uses CHECK (
        max_uses IS NULL OR max_uses > 0
    ),
    CONSTRAINT check_password_consistency CHECK (
        (password_protected = FALSE AND password_hash IS NULL) OR
        (password_protected = TRUE AND password_hash IS NOT NULL)
    )
);

-- Create indexes for token lookups (with site context)
CREATE INDEX idx_preview_tokens_token ON preview_tokens(token);
CREATE INDEX idx_preview_tokens_site ON preview_tokens(site_id);
CREATE INDEX idx_preview_tokens_site_version ON preview_tokens(site_id, version_id);
CREATE INDEX idx_preview_tokens_domain ON preview_tokens(domain_id) WHERE domain_id IS NOT NULL;
CREATE INDEX idx_preview_tokens_expires ON preview_tokens(expires_at);
CREATE INDEX idx_preview_tokens_created_by ON preview_tokens(created_by);

-- =========================================
-- Create version_comments table
-- =========================================
-- Enables collaborative review with comments (multi-site support)
CREATE TABLE IF NOT EXISTS version_comments (
    id SERIAL PRIMARY KEY,

    -- Site context
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

    -- Link to version
    version_id INTEGER NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,

    -- Comment hierarchy (for threading)
    parent_comment_id INTEGER REFERENCES version_comments(id) ON DELETE CASCADE,

    -- Comment content
    comment_text TEXT NOT NULL,
    comment_type VARCHAR(20) DEFAULT 'general', -- general, suggestion, issue, approval

    -- Status tracking
    status VARCHAR(20) DEFAULT 'active', -- active, resolved, archived
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id),

    -- Authorship
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Optional position reference (for inline comments)
    position_data JSONB, -- Store line numbers, character positions, etc.

    -- Constraints
    CONSTRAINT check_comment_type CHECK (
        comment_type IN ('general', 'suggestion', 'issue', 'approval')
    ),
    CONSTRAINT check_status CHECK (
        status IN ('active', 'resolved', 'archived')
    ),
    -- Prevent self-referencing
    CONSTRAINT check_no_self_reference CHECK (
        parent_comment_id IS NULL OR parent_comment_id != id
    )
);

-- Create indexes for comment retrieval (with site context)
CREATE INDEX idx_version_comments_site ON version_comments(site_id);
CREATE INDEX idx_version_comments_site_version ON version_comments(site_id, version_id);
CREATE INDEX idx_version_comments_parent ON version_comments(parent_comment_id);
CREATE INDEX idx_version_comments_created_by ON version_comments(created_by);
CREATE INDEX idx_version_comments_site_status ON version_comments(site_id, status) WHERE status = 'active';
CREATE INDEX idx_version_comments_type ON version_comments(comment_type);

-- =========================================
-- Create trigger for automatic timestamp updates (if not exists)
-- =========================================
-- Check if function already exists (may be created by other migrations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
    ) THEN
        CREATE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END;
$$;

-- Apply trigger to version_comments
CREATE TRIGGER update_version_comments_updated_at
    BEFORE UPDATE ON version_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- Create function for auto-incrementing version numbers (site-aware)
-- =========================================
CREATE OR REPLACE FUNCTION get_next_version_number(p_site_id INTEGER, p_content_type VARCHAR, p_content_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    next_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM content_versions
    WHERE site_id = p_site_id
      AND content_type = p_content_type
      AND content_id = p_content_id;

    RETURN next_version;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- Create function for generating secure preview tokens
-- =========================================
CREATE OR REPLACE FUNCTION generate_preview_token()
RETURNS VARCHAR AS $$
BEGIN
    -- Generate a secure random token (32 bytes hex)
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- Add comments for documentation
-- =========================================
COMMENT ON TABLE content_versions IS 'Stores all versions of posts and pages with complete content snapshots';
COMMENT ON TABLE preview_tokens IS 'Manages secure preview access tokens with expiration and usage limits';
COMMENT ON TABLE version_comments IS 'Enables collaborative review through threaded comments on specific versions';

COMMENT ON COLUMN content_versions.version_type IS 'Type of version: draft (working copy), published (live), auto_save (automatic backup), archived (old version)';
COMMENT ON COLUMN content_versions.is_current_draft IS 'Flag indicating this is the current working draft (only one per content item)';
COMMENT ON COLUMN content_versions.is_current_published IS 'Flag indicating this is the currently published version (only one per content item)';
COMMENT ON COLUMN content_versions.data IS 'Flexible JSONB storage for page data and other content-specific fields';
COMMENT ON COLUMN content_versions.meta_data IS 'SEO metadata, featured images, and other meta information';

COMMENT ON COLUMN preview_tokens.max_uses IS 'Maximum number of times token can be used (NULL = unlimited)';
COMMENT ON COLUMN preview_tokens.allowed_ips IS 'Optional array of IP addresses allowed to use this token';

COMMENT ON COLUMN version_comments.position_data IS 'JSON data for inline comment positioning (line numbers, selections, etc.)';
COMMENT ON COLUMN version_comments.comment_type IS 'Type of comment: general (discussion), suggestion (proposed change), issue (problem), approval (sign-off)';

-- =========================================
-- Create initial indexes statistics
-- =========================================
ANALYZE content_versions;
ANALYZE preview_tokens;
ANALYZE version_comments;