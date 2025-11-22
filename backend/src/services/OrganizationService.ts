import { EventEmitter } from 'events';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types/versioning';
import crypto from 'crypto';

/**
 * Organization entity from database
 */
export interface Organization {
  id: number;
  name: string;
  slug: string;
  owner_id: number;
  plan_tier: 'free' | 'starter' | 'pro' | 'enterprise';
  logo_url?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

/**
 * Organization with member count
 */
export interface OrganizationWithMembers extends Organization {
  member_count: number;
}

/**
 * Organization member entity
 */
export interface OrganizationMember {
  id: number;
  organization_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'editor' | 'publisher' | 'viewer';
  invited_by?: number;
  joined_at: Date;
}

/**
 * Input for creating organization
 */
export interface CreateOrganizationInput {
  name: string;
  ownerId: number;
  logoUrl?: string;
}

/**
 * Input for updating organization
 */
export interface UpdateOrganizationInput {
  name?: string;
  logoUrl?: string;
}

/**
 * OrganizationService
 *
 * Handles organization management including:
 * - Creating organizations with auto-generated slugs
 * - Retrieving organizations with access control
 * - Updating organization details
 * - Soft deleting organizations
 * - Transferring ownership
 * - Listing user's organizations
 * - Validating user access to organizations
 *
 * Ticket: SF-005
 */
export class OrganizationService extends EventEmitter {
  private readonly SLUG_RETRY_ATTEMPTS = 3;

  /**
   * Generate URL-safe slug from organization name
   * Format: name-XXXXXX (6 random chars for uniqueness)
   */
  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const randomSuffix = crypto.randomBytes(3).toString('hex'); // 6 hex chars
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Check if slug is unique
   */
  private async isSlugUnique(slug: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT id FROM organizations WHERE slug = $1 AND deleted_at IS NULL',
      [slug]
    );
    return rows.length === 0;
  }

  /**
   * Generate unique slug with retry logic
   */
  private async generateUniqueSlug(name: string): Promise<ServiceResponse<string>> {
    for (let attempt = 0; attempt < this.SLUG_RETRY_ATTEMPTS; attempt++) {
      const slug = this.generateSlug(name);
      const isUnique = await this.isSlugUnique(slug);

      if (isUnique) {
        return { success: true, data: slug };
      }
    }

    return {
      success: false,
      error: `Failed to generate unique slug after ${this.SLUG_RETRY_ATTEMPTS} attempts`,
    };
  }

  /**
   * Create organization with auto-generated slug
   * Automatically adds owner as member with "owner" role
   */
  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<ServiceResponse<Organization>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { name, ownerId, logoUrl } = input;

      // Validate inputs
      if (!name || name.trim().length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Organization name is required' };
      }

