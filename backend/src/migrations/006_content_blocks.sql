-- Migration: create content block tables and schemas
-- Provides storage for structured content blocks that power the block editor

CREATE TABLE IF NOT EXISTS content_block_schemas (
  id SERIAL PRIMARY KEY,
  block_type VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_prompt TEXT,
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('post', 'page')),
  entity_id INTEGER NOT NULL,
  parent_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
  block_type VARCHAR(100) NOT NULL,
  block_variant VARCHAR(100),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  ai_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_blocks_entity ON content_blocks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_content_blocks_parent ON content_blocks(parent_id);
CREATE INDEX IF NOT EXISTS idx_content_blocks_type ON content_blocks(block_type);

CREATE TRIGGER set_content_block_schema_updated_at
  BEFORE UPDATE ON content_block_schemas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_content_blocks_updated_at
  BEFORE UPDATE ON content_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO content_block_schemas (block_type, title, description, schema, ai_prompt, defaults)
VALUES
  (
    'hero',
    'Hero Banner',
    'Large hero section with title, subtitle, media, and call to action.',
    '{"required": ["title"], "properties": {"title": {"type": "string"}, "subtitle": {"type": "string"}, "mediaId": {"type": "number"}, "mediaUrl": {"type": "string"}, "ctaLabel": {"type": "string"}, "ctaHref": {"type": "string"}}}',
    'Generate a compelling hero section headline and subtitle for a blog post about {{topic}}.',
    '{"variant": "center", "ctaLabel": "Read more", "ctaHref": "/blog"}'
  ),
  (
    'heading',
    'Heading',
    'Standalone heading block that maps to h1-h3.',
    '{"required": ["text"], "properties": {"text": {"type": "string"}, "level": {"type": "number"}}}',
    'Write a concise headline for a section about {{topic}}.',
    '{"level": 2}'
  ),
  (
    'text',
    'Rich Text',
    'Paragraph text block supporting markdown/HTML content.',
    '{"required": ["body"], "properties": {"body": {"type": "string"}}}',
    'Write a short paragraph for a blog section about {{topic}}.',
    '{}'
  ),
  (
    'image',
    'Image',
    'Image block that references a media library asset or external URL.',
    '{"properties": {"mediaId": {"type": "number"}, "src": {"type": "string"}, "alt": {"type": "string"}, "caption": {"type": "string"}}}',
    'Suggest an illustrative image description for a section about {{topic}}.',
    '{}'
  ),
  (
    'quote',
    'Quote',
    'Pull quote with attribution.',
    '{"required": ["quote"], "properties": {"quote": {"type": "string"}, "attribution": {"type": "string"}}}',
    'Provide an inspirational quote about {{topic}}.',
    '{}'
  ),
  (
    'cta',
    'Call To Action',
    'Primary call to action banner with text and button.',
    '{"required": ["title", "ctaLabel"], "properties": {"title": {"type": "string"}, "body": {"type": "string"}, "ctaLabel": {"type": "string"}, "ctaHref": {"type": "string"}}}',
    'Write a call to action encouraging readers interested in {{topic}}.',
    '{"ctaHref": "/contact"}'
  )
ON CONFLICT (block_type) DO NOTHING;
