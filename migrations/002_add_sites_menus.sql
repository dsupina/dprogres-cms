-- ==============================================
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
        base_path ~ '^/([a-z0-9-_/]*)?$'
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