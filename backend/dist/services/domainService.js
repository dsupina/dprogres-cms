"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainService = exports.domainCache = void 0;
const database_1 = require("../utils/database");
const crypto_1 = __importDefault(require("crypto"));
class LRUCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    get(key) {
        if (!this.cache.has(key))
            return undefined;
        const value = this.cache.get(key);
        if (value === undefined)
            return undefined;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
}
exports.domainCache = new LRUCache(100);
class DomainService {
    static async getAllDomains() {
        const result = await database_1.pool.query('SELECT * FROM domains ORDER BY hostname', []);
        return result.rows;
    }
    static async getDomainById(id) {
        const result = await database_1.pool.query('SELECT * FROM domains WHERE id = $1', [id]);
        return result.rows[0] || null;
    }
    static async getDomainByHostname(hostname) {
        const cached = exports.domainCache.get(hostname);
        if (cached) {
            return cached;
        }
        const result = await database_1.pool.query('SELECT * FROM domains WHERE hostname = $1 AND is_active = true', [hostname]);
        const domain = result.rows[0] || null;
        if (domain) {
            exports.domainCache.set(hostname, domain);
        }
        return domain;
    }
    static async getDefaultDomain() {
        const cached = exports.domainCache.get('__default__');
        if (cached) {
            return cached;
        }
        const result = await database_1.pool.query('SELECT * FROM domains WHERE is_default = true AND is_active = true LIMIT 1', []);
        const domain = result.rows[0] || null;
        if (domain) {
            exports.domainCache.set('__default__', domain);
        }
        return domain;
    }
    static async createDomain(data) {
        const { hostname, ip_address, is_active = true, is_default = false } = data;
        const verification_token = crypto_1.default.randomBytes(32).toString('hex');
        if (is_default) {
            await database_1.pool.query('UPDATE domains SET is_default = false WHERE is_default = true', []);
        }
        const result = await database_1.pool.query(`INSERT INTO domains (hostname, ip_address, is_active, is_default, verification_token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [hostname, ip_address, is_active, is_default, verification_token]);
        exports.domainCache.clear();
        return result.rows[0];
    }
    static async updateDomain(id, data) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        if (data.hostname !== undefined) {
            fields.push(`hostname = $${paramCount}`);
            values.push(data.hostname);
            paramCount++;
        }
        if (data.ip_address !== undefined) {
            fields.push(`ip_address = $${paramCount}`);
            values.push(data.ip_address);
            paramCount++;
        }
        if (data.is_active !== undefined) {
            fields.push(`is_active = $${paramCount}`);
            values.push(data.is_active);
            paramCount++;
        }
        if (data.is_default !== undefined) {
            if (data.is_default) {
                await database_1.pool.query('UPDATE domains SET is_default = false WHERE is_default = true', []);
            }
            fields.push(`is_default = $${paramCount}`);
            values.push(data.is_default);
            paramCount++;
        }
        if (data.settings !== undefined) {
            fields.push(`settings = $${paramCount}`);
            values.push(JSON.stringify(data.settings));
            paramCount++;
        }
        if (fields.length === 0) {
            return await this.getDomainById(id);
        }
        values.push(id);
        const result = await database_1.pool.query(`UPDATE domains
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`, values);
        exports.domainCache.clear();
        return result.rows[0] || null;
    }
    static async deleteDomain(id) {
        const result = await database_1.pool.query('DELETE FROM domains WHERE id = $1', [id]);
        exports.domainCache.clear();
        return (result.rowCount ?? 0) > 0;
    }
    static async verifyDomain(id, token) {
        const domain = await this.getDomainById(id);
        if (!domain || domain.verification_token !== token) {
            return false;
        }
        const result = await database_1.pool.query(`UPDATE domains
       SET verified_at = CURRENT_TIMESTAMP
       WHERE id = $1`, [id]);
        exports.domainCache.clear();
        return (result.rowCount ?? 0) > 0;
    }
    static generateVerificationTxtRecord(domain) {
        return `cms-verification=${domain.verification_token}`;
    }
    static clearCache() {
        exports.domainCache.clear();
    }
    static getCacheStats() {
        return {
            size: exports.domainCache.size(),
            maxSize: 100
        };
    }
}
exports.DomainService = DomainService;
//# sourceMappingURL=domainService.js.map