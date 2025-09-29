"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.siteService = void 0;
const database_1 = require("../utils/database");
const siteResolver_1 = require("../middleware/siteResolver");
class SiteService {
    async getAllSites(domainId) {
        let query = `
      SELECT s.*, d.hostname as domain_hostname
      FROM sites s
      JOIN domains d ON s.domain_id = d.id
    `;
        const params = [];
        if (domainId) {
            query += ' WHERE s.domain_id = $1';
            params.push(domainId);
        }
        query += ' ORDER BY d.hostname, s.base_path';
        const result = await database_1.pool.query(query, params);
        return result.rows;
    }
    async getSiteById(id) {
        const result = await database_1.pool.query(`SELECT s.*, d.hostname as domain_hostname
       FROM sites s
       JOIN domains d ON s.domain_id = d.id
       WHERE s.id = $1`, [id]);
        return result.rows[0] || null;
    }
    async getSitesByDomain(domainId) {
        const result = await database_1.pool.query(`SELECT * FROM sites
       WHERE domain_id = $1
       ORDER BY base_path`, [domainId]);
        return result.rows;
    }
    async createSite(data) {
        const client = await database_1.pool.connect();
        try {
            await client.query('BEGIN');
            const domainCheck = await client.query('SELECT id, hostname FROM domains WHERE id = $1', [data.domain_id]);
            if (domainCheck.rows.length === 0) {
                throw new Error('Domain not found');
            }
            const hostname = domainCheck.rows[0].hostname;
            if (data.is_default) {
                await client.query('UPDATE sites SET is_default = false WHERE domain_id = $1', [data.domain_id]);
            }
            const siteCount = await client.query('SELECT COUNT(*) as count FROM sites WHERE domain_id = $1', [data.domain_id]);
            const isFirstSite = parseInt(siteCount.rows[0].count) === 0;
            const result = await client.query(`INSERT INTO sites (
          domain_id, name, base_path, title, description,
          is_default, is_active, settings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`, [
                data.domain_id,
                data.name,
                data.base_path || '/',
                data.title || data.name,
                data.description || '',
                data.is_default || isFirstSite,
                data.is_active !== false,
                data.settings || {}
            ]);
            await client.query('COMMIT');
            (0, siteResolver_1.clearSiteCacheEntry)(hostname, data.base_path || '/');
            return result.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async updateSite(id, data) {
        const client = await database_1.pool.connect();
        try {
            await client.query('BEGIN');
            const currentSite = await client.query(`SELECT s.*, d.hostname
         FROM sites s
         JOIN domains d ON s.domain_id = d.id
         WHERE s.id = $1`, [id]);
            if (currentSite.rows.length === 0) {
                return null;
            }
            const site = currentSite.rows[0];
            if (data.is_default === true && !site.is_default) {
                await client.query('UPDATE sites SET is_default = false WHERE domain_id = $1 AND id != $2', [site.domain_id, id]);
            }
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
                return site;
            }
            updates.push('updated_at = NOW()');
            values.push(id);
            const result = await client.query(`UPDATE sites SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`, values);
            await client.query('COMMIT');
            (0, siteResolver_1.clearSiteCacheEntry)(site.hostname, site.base_path);
            if (data.base_path && data.base_path !== site.base_path) {
                (0, siteResolver_1.clearSiteCacheEntry)(site.hostname, data.base_path);
            }
            return result.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async deleteSite(id) {
        const client = await database_1.pool.connect();
        try {
            await client.query('BEGIN');
            const siteInfo = await client.query(`SELECT s.base_path, d.hostname
         FROM sites s
         JOIN domains d ON s.domain_id = d.id
         WHERE s.id = $1`, [id]);
            if (siteInfo.rows.length === 0) {
                return false;
            }
            const siteCount = await client.query(`SELECT COUNT(*) as count
         FROM sites s
         WHERE s.domain_id = (SELECT domain_id FROM sites WHERE id = $1)`, [id]);
            if (parseInt(siteCount.rows[0].count) === 1) {
                throw new Error('Cannot delete the last site for a domain');
            }
            const result = await client.query('DELETE FROM sites WHERE id = $1 RETURNING id', [id]);
            await client.query('COMMIT');
            (0, siteResolver_1.clearSiteCacheEntry)(siteInfo.rows[0].hostname, siteInfo.rows[0].base_path);
            return result.rows.length > 0;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getDefaultSiteForDomain(domainId) {
        const result = await database_1.pool.query(`SELECT * FROM sites
       WHERE domain_id = $1 AND is_default = true AND is_active = true
       LIMIT 1`, [domainId]);
        return result.rows[0] || null;
    }
    async resolveSiteByHostAndPath(hostname, path) {
        const pathSegments = path.split('/').filter(Boolean);
        const basePath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';
        const result = await database_1.pool.query(`SELECT s.*
       FROM sites s
       JOIN domains d ON s.domain_id = d.id
       WHERE d.hostname = $1 AND s.base_path = $2 AND s.is_active = true
       LIMIT 1`, [hostname.toLowerCase(), basePath]);
        if (result.rows.length > 0) {
            return result.rows[0];
        }
        if (basePath !== '/') {
            const rootResult = await database_1.pool.query(`SELECT s.*
         FROM sites s
         JOIN domains d ON s.domain_id = d.id
         WHERE d.hostname = $1 AND s.base_path = '/' AND s.is_active = true
         LIMIT 1`, [hostname.toLowerCase()]);
            if (rootResult.rows.length > 0) {
                return rootResult.rows[0];
            }
        }
        const defaultResult = await database_1.pool.query(`SELECT s.*
       FROM sites s
       JOIN domains d ON s.domain_id = d.id
       WHERE d.hostname = $1 AND s.is_default = true AND s.is_active = true
       LIMIT 1`, [hostname.toLowerCase()]);
        return defaultResult.rows[0] || null;
    }
}
exports.siteService = new SiteService();
//# sourceMappingURL=siteService.js.map