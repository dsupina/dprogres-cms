-- Initialize CMS Database
-- Create database
CREATE DATABASE cms_db;

-- Connect to the database
\c cms_db;

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