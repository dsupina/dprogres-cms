import express from 'express';
import { Request, Response } from 'express';
import { query } from '../utils/database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Get site settings (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT key, value FROM site_settings');
    
    const settings: { [key: string]: string } = {};
    result.rows.forEach((row) => {
      settings[row.key] = row.value;
    });

    // Normalize: ensure site_title mirrors site_name if provided
    if (settings['site_name']) {
      settings['site_title'] = settings['site_name'];
    }
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update site settings (admin only)
router.put('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Only admin can update settings
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can update settings' });
    }

    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await query(
        'INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        [key, value]
      );
    }
    // Keep site_title and site_name strictly in sync based on whichever is provided
    const providedName = (settings['site_title'] as string) || (settings['site_name'] as string);
    if (providedName) {
      await query(
        'INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        ['site_name', providedName]
      );
      await query(
        'INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        ['site_title', providedName]
      );
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific setting
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    
    const result = await query('SELECT value FROM site_settings WHERE key = $1', [key]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key, value: result.rows[0].value });
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 