      if (!ownerId) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Owner ID is required' };
      }

      // Verify owner exists
      const { rows: users } = await client.query(
        'SELECT id FROM users WHERE id = $1',
        [ownerId]
      );

      if (users.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Owner user not found' };
      }

      // Generate unique slug
      const slugResult = await this.generateUniqueSlug(name);
      if (!slugResult.success) {
        await client.query('ROLLBACK');
        return { success: false, error: slugResult.error };
      }

      const slug = slugResult.data!;

      // Create organization
      const { rows: [organization] } = await client.query<Organization>(
        `INSERT INTO organizations (name, slug, owner_id, logo_url, plan_tier)
         VALUES ($1, $2, $3, $4, 'free')
         RETURNING *`,
        [name.trim(), slug, ownerId, logoUrl || null]
      );

      // Add owner as member with "owner" role
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [organization.id, ownerId]
      );

      await client.query('COMMIT');

      // Emit event
      this.emit('organization:created', {
        organizationId: organization.id,
        ownerId,
        name: organization.name,
        slug: organization.slug,
        timestamp: new Date(),
      });

      return { success: true, data: organization };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error creating organization:', error);
      return {
        success: false,
        error: error.message || 'Failed to create organization',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get organization by ID with access check
   * Returns organization with member count
   */
  async getOrganization(
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse<OrganizationWithMembers>> {
    try {
      // Validate access
      const accessResult = await this.validateAccess(organizationId, userId);
      if (!accessResult.success) {
        return { success: false, error: accessResult.error };
      }

      // Get organization
      const { rows: orgs } = await pool.query<Organization>(
        `SELECT * FROM organizations
         WHERE id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      if (orgs.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const organization = orgs[0];

      // Get member count (separate query for performance)
      const { rows: [{ count }] } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM organization_members
         WHERE organization_id = $1`,
        [organizationId]
      );

      const orgWithMembers: OrganizationWithMembers = {
        ...organization,
        member_count: parseInt(count, 10),
      };

      return { success: true, data: orgWithMembers };
    } catch (error: any) {
      console.error('Error getting organization:', error);
      return {
        success: false,
        error: 'Failed to retrieve organization',
      };
    }
  }

  /**
   * Update organization details (name, logo)
   * Only owner can update organization
   */
  async updateOrganization(
    organizationId: number,
    updates: UpdateOrganizationInput,
    userId: number
  ): Promise<ServiceResponse<Organization>> {
    try {
      // Verify user is owner
      const { rows: orgs } = await pool.query(
        `SELECT id, owner_id FROM organizations
         WHERE id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      if (orgs.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const organization = orgs[0];

      if (organization.owner_id !== userId) {
        return {
          success: false,
          error: 'Only organization owner can update organization details',
        };
      }

      // Build dynamic update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        if (!updates.name || updates.name.trim().length === 0) {
          return { success: false, error: 'Organization name cannot be empty' };
        }
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updates.name.trim());
      }

      if (updates.logoUrl !== undefined) {
        updateFields.push(`logo_url = $${paramIndex++}`);
        values.push(updates.logoUrl || null);
      }

      if (updateFields.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(organizationId);

      const query = `
        UPDATE organizations
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND deleted_at IS NULL
        RETURNING *
      `;

      const { rows: [updated] } = await pool.query<Organization>(query, values);

      // Emit event
      this.emit('organization:updated', {
        organizationId,
        userId,
        updates,
        timestamp: new Date(),
      });

      return { success: true, data: updated };
    } catch (error: any) {
      console.error('Error updating organization:', error);
      return {
        success: false,
        error: 'Failed to update organization',
      };
    }
  }

  /**
   * Soft delete organization (owner only)
   * Sets deleted_at timestamp, cascades handled by FK constraints
   */
  async deleteOrganization(
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse<void>> {
    try {
      // Verify user is owner
      const { rows: orgs } = await pool.query(
        `SELECT id, owner_id, name FROM organizations
         WHERE id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      if (orgs.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const organization = orgs[0];

      if (organization.owner_id !== userId) {
        return {
          success: false,
          error: 'Only organization owner can delete organization',
        };
      }

      // Soft delete
      await pool.query(
        `UPDATE organizations
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [organizationId]
      );

      // Emit event
      this.emit('organization:deleted', {
        organizationId,
        userId,
        organizationName: organization.name,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error deleting organization:', error);
      return {
        success: false,
        error: 'Failed to delete organization',
      };
    }
  }

  /**
   * Transfer ownership to another member
   * New owner must be an existing member
   */
  async transferOwnership(
    organizationId: number,
    newOwnerId: number,
    currentOwnerId: number
  ): Promise<ServiceResponse<Organization>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Prevent self-transfer (would downgrade owner to admin)
      if (newOwnerId === currentOwnerId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot transfer ownership to yourself',
        };
      }

      // Verify current user is owner
      const { rows: orgs } = await client.query(
        `SELECT id, owner_id FROM organizations
         WHERE id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      if (orgs.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Organization not found' };
      }

      const organization = orgs[0];

      if (organization.owner_id !== currentOwnerId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Only current owner can transfer ownership',
        };
      }

      // Verify new owner is a member
      const { rows: members } = await client.query(
        `SELECT id, role FROM organization_members
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, newOwnerId]
      );

      if (members.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'New owner must be an existing organization member',
        };
      }

      // Update organization owner
      const { rows: [updated] } = await client.query<Organization>(
        `UPDATE organizations
         SET owner_id = $1, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [newOwnerId, organizationId]
      );

      // Update member roles: new owner gets "owner", old owner gets "admin"
      await client.query(
        `UPDATE organization_members
         SET role = 'owner'
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, newOwnerId]
      );

      await client.query(
        `UPDATE organization_members
         SET role = 'admin'
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, currentOwnerId]
      );

      await client.query('COMMIT');

      // Emit event
      this.emit('organization:ownership_transferred', {
        organizationId,
        previousOwnerId: currentOwnerId,
        newOwnerId,
        timestamp: new Date(),
      });

      return { success: true, data: updated };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error transferring ownership:', error);
      return {
        success: false,
        error: 'Failed to transfer ownership',
      };
    } finally {
      client.release();
    }
  }

  /**
   * List all organizations where user is a member
   */
  async listUserOrganizations(
    userId: number
  ): Promise<ServiceResponse<OrganizationWithMembers[]>> {
    try {
      // Get organizations where user is a member
      const { rows } = await pool.query<OrganizationWithMembers>(
        `SELECT
           o.*,
           (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
         FROM organizations o
         INNER JOIN organization_members om ON o.id = om.organization_id
         WHERE om.user_id = $1 AND o.deleted_at IS NULL
         ORDER BY o.created_at DESC`,
        [userId]
      );

      // Convert member_count from string to number
      const organizations = rows.map(org => ({
        ...org,
        member_count: typeof org.member_count === 'string'
          ? parseInt(org.member_count, 10)
          : org.member_count,
      }));

      return { success: true, data: organizations };
    } catch (error: any) {
      console.error('Error listing user organizations:', error);
      return {
        success: false,
        error: 'Failed to retrieve user organizations',
      };
    }
  }

  /**
   * Validate if user has access to organization
   * Returns true if user is a member
   */
  async validateAccess(
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse<boolean>> {
    try {
      const { rows } = await pool.query(
        `SELECT om.id
         FROM organization_members om
         INNER JOIN organizations o ON om.organization_id = o.id
         WHERE om.organization_id = $1
           AND om.user_id = $2
           AND o.deleted_at IS NULL`,
        [organizationId, userId]
      );

      const hasAccess = rows.length > 0;

      if (!hasAccess) {
        return {
          success: false,
          error: 'User does not have access to this organization',
        };
      }

      return { success: true, data: true };
    } catch (error: any) {
      console.error('Error validating access:', error);
      return {
        success: false,
        error: 'Failed to validate access',
      };
    }
  }

  /**
   * Get member's role in organization
   * Helper method for permission checks
   */
  async getMemberRole(
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse<string>> {
    try {
      const { rows } = await pool.query<{ role: string }>(
        `SELECT role FROM organization_members
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, userId]
      );

      if (rows.length === 0) {
        return {
          success: false,
          error: 'User is not a member of this organization',
        };
      }

      return { success: true, data: rows[0].role };
    } catch (error: any) {
      console.error('Error getting member role:', error);
      return {
        success: false,
        error: 'Failed to retrieve member role',
      };
    }
  }
}

// Export singleton instance
export const organizationService = new OrganizationService();
