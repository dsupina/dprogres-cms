/**
 * Secure database queries for menu operations
 * All queries use parameterized statements to prevent SQL injection
 */

import { Pool, QueryResult } from 'pg';
import { sanitizeMenuLabel, sanitizeUrl } from '../utils/sanitizer';
import { validateMenuItemUrl } from '../utils/urlValidator';

interface MenuItem {
  id?: number;
  domain_id: number;
  parent_id?: number | null;
  label: string;
  url?: string | null;
  page_id?: number | null;
  position: number;
  is_active?: boolean;
  depth?: number;
  path_ids?: number[];
  created_at?: Date;
  updated_at?: Date;
}

interface MenuTree {
  id: number;
  parent_id: number | null;
  label: string;
  url: string | null;
  page_id: number | null;
  position: number;
  depth: number;
  path_ids: number[];
  children_count: number;
  children?: MenuTree[];
}

export class MenuQueries {
  constructor(private pool: Pool) {}

  /**
   * Get all menu items for a domain in hierarchical structure
   * @param domainId - Domain ID
   * @returns Promise<MenuTree[]>
   */
  async getMenuTree(domainId: number): Promise<MenuTree[]> {
    const query = `
      SELECT * FROM get_menu_tree($1);
    `;

    try {
      const result = await this.pool.query(query, [domainId]);
      return this.buildTree(result.rows);
    } catch (error) {
      throw new Error(`Failed to fetch menu tree: ${error.message}`);
    }
  }

  /**
   * Build hierarchical tree from flat list
   * @param items - Flat list of menu items
   * @returns MenuTree[]
   */
  private buildTree(items: any[]): MenuTree[] {
    const itemsById = new Map<number, MenuTree>();
    const rootItems: MenuTree[] = [];

    // First pass: create all items
    items.forEach(item => {
      itemsById.set(item.id, {
        ...item,
        children: []
      });
    });

    // Second pass: build hierarchy
    items.forEach(item => {
      const menuItem = itemsById.get(item.id)!;
      if (item.parent_id === null) {
        rootItems.push(menuItem);
      } else {
        const parent = itemsById.get(item.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(menuItem);
        }
      }
    });

    return rootItems;
  }

