import { pool } from '../utils/database';
import crypto from 'crypto';

// LRU Cache implementation for domain lookups
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    if (value === undefined) return undefined;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Domain cache instance
const domainCache = new LRUCache<string, any>(100);

export interface Domain {
  id: number;
  hostname: string;
  ip_address?: string;
  is_active: boolean;
  is_default: boolean;
  verification_token?: string;
  verified_at?: Date;
  settings?: any;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDomainDto {
  hostname: string;
  ip_address?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface UpdateDomainDto {
  hostname?: string;
  ip_address?: string;
  is_active?: boolean;
  is_default?: boolean;
  settings?: any;
}

export class DomainService {
  /**
   * Get all domains
   */
  static async getAllDomains(): Promise<Domain[]> {
    const result = await pool.query(
      'SELECT * FROM domains ORDER BY hostname',
      []
    );
    return result.rows;
  }

  /**
   * Get domain by ID
   */
  static async getDomainById(id: number): Promise<Domain | null> {
    const result = await pool.query(
      'SELECT * FROM domains WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get domain by hostname with caching
   */
  static async getDomainByHostname(hostname: string): Promise<Domain | null> {
    // Check cache first
    const cached = domainCache.get(hostname);
    if (cached) {
      return cached;
    }

    // Query database
    const result = await pool.query(
      'SELECT * FROM domains WHERE hostname = $1 AND is_active = true',
      [hostname]
    );

    const domain = result.rows[0] || null;

    // Cache the result
    if (domain) {
      domainCache.set(hostname, domain);
    }

    return domain;
  }

  /**
   * Get default domain
   */
  static async getDefaultDomain(): Promise<Domain | null> {
    const cached = domainCache.get('__default__');
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      'SELECT * FROM domains WHERE is_default = true AND is_active = true LIMIT 1',
      []
    );

    const domain = result.rows[0] || null;

    if (domain) {
      domainCache.set('__default__', domain);
    }

    return domain;
  }

  /**
   * Create a new domain
   */
  static async createDomain(data: CreateDomainDto): Promise<Domain> {
    const { hostname, ip_address, is_active = true, is_default = false } = data;

    // Generate verification token
    const verification_token = crypto.randomBytes(32).toString('hex');

    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE domains SET is_default = false WHERE is_default = true',
        []
      );
    }

    const result = await pool.query(
      `INSERT INTO domains (hostname, ip_address, is_active, is_default, verification_token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [hostname, ip_address, is_active, is_default, verification_token]
    );

    // Clear cache when domains change
    domainCache.clear();

    return result.rows[0];
  }

  /**
   * Update a domain
   */
  static async updateDomain(id: number, data: UpdateDomainDto): Promise<Domain | null> {
    const fields: string[] = [];
    const values: any[] = [];
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
      // If setting as default, unset other defaults
      if (data.is_default) {
        await pool.query(
          'UPDATE domains SET is_default = false WHERE is_default = true',
          []
        );
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

    const result = await pool.query(
      `UPDATE domains
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    // Clear cache when domains change
    domainCache.clear();

    return result.rows[0] || null;
  }

  /**
   * Delete a domain
   */
  static async deleteDomain(id: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM domains WHERE id = $1',
      [id]
    );

    // Clear cache when domains change
    domainCache.clear();

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Verify domain ownership
   */
  static async verifyDomain(id: number, token: string): Promise<boolean> {
    const domain = await this.getDomainById(id);
    if (!domain || domain.verification_token !== token) {
      return false;
    }

    const result = await pool.query(
      `UPDATE domains
       SET verified_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    // Clear cache after verification
    domainCache.clear();

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Generate DNS TXT record for verification
   */
  static generateVerificationTxtRecord(domain: Domain): string {
    return `cms-verification=${domain.verification_token}`;
  }

  /**
   * Clear the domain cache
   */
  static clearCache(): void {
    domainCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; maxSize: number } {
    return {
      size: domainCache.size(),
      maxSize: 100
    };
  }
}