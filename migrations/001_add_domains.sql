-- Migration: Add multi-domain support
-- Version: 001
-- Date: 2025-09-23

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
        hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
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
WHERE domain_id IS NULL;