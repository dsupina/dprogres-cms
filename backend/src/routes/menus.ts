/**
 * Menu management API routes with comprehensive security measures
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import MenuQueries from '../db/menuQueries';
import { authenticate, requireRole } from '../middleware/auth';
import { csrfProtect } from '../middleware/csrf';
import { menuRateLimiter } from '../middleware/rateLimit';
import { sanitizeMenuItems, containsXSS } from '../utils/sanitizer';
import { validateMenuItemUrl } from '../utils/urlValidator';

const router = Router();

// Extended request with user info
interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}

// Middleware stack for menu operations
const menuMiddleware = [
  authenticate,
  requireRole(['admin', 'editor']),
  csrfProtect,
  menuRateLimiter
];

/**
 * Initialize menu routes
 * @param pool - Database connection pool
 * @returns Express router
 */
export const createMenuRouter = (pool: Pool): Router => {
  const menuQueries = new MenuQueries(pool);

  /**
   * GET /api/menus/:domainId/tree
   * Get complete menu tree for a domain
   * Public endpoint - no auth required for reading
   */
  router.get('/menus/:domainId/tree', async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.domainId);

      if (isNaN(domainId) || domainId < 1) {
        return res.status(400).json({ error: 'Invalid domain ID' });
      }

      const menuTree = await menuQueries.getMenuTree(domainId);

      // Set cache headers for public endpoint
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      res.json({
        success: true,
        data: menuTree
      });
    } catch (error) {
      console.error('Error fetching menu tree:', error);
      res.status(500).json({ error: 'Failed to fetch menu tree' });
    }
  });

  /**
   * GET /api/menus/:id
   * Get single menu item details
   */
  router.get('/menus/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid menu item ID' });
      }

      const menuItem = await menuQueries.getMenuItem(id);

      if (!menuItem) {
        return res.status(404).json({ error: 'Menu item not found' });
      }

      res.json({
        success: true,
        data: menuItem
      });
    } catch (error) {
      console.error('Error fetching menu item:', error);
      res.status(500).json({ error: 'Failed to fetch menu item' });
    }
  });

  /**
   * POST /api/menus
   * Create new menu item
   * Requires admin/editor role and CSRF token
   */
  router.post('/menus', menuMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { domain_id, parent_id, label, url, page_id, position, is_active } = req.body;

      // Validate required fields
      if (!domain_id || !label) {
        return res.status(400).json({ error: 'Domain ID and label are required' });
      }

      // Check for XSS attempts
      if (containsXSS(label)) {
        return res.status(400).json({ error: 'Invalid characters in menu label' });
      }

      // Validate URL if provided
      if (url) {
        const urlValidation = validateMenuItemUrl(url, page_id);
        if (!urlValidation.valid) {
          return res.status(400).json({ error: urlValidation.error });
        }
      }

      // Validate that only URL or page_id is set, not both
      if (url && page_id) {
        return res.status(400).json({ error: 'Menu item cannot have both URL and page reference' });
      }

      const menuItem = await menuQueries.createMenuItem({
        domain_id: parseInt(domain_id),
        parent_id: parent_id ? parseInt(parent_id) : null,
        label,
        url: url || null,
        page_id: page_id ? parseInt(page_id) : null,
        position: position ? parseInt(position) : 0,
        is_active: is_active !== false
      });

      res.status(201).json({
        success: true,
        data: menuItem
      });
    } catch (error) {
      console.error('Error creating menu item:', error);

      // Handle specific errors
      if (error.message.includes('maximum depth')) {
        return res.status(400).json({ error: 'Maximum menu depth of 3 levels exceeded' });
      }
      if (error.message.includes('Circular reference')) {
        return res.status(400).json({ error: 'Operation would create circular reference' });
      }

      res.status(500).json({ error: 'Failed to create menu item' });
    }
  });

  /**
   * PUT /api/menus/:id
   * Update menu item
   * Requires admin/editor role and CSRF token
   */
  router.put('/menus/:id', menuMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid menu item ID' });
      }

      const updates = req.body;

      // Check for XSS in label if updating
      if (updates.label && containsXSS(updates.label)) {
        return res.status(400).json({ error: 'Invalid characters in menu label' });
      }

      // Validate URL if updating
      if (updates.url !== undefined) {
        const urlValidation = validateMenuItemUrl(updates.url, updates.page_id);
        if (!urlValidation.valid) {
          return res.status(400).json({ error: urlValidation.error });
        }
      }

      const menuItem = await menuQueries.updateMenuItem(id, updates);

      res.json({
        success: true,
        data: menuItem
      });
    } catch (error) {
      console.error('Error updating menu item:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      if (error.message.includes('maximum depth')) {
        return res.status(400).json({ error: 'Maximum menu depth of 3 levels exceeded' });
      }
      if (error.message.includes('Circular reference')) {
        return res.status(400).json({ error: 'Operation would create circular reference' });
      }

      res.status(500).json({ error: 'Failed to update menu item' });
    }
  });

  /**
   * DELETE /api/menus/:id
   * Delete menu item and its descendants
   * Requires admin role and CSRF token
   */
  router.delete('/menus/:id',
    authenticate,
    requireRole(['admin']),
    csrfProtect,
    menuRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id) || id < 1) {
          return res.status(400).json({ error: 'Invalid menu item ID' });
        }

        // Check if item has children and warn
        const hasChildren = await menuQueries.hasChildren(id);
        if (hasChildren && !req.query.confirm) {
          return res.status(400).json({
            error: 'Menu item has children',
            message: 'This menu item has child items that will also be deleted. Add ?confirm=true to proceed.',
            hasChildren: true
          });
        }

        const deleted = await menuQueries.deleteMenuItem(id);

        if (!deleted) {
          return res.status(404).json({ error: 'Menu item not found' });
        }

        res.json({
          success: true,
          message: 'Menu item deleted successfully'
        });
      } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ error: 'Failed to delete menu item' });
      }
    }
  );

  /**
   * POST /api/menus/:domainId/reorder
   * Reorder menu items within same parent
   * Requires admin/editor role and CSRF token
   */
  router.post('/menus/:domainId/reorder', menuMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const domainId = parseInt(req.params.domainId);
      const { parent_id, item_ids } = req.body;

      if (isNaN(domainId) || domainId < 1) {
        return res.status(400).json({ error: 'Invalid domain ID' });
      }

      if (!Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: 'Item IDs array is required' });
      }

      // Validate all item IDs are numbers
      const validIds = item_ids.every(id => !isNaN(parseInt(id)));
      if (!validIds) {
        return res.status(400).json({ error: 'Invalid item IDs' });
      }

      await menuQueries.reorderMenuItems(
        domainId,
        parent_id ? parseInt(parent_id) : null,
        item_ids.map(id => parseInt(id))
      );

      res.json({
        success: true,
        message: 'Menu items reordered successfully'
      });
    } catch (error) {
      console.error('Error reordering menu items:', error);
      res.status(500).json({ error: 'Failed to reorder menu items' });
    }
  });

  /**
   * POST /api/menus/:domainId/batch
   * Batch create menu items
   * Requires admin role and CSRF token
   */
  router.post('/menus/:domainId/batch',
    authenticate,
    requireRole(['admin']),
    csrfProtect,
    menuRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const domainId = parseInt(req.params.domainId);
        const { items } = req.body;

        if (isNaN(domainId) || domainId < 1) {
          return res.status(400).json({ error: 'Invalid domain ID' });
        }

        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'Items array is required' });
        }

        // Limit batch size
        if (items.length > 50) {
          return res.status(400).json({ error: 'Batch size cannot exceed 50 items' });
        }

        // Sanitize all items
        const sanitizedItems = sanitizeMenuItems(items);

        // Add domain_id to all items
        const itemsWithDomain = sanitizedItems.map(item => ({
          ...item,
          domain_id: domainId
        }));

        const createdItems = await menuQueries.batchCreateMenuItems(itemsWithDomain);

        res.status(201).json({
          success: true,
          data: createdItems,
          count: createdItems.length
        });
      } catch (error) {
        console.error('Error batch creating menu items:', error);
        res.status(500).json({ error: 'Failed to batch create menu items' });
      }
    }
  );

  /**
   * POST /api/menus/:id/move
   * Move menu item to new parent/position
   * Requires admin/editor role and CSRF token
   */
  router.post('/menus/:id/move', menuMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { parent_id, position } = req.body;

      if (isNaN(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid menu item ID' });
      }

      if (position === undefined || isNaN(parseInt(position))) {
        return res.status(400).json({ error: 'Position is required' });
      }

      const movedItem = await menuQueries.moveMenuItem(
        id,
        parent_id ? parseInt(parent_id) : null,
        parseInt(position)
      );

      res.json({
        success: true,
        data: movedItem
      });
    } catch (error) {
      console.error('Error moving menu item:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      if (error.message.includes('maximum depth')) {
        return res.status(400).json({ error: 'Move would exceed maximum menu depth' });
      }
      if (error.message.includes('Circular reference')) {
        return res.status(400).json({ error: 'Move would create circular reference' });
      }

      res.status(500).json({ error: 'Failed to move menu item' });
    }
  });

  /**
   * POST /api/menus/:sourceDomainId/duplicate/:targetDomainId
   * Duplicate menu structure to another domain
   * Requires admin role and CSRF token
   */
  router.post('/menus/:sourceDomainId/duplicate/:targetDomainId',
    authenticate,
    requireRole(['admin']),
    csrfProtect,
    async (req: AuthRequest, res: Response) => {
      try {
        const sourceDomainId = parseInt(req.params.sourceDomainId);
        const targetDomainId = parseInt(req.params.targetDomainId);

        if (isNaN(sourceDomainId) || sourceDomainId < 1 ||
            isNaN(targetDomainId) || targetDomainId < 1) {
          return res.status(400).json({ error: 'Invalid domain IDs' });
        }

        if (sourceDomainId === targetDomainId) {
          return res.status(400).json({ error: 'Source and target domains must be different' });
        }

        const count = await menuQueries.duplicateMenuStructure(sourceDomainId, targetDomainId);

        res.json({
          success: true,
          message: `Duplicated ${count} menu items`,
          count
        });
      } catch (error) {
        console.error('Error duplicating menu structure:', error);
        res.status(500).json({ error: 'Failed to duplicate menu structure' });
      }
    }
  );

  return router;
};

export default createMenuRouter;