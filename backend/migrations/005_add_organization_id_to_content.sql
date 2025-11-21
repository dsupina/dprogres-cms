-- Migration: 005_add_organization_id_to_content.sql
-- Epic: EPIC-003 SaaS Foundation (SF-001)
-- Purpose: Add organization_id to all content tables for multi-tenant isolation
-- Created: 2025-01-21

-- NOTE: This migration requires a default organization to exist
-- Run this after creating at least one organization (ID=1 recommended)

-- Sites
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

-- Migrate existing data to default org (only if column was just added and is NULL)
UPDATE sites SET organization_id = 1 WHERE organization_id IS NULL;

-- Make NOT NULL after data migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sites' AND column_name = 'organization_id'
             AND is_nullable = 'YES') THEN
    ALTER TABLE sites ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sites_organization ON sites(organization_id);

-- Posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE posts SET organization_id = 1 WHERE organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'posts' AND column_name = 'organization_id'
             AND is_nullable = 'YES') THEN
    ALTER TABLE posts ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_organization ON posts(organization_id);

-- Pages
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE pages SET organization_id = 1 WHERE organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pages' AND column_name = 'organization_id'
             AND is_nullable = 'YES') THEN
    ALTER TABLE pages ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pages_organization ON pages(organization_id);

-- Media files
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE media_files SET organization_id = 1 WHERE organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'media_files' AND column_name = 'organization_id'
             AND is_nullable = 'YES') THEN
    ALTER TABLE media_files ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_organization ON media_files(organization_id);

-- Categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE categories SET organization_id = 1 WHERE organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'categories' AND column_name = 'organization_id'
             AND is_nullable = 'YES') THEN
    ALTER TABLE categories ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_organization ON categories(organization_id);

-- Tags
ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE tags SET organization_id = 1 WHERE organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tags' AND column_name = 'organization_id'
             AND is_nullable = 'YES') THEN
    ALTER TABLE tags ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tags_organization ON tags(organization_id);

-- Enable Row-Level Security (RLS) for defense-in-depth
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (enforced when app sets current_organization_id)
DROP POLICY IF EXISTS org_isolation_sites ON sites;
CREATE POLICY org_isolation_sites ON sites
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

DROP POLICY IF EXISTS org_isolation_posts ON posts;
CREATE POLICY org_isolation_posts ON posts
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

DROP POLICY IF EXISTS org_isolation_pages ON pages;
CREATE POLICY org_isolation_pages ON pages
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

DROP POLICY IF EXISTS org_isolation_media ON media_files;
CREATE POLICY org_isolation_media ON media_files
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

DROP POLICY IF EXISTS org_isolation_categories ON categories;
CREATE POLICY org_isolation_categories ON categories
  USING (organization_id = current_setting('app.current_organization_id', true)::int);

-- Comments
COMMENT ON COLUMN sites.organization_id IS 'Foreign key for multi-tenant isolation';
COMMENT ON POLICY org_isolation_sites ON sites IS 'Row-level security: Users can only access their organization data';