  /**
   * Get a single menu item by ID
   * @param id - Menu item ID
   * @returns Promise<MenuItem | null>
   */
  async getMenuItem(id: number): Promise<MenuItem | null> {
    const query = `
      SELECT * FROM menu_items
      WHERE id = $1;
    `;

    try {
      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch menu item: ${error.message}`);
    }
  }

  /**
   * Create a new menu item with validation
   * @param item - Menu item to create
   * @returns Promise<MenuItem>
   */
  async createMenuItem(item: MenuItem): Promise<MenuItem> {
    // Sanitize inputs
    const sanitizedLabel = sanitizeMenuLabel(item.label);
    if (!sanitizedLabel) {
      throw new Error('Invalid menu label');
    }

    // Validate URL
    if (item.url) {
      const urlValidation = validateMenuItemUrl(item.url, item.page_id);
      if (!urlValidation.valid) {
        throw new Error(`Invalid URL: ${urlValidation.error}`);
      }
      item.url = sanitizeUrl(item.url);
    }

    const query = `
      INSERT INTO menu_items (
        domain_id, parent_id, label, url, page_id,
        position, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const values = [
      item.domain_id,
      item.parent_id || null,
      sanitizedLabel,
      item.url || null,
      item.page_id || null,
      item.position || 0,
      item.is_active !== false
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      if (error.message.includes('Maximum menu depth')) {
        throw new Error('Cannot create menu item: maximum depth of 3 levels exceeded');
      }
      if (error.message.includes('Circular reference')) {
        throw new Error('Cannot create menu item: circular reference detected');
      }
      throw new Error(`Failed to create menu item: ${error.message}`);
    }
  }

  /**
   * Update an existing menu item with validation
   * @param id - Menu item ID
   * @param updates - Updates to apply
   * @returns Promise<MenuItem>
   */
  async updateMenuItem(id: number, updates: Partial<MenuItem>): Promise<MenuItem> {
    // Build dynamic update query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.label !== undefined) {
      const sanitizedLabel = sanitizeMenuLabel(updates.label);
      if (!sanitizedLabel) {
        throw new Error('Invalid menu label');
      }
      setClauses.push(`label = $${paramCount++}`);
      values.push(sanitizedLabel);
    }

    if (updates.url !== undefined) {
      const urlValidation = validateMenuItemUrl(updates.url, updates.page_id);
      if (!urlValidation.valid) {
        throw new Error(`Invalid URL: ${urlValidation.error}`);
      }
      const sanitizedUrl = updates.url ? sanitizeUrl(updates.url) : null;
      setClauses.push(`url = $${paramCount++}`);
      values.push(sanitizedUrl);
    }

    if (updates.page_id !== undefined) {
      setClauses.push(`page_id = $${paramCount++}`);
      values.push(updates.page_id);
    }

    if (updates.parent_id !== undefined) {
      setClauses.push(`parent_id = $${paramCount++}`);
      values.push(updates.parent_id);
    }

    if (updates.position !== undefined) {
      setClauses.push(`position = $${paramCount++}`);
      values.push(updates.position);
    }

    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${paramCount++}`);
      values.push(updates.is_active);
    }

    if (setClauses.length === 0) {
      throw new Error('No valid updates provided');
    }

    // Add ID as final parameter
    values.push(id);

    const query = `
      UPDATE menu_items
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, values);
      if (result.rows.length === 0) {
        throw new Error('Menu item not found');
      }
      return result.rows[0];
    } catch (error) {
      if (error.message.includes('Maximum menu depth')) {
        throw new Error('Cannot update menu item: maximum depth of 3 levels exceeded');
      }
      if (error.message.includes('Circular reference')) {
        throw new Error('Cannot update menu item: would create circular reference');
      }
      throw new Error(`Failed to update menu item: ${error.message}`);
    }
  }

  /**
   * Delete a menu item and all its descendants
   * @param id - Menu item ID
   * @returns Promise<boolean>
   */
  async deleteMenuItem(id: number): Promise<boolean> {
    const query = `
      DELETE FROM menu_items
      WHERE id = $1
      RETURNING id;
    `;

    try {
      const result = await this.pool.query(query, [id]);
      return result.rows.length > 0;
    } catch (error) {
      throw new Error(`Failed to delete menu item: ${error.message}`);
    }
  }

  /**
   * Reorder menu items within the same parent
   * @param domainId - Domain ID
   * @param parentId - Parent ID (null for root items)
   * @param itemIds - Ordered array of item IDs
   * @returns Promise<boolean>
   */
  async reorderMenuItems(
    domainId: number,
    parentId: number | null,
    itemIds: number[]
  ): Promise<boolean> {
    const query = `
      SELECT reorder_menu_items($1, $2, $3);
    `;

    try {
      await this.pool.query(query, [domainId, parentId, itemIds]);
      return true;
    } catch (error) {
      throw new Error(`Failed to reorder menu items: ${error.message}`);
    }
  }

  /**
   * Batch create menu items (for import/bulk operations)
   * @param items - Array of menu items
   * @returns Promise<MenuItem[]>
   */
  async batchCreateMenuItems(items: MenuItem[]): Promise<MenuItem[]> {
    if (!items || items.length === 0) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const createdItems: MenuItem[] = [];
      for (const item of items) {
        const created = await this.createMenuItem(item);
        createdItems.push(created);
      }

      await client.query('COMMIT');
      return createdItems;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Batch create failed: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Move a menu item to a new parent/position
   * @param id - Menu item ID
   * @param newParentId - New parent ID (null for root)
   * @param newPosition - New position
   * @returns Promise<MenuItem>
   */
  async moveMenuItem(
    id: number,
    newParentId: number | null,
    newPosition: number
  ): Promise<MenuItem> {
    const query = `
      UPDATE menu_items
      SET parent_id = $2, position = $3
      WHERE id = $1
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, [id, newParentId, newPosition]);
      if (result.rows.length === 0) {
        throw new Error('Menu item not found');
      }
      return result.rows[0];
    } catch (error) {
      if (error.message.includes('Maximum menu depth')) {
        throw new Error('Cannot move menu item: would exceed maximum depth');
      }
      if (error.message.includes('Circular reference')) {
        throw new Error('Cannot move menu item: would create circular reference');
      }
      throw new Error(`Failed to move menu item: ${error.message}`);
    }
  }

  /**
   * Get menu items by page ID (to update when page changes)
   * @param pageId - Page ID
   * @returns Promise<MenuItem[]>
   */
  async getMenuItemsByPageId(pageId: number): Promise<MenuItem[]> {
    const query = `
      SELECT * FROM menu_items
      WHERE page_id = $1
      ORDER BY domain_id, position;
    `;

    try {
      const result = await this.pool.query(query, [pageId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch menu items by page: ${error.message}`);
    }
  }

  /**
   * Check if a menu item has children
   * @param id - Menu item ID
   * @returns Promise<boolean>
   */
  async hasChildren(id: number): Promise<boolean> {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM menu_items
        WHERE parent_id = $1
        LIMIT 1
      ) as has_children;
    `;

    try {
      const result = await this.pool.query(query, [id]);
      return result.rows[0]?.has_children || false;
    } catch (error) {
      throw new Error(`Failed to check for children: ${error.message}`);
    }
  }

  /**
   * Duplicate menu structure to another domain
   * @param sourceDomainId - Source domain ID
   * @param targetDomainId - Target domain ID
   * @returns Promise<number> - Number of items copied
   */
  async duplicateMenuStructure(
    sourceDomainId: number,
    targetDomainId: number
  ): Promise<number> {
    const query = `
      WITH RECURSIVE source_tree AS (
        SELECT * FROM menu_items
        WHERE domain_id = $1
      ),
      inserted AS (
        INSERT INTO menu_items (
          domain_id, parent_id, label, url, page_id,
          position, is_active
        )
        SELECT
          $2, parent_id, label, url, null, -- Clear page_id as pages are domain-specific
          position, is_active
        FROM source_tree
        RETURNING *
      )
      SELECT COUNT(*) as count FROM inserted;
    `;

    try {
      const result = await this.pool.query(query, [sourceDomainId, targetDomainId]);
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      throw new Error(`Failed to duplicate menu structure: ${error.message}`);
    }
  }
}

export default MenuQueries;