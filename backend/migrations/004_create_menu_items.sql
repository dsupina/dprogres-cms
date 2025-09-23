-- Migration: Create menu_items table for domain-specific hierarchical menus
-- Date: 2025-01-23
-- Description: Adds menu management system with hierarchy support, circular reference prevention,
--              and performance optimizations

-- Create menu_items table
CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  depth INTEGER NOT NULL DEFAULT 0, -- Denormalized for performance
  path_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[], -- Materialized path for faster queries
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT menu_items_label_length CHECK (char_length(label) > 0 AND char_length(label) <= 255),
  CONSTRAINT menu_items_url_or_page CHECK (
    (url IS NOT NULL AND page_id IS NULL) OR
    (url IS NULL AND page_id IS NOT NULL) OR
    (url IS NULL AND page_id IS NULL) -- Parent items may have neither
  ),
  CONSTRAINT menu_items_depth_limit CHECK (depth <= 3), -- Max 3 levels deep
  CONSTRAINT menu_items_position_non_negative CHECK (position >= 0),
  CONSTRAINT menu_items_no_self_parent CHECK (id != parent_id)
);

-- Create indexes for performance
CREATE INDEX idx_menu_items_domain_id ON menu_items(domain_id);
CREATE INDEX idx_menu_items_parent_id ON menu_items(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_menu_items_domain_parent ON menu_items(domain_id, parent_id);
CREATE INDEX idx_menu_items_domain_position ON menu_items(domain_id, position);
CREATE INDEX idx_menu_items_page_id ON menu_items(page_id) WHERE page_id IS NOT NULL;
CREATE INDEX idx_menu_items_is_active ON menu_items(is_active) WHERE is_active = true;
CREATE INDEX idx_menu_items_path_ids ON menu_items USING GIN(path_ids);

-- Unique constraint on position within same parent/domain
CREATE UNIQUE INDEX idx_menu_items_unique_position
ON menu_items(domain_id, COALESCE(parent_id, 0), position);

-- Function to prevent circular references
CREATE OR REPLACE FUNCTION check_menu_circular_reference()
RETURNS TRIGGER AS $$
DECLARE
  current_parent INTEGER;
  iterations INTEGER := 0;
  max_iterations INTEGER := 10;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  current_parent := NEW.parent_id;

  WHILE current_parent IS NOT NULL AND iterations < max_iterations LOOP
    IF current_parent = NEW.id THEN
      RAISE EXCEPTION 'Circular reference detected in menu hierarchy';
    END IF;

    SELECT parent_id INTO current_parent
    FROM menu_items
    WHERE id = current_parent;

    iterations := iterations + 1;
  END LOOP;

  IF iterations >= max_iterations THEN
    RAISE EXCEPTION 'Menu hierarchy too deep or possible circular reference';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update depth and path_ids
CREATE OR REPLACE FUNCTION update_menu_depth_and_path()
RETURNS TRIGGER AS $$
DECLARE
  parent_depth INTEGER;
  parent_path INTEGER[];
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    NEW.path_ids := ARRAY[NEW.id];
  ELSE
    SELECT depth, path_ids INTO parent_depth, parent_path
    FROM menu_items
    WHERE id = NEW.parent_id;

    IF parent_depth >= 3 THEN
      RAISE EXCEPTION 'Maximum menu depth (3 levels) exceeded';
    END IF;

    NEW.depth := parent_depth + 1;
    NEW.path_ids := parent_path || NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to cascade depth/path updates to children
CREATE OR REPLACE FUNCTION cascade_menu_updates()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    -- Update all descendants
    WITH RECURSIVE descendants AS (
      SELECT id, parent_id, 1 as relative_depth
      FROM menu_items
      WHERE parent_id = NEW.id

      UNION ALL

      SELECT m.id, m.parent_id, d.relative_depth + 1
      FROM menu_items m
      INNER JOIN descendants d ON m.parent_id = d.id
      WHERE d.relative_depth < 10 -- Safety limit
    )
    UPDATE menu_items
    SET
      depth = NEW.depth + descendants.relative_depth,
      path_ids = NEW.path_ids || array_remove(menu_items.path_ids, NEW.id),
      updated_at = NOW()
    FROM descendants
    WHERE menu_items.id = descendants.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_menu_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_check_circular_reference
  BEFORE INSERT OR UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION check_menu_circular_reference();

CREATE TRIGGER trigger_update_depth_and_path
  BEFORE INSERT OR UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_menu_depth_and_path();

CREATE TRIGGER trigger_cascade_updates
  AFTER UPDATE ON menu_items
  FOR EACH ROW
  WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
  EXECUTE FUNCTION cascade_menu_updates();

CREATE TRIGGER trigger_update_timestamp
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_menu_timestamp();

-- Function to get menu tree for a domain (using recursive CTE)
CREATE OR REPLACE FUNCTION get_menu_tree(p_domain_id INTEGER)
RETURNS TABLE(
  id INTEGER,
  parent_id INTEGER,
  label VARCHAR,
  url VARCHAR,
  page_id INTEGER,
  position INTEGER,
  depth INTEGER,
  path_ids INTEGER[],
  children_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE menu_tree AS (
    -- Root level items
    SELECT
      m.id,
      m.parent_id,
      m.label,
      m.url,
      m.page_id,
      m.position,
      m.depth,
      m.path_ids,
      (SELECT COUNT(*) FROM menu_items c WHERE c.parent_id = m.id)::BIGINT as children_count
    FROM menu_items m
    WHERE m.domain_id = p_domain_id
      AND m.parent_id IS NULL
      AND m.is_active = true

    UNION ALL

    -- Recursive children
    SELECT
      m.id,
      m.parent_id,
      m.label,
      m.url,
      m.page_id,
      m.position,
      m.depth,
      m.path_ids,
      (SELECT COUNT(*) FROM menu_items c WHERE c.parent_id = m.id)::BIGINT as children_count
    FROM menu_items m
    INNER JOIN menu_tree mt ON m.parent_id = mt.id
    WHERE m.is_active = true
  )
  SELECT * FROM menu_tree
  ORDER BY path_ids, position;
END;
$$ LANGUAGE plpgsql;

-- Function to reorder menu items
CREATE OR REPLACE FUNCTION reorder_menu_items(
  p_domain_id INTEGER,
  p_parent_id INTEGER,
  p_item_ids INTEGER[]
) RETURNS BOOLEAN AS $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(p_item_ids, 1) LOOP
    UPDATE menu_items
    SET position = i - 1,
        updated_at = NOW()
    WHERE id = p_item_ids[i]
      AND domain_id = p_domain_id
      AND (parent_id = p_parent_id OR (parent_id IS NULL AND p_parent_id IS NULL));
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE menu_items IS 'Hierarchical navigation menus for each domain';
COMMENT ON COLUMN menu_items.domain_id IS 'Domain this menu item belongs to';
COMMENT ON COLUMN menu_items.parent_id IS 'Parent menu item for hierarchical structure';
COMMENT ON COLUMN menu_items.label IS 'Display text for the menu item';
COMMENT ON COLUMN menu_items.url IS 'External URL (mutually exclusive with page_id)';
COMMENT ON COLUMN menu_items.page_id IS 'Internal page reference (mutually exclusive with url)';
COMMENT ON COLUMN menu_items.position IS 'Sort order within the same parent level';
COMMENT ON COLUMN menu_items.depth IS 'Depth in hierarchy (0=root, max=3)';
COMMENT ON COLUMN menu_items.path_ids IS 'Materialized path of ancestor IDs for efficient queries';
COMMENT ON COLUMN menu_items.is_active IS 'Whether this menu item is visible';

-- Sample data for testing (commented out for production)
-- INSERT INTO menu_items (domain_id, label, position) VALUES
-- (1, 'Home', 0),
-- (1, 'About', 1),
-- (1, 'Services', 2),
-- (1, 'Contact', 3);