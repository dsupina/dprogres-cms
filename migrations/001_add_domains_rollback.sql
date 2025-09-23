-- Rollback Migration: Remove multi-domain support
-- Version: 001_rollback
-- Date: 2025-09-23

-- Remove domain-scoped unique constraints
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_domain_slug_unique;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_domain_slug_unique;
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_domain_slug_unique;

-- Restore original unique constraints on slugs
ALTER TABLE pages ADD CONSTRAINT pages_slug_key UNIQUE(slug);
ALTER TABLE posts ADD CONSTRAINT posts_slug_key UNIQUE(slug);
ALTER TABLE categories ADD CONSTRAINT categories_slug_key UNIQUE(slug);

-- Drop indexes for domain-based filtering
DROP INDEX IF EXISTS idx_categories_domain;
DROP INDEX IF EXISTS idx_posts_domain_status;
DROP INDEX IF EXISTS idx_posts_domain;
DROP INDEX IF EXISTS idx_pages_domain_published;
DROP INDEX IF EXISTS idx_pages_domain;

-- Remove foreign key constraints
ALTER TABLE categories DROP CONSTRAINT IF EXISTS fk_categories_domain;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS fk_posts_domain;
ALTER TABLE pages DROP CONSTRAINT IF EXISTS fk_pages_domain;

-- Remove domain_id columns
ALTER TABLE categories DROP COLUMN IF EXISTS domain_id;
ALTER TABLE posts DROP COLUMN IF EXISTS domain_id;
ALTER TABLE pages DROP COLUMN IF EXISTS domain_id;

-- Drop triggers
DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;

-- Drop indexes
DROP INDEX IF EXISTS idx_domains_hostname_active;
DROP INDEX IF EXISTS idx_domains_active;
DROP INDEX IF EXISTS idx_domains_hostname;
DROP INDEX IF EXISTS idx_domains_default;

-- Drop domains table
DROP TABLE IF EXISTS domains CASCADE;

-- Drop update function if no other tables use it
-- (commented out to be safe - uncomment if certain no other tables use this)
-- DROP FUNCTION IF EXISTS update_updated_at_column();