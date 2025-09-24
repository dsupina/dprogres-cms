-- ==============================================
-- ROLLBACK: Sites and Menu System
-- This script reverts the changes made by 002_add_sites_menus.sql
-- ==============================================

-- Store site to domain mapping for rollback
CREATE TEMP TABLE IF NOT EXISTS site_domain_mapping AS
SELECT
    s.id as site_id,
    s.domain_id,
    d.id as domain_id_verify
FROM sites s
JOIN domains d ON s.domain_id = d.id;

-- Revert pages back to domain_id
UPDATE pages p
SET domain_id = (
    SELECT sdm.domain_id
    FROM site_domain_mapping sdm
    WHERE sdm.site_id = p.site_id
)
WHERE p.site_id IS NOT NULL;

-- Revert posts back to domain_id
UPDATE posts p
SET domain_id = (
    SELECT sdm.domain_id
    FROM site_domain_mapping sdm
    WHERE sdm.site_id = p.site_id
)
WHERE p.site_id IS NOT NULL;

-- Revert categories back to domain_id
UPDATE categories c
SET domain_id = (
    SELECT sdm.domain_id
    FROM site_domain_mapping sdm
    WHERE sdm.site_id = c.site_id
)
WHERE c.site_id IS NOT NULL;

-- Revert menu_items back to domain_id
UPDATE menu_items mi
SET domain_id = (
    SELECT sdm.domain_id
    FROM site_domain_mapping sdm
    WHERE sdm.site_id = mi.site_id
)
WHERE mi.site_id IS NOT NULL;

-- Drop site-scoped unique constraints
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_site_slug_unique;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_site_slug_unique;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_site_slug_unique;

-- Restore domain-scoped unique constraints
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_domain_slug_unique;
ALTER TABLE pages ADD CONSTRAINT pages_domain_slug_unique UNIQUE(domain_id, slug);

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_domain_slug_unique;
ALTER TABLE posts ADD CONSTRAINT posts_domain_slug_unique UNIQUE(domain_id, slug);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_domain_slug_unique;
ALTER TABLE categories ADD CONSTRAINT categories_domain_slug_unique UNIQUE(domain_id, slug);

-- Drop indexes for site-based filtering
DROP INDEX IF EXISTS idx_pages_site;
DROP INDEX IF EXISTS idx_pages_site_published;
DROP INDEX IF EXISTS idx_pages_site_slug;
DROP INDEX IF EXISTS idx_posts_site;
DROP INDEX IF EXISTS idx_posts_site_status;
DROP INDEX IF EXISTS idx_posts_site_slug;
DROP INDEX IF EXISTS idx_categories_site;
DROP INDEX IF EXISTS idx_categories_site_slug;
DROP INDEX IF EXISTS idx_menu_items_site;

-- Remove site_id columns
ALTER TABLE pages DROP COLUMN IF EXISTS site_id;
ALTER TABLE posts DROP COLUMN IF EXISTS site_id;
ALTER TABLE categories DROP COLUMN IF EXISTS site_id;
ALTER TABLE menu_items DROP COLUMN IF EXISTS site_id;

-- Drop sites table triggers
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;

-- Drop sites table indexes
DROP INDEX IF EXISTS idx_sites_default;
DROP INDEX IF EXISTS idx_sites_domain_active;
DROP INDEX IF EXISTS idx_sites_domain_base;

-- Drop sites table
DROP TABLE IF EXISTS sites CASCADE;

-- Verify rollback
DO $$
DECLARE
    sites_exist BOOLEAN;
    site_columns_exist BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sites'
    ) INTO sites_exist;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'site_id'
        AND table_name IN ('pages', 'posts', 'categories', 'menu_items')
    ) INTO site_columns_exist;

    IF sites_exist OR site_columns_exist THEN
        RAISE WARNING 'Rollback may be incomplete. Sites table or site_id columns still exist.';
    ELSE
        RAISE NOTICE 'Rollback completed successfully. Sites functionality removed.';
    END IF;
END $$;