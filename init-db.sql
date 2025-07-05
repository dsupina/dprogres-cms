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