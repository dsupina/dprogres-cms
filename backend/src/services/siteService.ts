import { pool } from '../utils/database';
import { clearSiteCache, clearSiteCacheEntry } from '../middleware/siteResolver';

export interface Site {
  id: number;
  domain_id: number;
  name: string;
  base_path: string;
  title?: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  settings: any;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSiteDto {
  domain_id: number;
  name: string;
  base_path?: string;
  title?: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
  settings?: any;
}

export interface UpdateSiteDto {
  name?: string;
  base_path?: string;
  title?: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
  settings?: any;
}

class SiteService {
  /**
   * Get all sites, optionally filtered by domain
   */
  async getAllSites(domainId?: number): Promise<Site[]> {
    let query = `
      SELECT s.*, d.hostname as domain_hostname
      FROM sites s
      JOIN domains d ON s.domain_id = d.id
    `;
    const params: any[] = [];

    if (domainId) {
      query += ' WHERE s.domain_id = $1';
      params.push(domainId);
    }

    query += ' ORDER BY d.hostname, s.base_path';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single site by ID
   */
  async getSiteById(id: number): Promise<Site | null> {
    const result = await pool.query(
      `SELECT s.*, d.hostname as domain_hostname
       FROM sites s
       JOIN domains d ON s.domain_id = d.id
       WHERE s.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get sites for a specific domain
   */
  async getSitesByDomain(domainId: number): Promise<Site[]> {
    const result = await pool.query(
      `SELECT * FROM sites
       WHERE domain_id = $1
       ORDER BY base_path`,
      [domainId]
    );

    return result.rows;
  }

  /**
   * Create a new site
   */
  async createSite(data: CreateSiteDto): Promise<Site> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate domain exists
      const domainCheck = await client.query(
        'SELECT id, hostname FROM domains WHERE id = $1',
        [data.domain_id]
      );

      if (domainCheck.rows.length === 0) {
        throw new Error('Domain not found');
      }

      const hostname = domainCheck.rows[0].hostname;

      // If setting as default, unset other defaults for this domain
      if (data.is_default) {
        await client.query(
          'UPDATE sites SET is_default = false WHERE domain_id = $1',
          [data.domain_id]
        );
      }

      // Check if this is the first site for the domain
      const siteCount = await client.query(
        'SELECT COUNT(*) as count FROM sites WHERE domain_id = $1',
        [data.domain_id]
      );

      const isFirstSite = parseInt(siteCount.rows[0].count) === 0;

      // Insert the new site
      const result = await client.query(
        `INSERT INTO sites (
          domain_id, name, base_path, title, description,
          is_default, is_active, settings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          data.domain_id,
          data.name,
          data.base_path || '/',
          data.title || data.name,
          data.description || '',
          data.is_default || isFirstSite, // Make first site default
          data.is_active !== false,
          data.settings || {}
        ]
      );

      await client.query('COMMIT');

      // Clear site cache for this hostname
      clearSiteCacheEntry(hostname, data.base_path || '/');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing site
   */
  async updateSite(id: number, data: UpdateSiteDto): Promise<Site | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current site data with domain info
      const currentSite = await client.query(
        `SELECT s.*, d.hostname
         FROM sites s
         JOIN domains d ON s.domain_id = d.id
         WHERE s.id = $1`,
        [id]
      );

      if (currentSite.rows.length === 0) {
        return null;
      }

      const site = currentSite.rows[0];

      // If setting as default, unset other defaults for this domain
      if (data.is_default === true && !site.is_default) {
        await client.query(
          'UPDATE sites SET is_default = false WHERE domain_id = $1 AND id != $2',
          [site.domain_id, id]
        );
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let valueIndex = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${valueIndex++}`);
        values.push(data.name);
      }
      if (data.base_path !== undefined) {
        updates.push(`base_path = $${valueIndex++}`);
        values.push(data.base_path);
      }
      if (data.title !== undefined) {
        updates.push(`title = $${valueIndex++}`);
        values.push(data.title);
      }
      if (data.description !== undefined) {
        updates.push(`description = $${valueIndex++}`);
        values.push(data.description);
      }
      if (data.is_default !== undefined) {
        updates.push(`is_default = $${valueIndex++}`);
        values.push(data.is_default);
      }
      if (data.is_active !== undefined) {
        updates.push(`is_active = $${valueIndex++}`);
        values.push(data.is_active);
      }
      if (data.settings !== undefined) {
        updates.push(`settings = $${valueIndex++}`);
        values.push(data.settings);
      }

      if (updates.length === 0) {
        return site; // No updates to make
      }

      updates.push('updated_at = NOW()');
      values.push(id);

      const result = await client.query(
        `UPDATE sites SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`,
        values
      );

      await client.query('COMMIT');

      // Clear cache for old and new base paths
      clearSiteCacheEntry(site.hostname, site.base_path);
      if (data.base_path && data.base_path !== site.base_path) {
        clearSiteCacheEntry(site.hostname, data.base_path);
      }

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a site
   */
  async deleteSite(id: number): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get site info for cache clearing
      const siteInfo = await client.query(
        `SELECT s.base_path, d.hostname
         FROM sites s
         JOIN domains d ON s.domain_id = d.id
         WHERE s.id = $1`,
        [id]
      );

      if (siteInfo.rows.length === 0) {
        return false;
      }

      // Check if this is the last site for the domain
      const siteCount = await client.query(
        `SELECT COUNT(*) as count
         FROM sites s
         WHERE s.domain_id = (SELECT domain_id FROM sites WHERE id = $1)`,
        [id]
      );

      if (parseInt(siteCount.rows[0].count) === 1) {
        throw new Error('Cannot delete the last site for a domain');
      }

      // Delete the site (cascade will handle related content)
      const result = await client.query(
        'DELETE FROM sites WHERE id = $1 RETURNING id',
        [id]
      );

      await client.query('COMMIT');

      // Clear cache
      clearSiteCacheEntry(
        siteInfo.rows[0].hostname,
        siteInfo.rows[0].base_path
      );

      return result.rows.length > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the default site for a domain
   */
  async getDefaultSiteForDomain(domainId: number): Promise<Site | null> {
    const result = await pool.query(
      `SELECT * FROM sites
       WHERE domain_id = $1 AND is_default = true AND is_active = true
       LIMIT 1`,
      [domainId]
    );

    return result.rows[0] || null;
  }

  /**
   * Resolve site by hostname and path
   */
  async resolveSiteByHostAndPath(
    hostname: string,
    path: string
  ): Promise<Site | null> {
    // Extract base path from the full path
    const pathSegments = path.split('/').filter(Boolean);
    const basePath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';

    const result = await pool.query(
      `SELECT s.*
       FROM sites s
       JOIN domains d ON s.domain_id = d.id
       WHERE d.hostname = $1 AND s.base_path = $2 AND s.is_active = true
       LIMIT 1`,
      [hostname.toLowerCase(), basePath]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // If no specific base path match, try root path
    if (basePath !== '/') {
      const rootResult = await pool.query(
        `SELECT s.*
         FROM sites s
         JOIN domains d ON s.domain_id = d.id
         WHERE d.hostname = $1 AND s.base_path = '/' AND s.is_active = true
         LIMIT 1`,
        [hostname.toLowerCase()]
      );

      if (rootResult.rows.length > 0) {
        return rootResult.rows[0];
      }
    }

    // Fall back to default site for domain
    const defaultResult = await pool.query(
      `SELECT s.*
       FROM sites s
       JOIN domains d ON s.domain_id = d.id
       WHERE d.hostname = $1 AND s.is_default = true AND s.is_active = true
       LIMIT 1`,
      [hostname.toLowerCase()]
    );

    return defaultResult.rows[0] || null;
  }
}

export const siteService = new SiteService();