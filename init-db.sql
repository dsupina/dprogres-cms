-- Initialize CMS Database
-- The database is created by Docker environment variables
-- Connect to the database is not needed as init script runs in the context of cms_db

-- Users table for admin authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    role VARCHAR(50) DEFAULT 'author',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories for blog organization
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    seo_indexed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main posts table
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    excerpt TEXT,
    content TEXT,
    featured_image VARCHAR(255),
    status VARCHAR(20) DEFAULT 'draft',
    category_id INTEGER REFERENCES categories(id),
    author_id INTEGER REFERENCES users(id),
    meta_title VARCHAR(255),
    meta_description TEXT,
    seo_indexed BOOLEAN DEFAULT TRUE,
    scheduled_at TIMESTAMP,
    view_count INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Static pages
CREATE TABLE pages (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    content TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    template VARCHAR(100),
    meta_title VARCHAR(255),
    meta_description TEXT,
    seo_indexed BOOLEAN DEFAULT TRUE,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tags system
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL
);

-- Post-Tag relationship
CREATE TABLE post_tags (
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- Media files
CREATE TABLE media_files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    file_path VARCHAR(500),
    file_size INTEGER,
    mime_type VARCHAR(100),
    alt_text VARCHAR(255),
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Site settings
CREATE TABLE site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Page templates
CREATE TABLE IF NOT EXISTS page_templates (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    schema JSONB DEFAULT '{}'::jsonb,
    default_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_media_files_uploaded_by ON media_files(uploaded_by);

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES 
('admin@example.com', '$2b$10$8.xS8YO5.WYhYJNvdS9rEO1qDT7aQzNhpL8vDCqT7rXBzS5Z8YC2u', 'admin', 'Admin', 'User');

-- Insert default categories
INSERT INTO categories (name, slug, description) VALUES 
('Technology', 'technology', 'Posts about technology and programming'),
('Lifestyle', 'lifestyle', 'Personal and lifestyle posts'),
('Business', 'business', 'Business and entrepreneurship content');

-- Insert default site settings
INSERT INTO site_settings (key, value) VALUES
('site_title', 'My Personal CMS'),
('site_description', 'A lightweight CMS for personal blogging'),
('site_url', 'https://example.com'),
('posts_per_page', '10'),
('allow_comments', 'true'),
('theme', 'default');

-- ==============================================
-- MULTI-DOMAIN SUPPORT
-- ==============================================

-- Create domains table with proper constraints
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    hostname VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    verification_token VARCHAR(255),
    verified_at TIMESTAMP,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Hostname format validation
    CONSTRAINT check_hostname_format CHECK (
        hostname ~ '^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?(\.[-a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?)*$'
    ),

    -- Minimum length check
    CONSTRAINT check_hostname_length CHECK (length(hostname) >= 3)
);

-- Create unique partial index for default domain (only one can be default)
CREATE UNIQUE INDEX idx_domains_default ON domains(is_default) WHERE is_default = TRUE;

-- Create indexes for efficient lookups
CREATE INDEX idx_domains_hostname ON domains(hostname);
CREATE INDEX idx_domains_active ON domains(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_domains_hostname_active ON domains(hostname, is_active) WHERE is_active = TRUE;

-- Add domain_id to content tables (nullable initially for safe migration)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS domain_id INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS domain_id INTEGER;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS domain_id INTEGER;

-- Add foreign key constraints with SET NULL on delete for safety
ALTER TABLE pages
    DROP CONSTRAINT IF EXISTS fk_pages_domain,
    ADD CONSTRAINT fk_pages_domain
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL;

ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS fk_posts_domain,
    ADD CONSTRAINT fk_posts_domain
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL;

ALTER TABLE categories
    DROP CONSTRAINT IF EXISTS fk_categories_domain,
    ADD CONSTRAINT fk_categories_domain
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL;

-- Create indexes for domain-based filtering
CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain_id);
CREATE INDEX IF NOT EXISTS idx_pages_domain_published ON pages(domain_id, published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_posts_domain ON posts(domain_id);
CREATE INDEX IF NOT EXISTS idx_posts_domain_status ON posts(domain_id, status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_categories_domain ON categories(domain_id);

-- Drop existing unique constraints on slugs (if they exist)
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_slug_key;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_slug_key;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;

-- Add domain-scoped unique constraints
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_domain_slug_unique;
ALTER TABLE pages ADD CONSTRAINT pages_domain_slug_unique UNIQUE(domain_id, slug);

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_domain_slug_unique;
ALTER TABLE posts ADD CONSTRAINT posts_domain_slug_unique UNIQUE(domain_id, slug);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_domain_slug_unique;
ALTER TABLE categories ADD CONSTRAINT categories_domain_slug_unique UNIQUE(domain_id, slug);

-- Insert default domain for localhost (development)
INSERT INTO domains (hostname, is_default, is_active, verified_at)
VALUES ('localhost', TRUE, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (hostname) DO UPDATE
SET is_default = TRUE, is_active = TRUE;

-- Update function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for domains table
DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;
CREATE TRIGGER update_domains_updated_at
    BEFORE UPDATE ON domains
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing content to default domain
UPDATE pages
SET domain_id = (SELECT id FROM domains WHERE is_default = TRUE LIMIT 1)
WHERE domain_id IS NULL;

UPDATE posts
SET domain_id = (SELECT id FROM domains WHERE is_default = TRUE LIMIT 1)
WHERE domain_id IS NULL;

UPDATE categories
SET domain_id = (SELECT id FROM domains WHERE is_default = TRUE LIMIT 1)
WHERE domain_id IS NULL; -- ==============================================
-- SITES AND MENU SYSTEM
-- Migration: Add sites table and menu_items table
-- ==============================================

-- Create sites table to support domain-based site management
CREATE TABLE IF NOT EXISTS sites (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    base_path VARCHAR(255) DEFAULT '/' NOT NULL,
    title VARCHAR(255),
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Ensure unique domain + base_path combination
    CONSTRAINT unique_domain_base_path UNIQUE(domain_id, base_path),

    -- Base path format validation
    CONSTRAINT check_base_path_format CHECK (
        base_path ~ '^/([-a-z0-9_/]*)?$'
    )
);

-- Create unique partial index for default site (only one default per domain)
CREATE UNIQUE INDEX idx_sites_default ON sites(domain_id) WHERE is_default = TRUE;

-- Create indexes for efficient lookups
CREATE INDEX idx_sites_domain_active ON sites(domain_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_sites_domain_base ON sites(domain_id, base_path);

-- Create menu_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE, -- Will be migrated to site_id
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE, -- New field for site association
    parent_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
    position INTEGER DEFAULT 0 NOT NULL,
    depth INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_published BOOLEAN DEFAULT TRUE NOT NULL,
    menu_order INTEGER DEFAULT 0 NOT NULL,
    target VARCHAR(20) DEFAULT '_self',
    css_class VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for menu_items
CREATE INDEX IF NOT EXISTS idx_menu_items_site ON menu_items(site_id, position) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_menu_items_domain ON menu_items(domain_id, position) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_id, position);
CREATE INDEX IF NOT EXISTS idx_menu_items_page ON menu_items(page_id);

-- Add site_id to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE;

-- Add site_id to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE;

-- Add site_id to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE;

-- Create indexes for site-based content filtering
CREATE INDEX IF NOT EXISTS idx_pages_site ON pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_site_published ON pages(site_id, published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_pages_site_slug ON pages(site_id, slug);

CREATE INDEX IF NOT EXISTS idx_posts_site ON posts(site_id);
CREATE INDEX IF NOT EXISTS idx_posts_site_status ON posts(site_id, status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_posts_site_slug ON posts(site_id, slug);

CREATE INDEX IF NOT EXISTS idx_categories_site ON categories(site_id);
CREATE INDEX IF NOT EXISTS idx_categories_site_slug ON categories(site_id, slug);

-- Drop existing domain-scoped unique constraints if they exist
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_domain_slug_unique;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_domain_slug_unique;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_domain_slug_unique;

-- Add site-scoped unique constraints
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_site_slug_unique;
ALTER TABLE pages ADD CONSTRAINT pages_site_slug_unique UNIQUE(site_id, slug);

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_site_slug_unique;
ALTER TABLE posts ADD CONSTRAINT posts_site_slug_unique UNIQUE(site_id, slug);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_site_slug_unique;
ALTER TABLE categories ADD CONSTRAINT categories_site_slug_unique UNIQUE(site_id, slug);

-- Create trigger for sites updated_at
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
CREATE TRIGGER update_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for menu_items updated_at
DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- DATA MIGRATION
-- ==============================================

-- Create default sites for existing domains
INSERT INTO sites (domain_id, name, base_path, is_default, is_active, title, description)
SELECT
    d.id,
    d.hostname || ' Site' AS name,
    '/' AS base_path,
    TRUE AS is_default,
    d.is_active,
    COALESCE((d.settings->>'title')::text, d.hostname) AS title,
    COALESCE((d.settings->>'description')::text, 'Default site for ' || d.hostname) AS description
FROM domains d
WHERE NOT EXISTS (
    SELECT 1 FROM sites s WHERE s.domain_id = d.id AND s.is_default = TRUE
);

-- Migrate existing pages to default sites
UPDATE pages p
SET site_id = (
    SELECT s.id
    FROM sites s
    WHERE s.domain_id = p.domain_id
    AND s.is_default = TRUE
    LIMIT 1
)
WHERE p.site_id IS NULL AND p.domain_id IS NOT NULL;

-- Migrate existing posts to default sites
UPDATE posts p
SET site_id = (
    SELECT s.id
    FROM sites s
    WHERE s.domain_id = p.domain_id
    AND s.is_default = TRUE
    LIMIT 1
)
WHERE p.site_id IS NULL AND p.domain_id IS NOT NULL;

-- Migrate existing categories to default sites
UPDATE categories c
SET site_id = (
    SELECT s.id
    FROM sites s
    WHERE s.domain_id = c.domain_id
    AND s.is_default = TRUE
    LIMIT 1
)
WHERE c.site_id IS NULL AND c.domain_id IS NOT NULL;

-- Migrate existing menu_items to default sites
UPDATE menu_items mi
SET site_id = (
    SELECT s.id
    FROM sites s
    WHERE s.domain_id = mi.domain_id
    AND s.is_default = TRUE
    LIMIT 1
)
WHERE mi.site_id IS NULL AND mi.domain_id IS NOT NULL;

-- Handle content without domain_id (assign to default domain's default site)
UPDATE pages
SET site_id = (
    SELECT s.id
    FROM sites s
    JOIN domains d ON s.domain_id = d.id
    WHERE d.is_default = TRUE AND s.is_default = TRUE
    LIMIT 1
)
WHERE site_id IS NULL AND domain_id IS NULL;

UPDATE posts
SET site_id = (
    SELECT s.id
    FROM sites s
    JOIN domains d ON s.domain_id = d.id
    WHERE d.is_default = TRUE AND s.is_default = TRUE
    LIMIT 1
)
WHERE site_id IS NULL AND domain_id IS NULL;

UPDATE categories
SET site_id = (
    SELECT s.id
    FROM sites s
    JOIN domains d ON s.domain_id = d.id
    WHERE d.is_default = TRUE AND s.is_default = TRUE
    LIMIT 1
)
WHERE site_id IS NULL AND domain_id IS NULL;

-- ==============================================
-- VALIDATION
-- ==============================================

-- Verify migration success
DO $$
DECLARE
    orphaned_pages INTEGER;
    orphaned_posts INTEGER;
    orphaned_categories INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphaned_pages FROM pages WHERE site_id IS NULL;
    SELECT COUNT(*) INTO orphaned_posts FROM posts WHERE site_id IS NULL;
    SELECT COUNT(*) INTO orphaned_categories FROM categories WHERE site_id IS NULL;

    IF orphaned_pages > 0 OR orphaned_posts > 0 OR orphaned_categories > 0 THEN
        RAISE WARNING 'Migration completed with orphaned content: % pages, % posts, % categories',
            orphaned_pages, orphaned_posts, orphaned_categories;
    ELSE
        RAISE NOTICE 'Migration completed successfully. All content migrated to sites.';
    END IF;
END $$;