import { EventEmitter } from 'events';
import { query, pool } from '../utils/database';
import { hashPassword } from '../utils/password';
import crypto from 'crypto';
import { organizationStatusCache } from '../middleware/organizationStatus';
import { superAdminCache } from '../middleware/auth';

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PlatformMetrics {
  organizations: {
    total: number;
    byPlanTier: Record<string, number>;
    newLast30Days: number;
  };
  users: {
    total: number;
    superAdmins: number;
    newLast30Days: number;
  };
  content: {
    totalPosts: number;
    totalPages: number;
    totalMedia: number;
  };
  revenue: {
    activeSubscriptions: number;
    mrr: number;
  };
}

export interface OrganizationSummary {
  id: number;
  name: string;
  slug: string;
  plan_tier: string;
  owner_id: number;
  owner_email: string;
  owner_name: string;
  member_count: number;
  status: 'active' | 'suspended' | 'pending_deletion';
  suspended_at?: Date;
  suspended_reason?: string;
  grace_period_ends_at?: Date;
  suspension_warning_sent_at?: Date;
  created_at: Date;
}

export interface OrganizationDetails extends OrganizationSummary {
  members: Array<{
    id: number;
    user_id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    joined_at: Date;
  }>;
  stats: {
    posts: number;
    pages: number;
    sites: number;
  };
}

export interface UserSummary {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_super_admin: boolean;
  email_verified: boolean;
  created_at: Date;
  organizations: Array<{
    id: number;
    name: string;
    role: string;
  }>;
}

class SuperAdminService extends EventEmitter {
  /**
   * Get platform-wide metrics for the super admin dashboard
   */
  async getDashboardMetrics(): Promise<ServiceResponse<PlatformMetrics>> {
    try {
      // Organization metrics
      const orgTotalResult = await query(
        'SELECT COUNT(*) as total FROM organizations WHERE deleted_at IS NULL'
      );

      const orgByTierResult = await query(
        `SELECT plan_tier, COUNT(*) as count
         FROM organizations
         WHERE deleted_at IS NULL
         GROUP BY plan_tier`
      );

      const orgNewResult = await query(
        `SELECT COUNT(*) as count
         FROM organizations
         WHERE deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '30 days'`
      );

      // User metrics
      const userTotalResult = await query('SELECT COUNT(*) as total FROM users');

      const superAdminResult = await query(
        'SELECT COUNT(*) as count FROM users WHERE is_super_admin = true'
      );

      const userNewResult = await query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE created_at >= NOW() - INTERVAL '30 days'`
      );

      // Content metrics
      const postsResult = await query('SELECT COUNT(*) as count FROM posts');
      const pagesResult = await query('SELECT COUNT(*) as count FROM pages');
      const mediaResult = await query('SELECT COUNT(*) as count FROM media_files');

      // Revenue metrics (from subscriptions table if exists)
      let activeSubscriptions = 0;
      let mrr = 0;
      try {
        const subResult = await query(
          `SELECT COUNT(*) as count,
                  COALESCE(SUM(
                    CASE
                      WHEN billing_interval = 'year' THEN amount_cents / 12.0
                      ELSE amount_cents
                    END
                  ), 0)::integer as mrr_cents
           FROM subscriptions
           WHERE status = 'active'`
        );
        activeSubscriptions = parseInt(subResult.rows[0]?.count || '0');
        mrr = Math.round(parseInt(subResult.rows[0]?.mrr_cents || '0') / 100);
      } catch {
        // Subscriptions table may not exist yet
      }

      const byPlanTier: Record<string, number> = {};
      for (const row of orgByTierResult.rows) {
        byPlanTier[row.plan_tier] = parseInt(row.count);
      }

      const metrics: PlatformMetrics = {
        organizations: {
          total: parseInt(orgTotalResult.rows[0]?.total || '0'),
          byPlanTier,
          newLast30Days: parseInt(orgNewResult.rows[0]?.count || '0'),
        },
        users: {
          total: parseInt(userTotalResult.rows[0]?.total || '0'),
          superAdmins: parseInt(superAdminResult.rows[0]?.count || '0'),
          newLast30Days: parseInt(userNewResult.rows[0]?.count || '0'),
        },
        content: {
          totalPosts: parseInt(postsResult.rows[0]?.count || '0'),
          totalPages: parseInt(pagesResult.rows[0]?.count || '0'),
          totalMedia: parseInt(mediaResult.rows[0]?.count || '0'),
        },
        revenue: {
          activeSubscriptions,
          mrr,
        },
      };

      return { success: true, data: metrics };
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return { success: false, error: 'Failed to get dashboard metrics' };
    }
  }

  /**
   * List all organizations with owner info and member count
   */
  async listAllOrganizations(): Promise<ServiceResponse<OrganizationSummary[]>> {
    try {
      const result = await query(
        `SELECT
          o.id,
          o.name,
          o.slug,
          o.plan_tier,
          o.owner_id,
          o.status,
          o.suspended_at,
          o.suspended_reason,
          o.grace_period_ends_at,
          o.suspension_warning_sent_at,
          o.created_at,
          u.email as owner_email,
          COALESCE(u.first_name || ' ' || u.last_name, u.email) as owner_name,
          (SELECT COUNT(*) FROM organization_members om
           WHERE om.organization_id = o.id AND om.deleted_at IS NULL) as member_count
        FROM organizations o
        LEFT JOIN users u ON o.owner_id = u.id
        WHERE o.deleted_at IS NULL
        ORDER BY o.created_at DESC`
      );

      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Error listing organizations:', error);
      return { success: false, error: 'Failed to list organizations' };
    }
  }

  /**
   * Get detailed organization info including all members and stats
   */
  async getOrganizationDetails(orgId: number): Promise<ServiceResponse<OrganizationDetails>> {
    try {
      // Get organization with owner info and status fields
      const orgResult = await query(
        `SELECT
          o.id,
          o.name,
          o.slug,
          o.plan_tier,
          o.owner_id,
          o.created_at,
          o.status,
          o.suspended_at,
          o.suspended_reason,
          o.grace_period_ends_at,
          o.suspension_warning_sent_at,
          u.email as owner_email,
          COALESCE(u.first_name || ' ' || u.last_name, u.email) as owner_name,
          (SELECT COUNT(*) FROM organization_members om
           WHERE om.organization_id = o.id AND om.deleted_at IS NULL) as member_count
        FROM organizations o
        LEFT JOIN users u ON o.owner_id = u.id
        WHERE o.id = $1 AND o.deleted_at IS NULL`,
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const org = orgResult.rows[0];

      // Get all members
      const membersResult = await query(
        `SELECT
          om.id,
          om.user_id,
          u.email,
          u.first_name,
          u.last_name,
          om.role,
          om.joined_at
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = $1 AND om.deleted_at IS NULL
        ORDER BY
          CASE om.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'editor' THEN 3
            WHEN 'publisher' THEN 4
            WHEN 'viewer' THEN 5
            ELSE 6
          END,
          om.joined_at`,
        [orgId]
      );

      // Get content stats
      const postsResult = await query(
        'SELECT COUNT(*) as count FROM posts WHERE organization_id = $1',
        [orgId]
      );
      const pagesResult = await query(
        'SELECT COUNT(*) as count FROM pages WHERE organization_id = $1',
        [orgId]
      );
      const sitesResult = await query(
        'SELECT COUNT(*) as count FROM sites WHERE organization_id = $1',
        [orgId]
      );

      const details: OrganizationDetails = {
        ...org,
        members: membersResult.rows,
        stats: {
          posts: parseInt(postsResult.rows[0]?.count || '0'),
          pages: parseInt(pagesResult.rows[0]?.count || '0'),
          sites: parseInt(sitesResult.rows[0]?.count || '0'),
        },
      };

      return { success: true, data: details };
    } catch (error) {
      console.error('Error getting organization details:', error);
      return { success: false, error: 'Failed to get organization details' };
    }
  }

  /**
   * List all users with their organization memberships
   */
  async listAllUsers(): Promise<ServiceResponse<UserSummary[]>> {
    try {
      const result = await query(
        `SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.role,
          COALESCE(u.is_super_admin, false) as is_super_admin,
          COALESCE(u.email_verified, true) as email_verified,
          u.created_at
        FROM users u
        ORDER BY u.created_at DESC`
      );

      // Get organization memberships for each user
      const users: UserSummary[] = [];
      for (const user of result.rows) {
        const orgsResult = await query(
          `SELECT
            o.id,
            o.name,
            om.role
          FROM organization_members om
          JOIN organizations o ON om.organization_id = o.id
          WHERE om.user_id = $1 AND om.deleted_at IS NULL AND o.deleted_at IS NULL`,
          [user.id]
        );

        users.push({
          ...user,
          organizations: orgsResult.rows,
        });
      }

      return { success: true, data: users };
    } catch (error) {
      console.error('Error listing users:', error);
      return { success: false, error: 'Failed to list users' };
    }
  }

  /**
   * Create a new admin user for an organization
   */
  async createOrgAdmin(
    orgId: number,
    email: string,
    firstName: string,
    lastName: string,
    createdBy: number
  ): Promise<ServiceResponse<{ userId: number; temporaryPassword: string }>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if organization exists
      const orgResult = await client.query(
        'SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Organization not found' };
      }

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        // User exists - check if already member
        const userId = existingUser.rows[0].id;
        const memberCheck = await client.query(
          `SELECT id FROM organization_members
           WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
          [orgId, userId]
        );

        if (memberCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return { success: false, error: 'User is already a member of this organization' };
        }

        // Add existing user to organization as admin
        await client.query(
          `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
           VALUES ($1, $2, 'admin', $3)`,
          [orgId, userId, createdBy]
        );

        // Update user's role to admin and set organization context
        // This ensures their JWTs will have the correct role for admin access
        await client.query(
          `UPDATE users
           SET role = 'admin',
               current_organization_id = COALESCE(current_organization_id, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [orgId, userId]
        );

        await client.query('COMMIT');

        this.emit('org_admin:added', { orgId, userId, addedBy: createdBy });

        return {
          success: true,
          data: { userId, temporaryPassword: '' },
        };
      }

      // Create new user with temporary password
      const temporaryPassword = crypto.randomBytes(8).toString('hex');
      const hashedPassword = await hashPassword(temporaryPassword);

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified, current_organization_id)
         VALUES ($1, $2, $3, $4, 'admin', true, $5)
         RETURNING id`,
        [email, hashedPassword, firstName, lastName, orgId]
      );

      const userId = userResult.rows[0].id;

      // Add user as admin of the organization
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
         VALUES ($1, $2, 'admin', $3)`,
        [orgId, userId, createdBy]
      );

      await client.query('COMMIT');

      this.emit('org_admin:created', { orgId, userId, email, createdBy });

      return {
        success: true,
        data: { userId, temporaryPassword },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating org admin:', error);
      return { success: false, error: 'Failed to create organization admin' };
    } finally {
      client.release();
    }
  }

  /**
   * Promote a user to super admin
   */
  async promoteToSuperAdmin(userId: number, promotedBy: number): Promise<ServiceResponse<void>> {
    try {
      const userResult = await query(
        'SELECT id, email, is_super_admin FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return { success: false, error: 'User not found' };
      }

      if (userResult.rows[0].is_super_admin) {
        return { success: false, error: 'User is already a super admin' };
      }

      await query(
        'UPDATE users SET is_super_admin = true, updated_at = NOW() WHERE id = $1',
        [userId]
      );

      // Invalidate super admin cache to immediately grant elevated access
      superAdminCache.invalidate(userId);

      this.emit('super_admin:promoted', {
        userId,
        email: userResult.rows[0].email,
        promotedBy,
      });

      return { success: true };
    } catch (error) {
      console.error('Error promoting to super admin:', error);
      return { success: false, error: 'Failed to promote user to super admin' };
    }
  }

  /**
   * Demote a user from super admin
   */
  async demoteSuperAdmin(userId: number, demotedBy: number): Promise<ServiceResponse<void>> {
    try {
      const userResult = await query(
        'SELECT id, email, is_super_admin FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return { success: false, error: 'User not found' };
      }

      if (!userResult.rows[0].is_super_admin) {
        return { success: false, error: 'User is not a super admin' };
      }

      // Prevent demoting the last super admin
      const countResult = await query(
        'SELECT COUNT(*) as count FROM users WHERE is_super_admin = true'
      );

      if (parseInt(countResult.rows[0].count) <= 1) {
        return { success: false, error: 'Cannot demote the last super admin' };
      }

      // Prevent self-demotion
      if (userId === demotedBy) {
        return { success: false, error: 'Cannot demote yourself' };
      }

      await query(
        'UPDATE users SET is_super_admin = false, updated_at = NOW() WHERE id = $1',
        [userId]
      );

      // Invalidate super admin cache to immediately revoke elevated access
      superAdminCache.invalidate(userId);

      this.emit('super_admin:demoted', {
        userId,
        email: userResult.rows[0].email,
        demotedBy,
      });

      return { success: true };
    } catch (error) {
      console.error('Error demoting super admin:', error);
      return { success: false, error: 'Failed to demote super admin' };
    }
  }

  /**
   * Suspend an organization (blocks access but preserves data)
   */
  async suspendOrganization(
    orgId: number,
    reason: string,
    suspendedBy: number
  ): Promise<ServiceResponse<void>> {
    try {
      const orgResult = await query(
        'SELECT id, name, status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      if (orgResult.rows[0].status === 'suspended') {
        return { success: false, error: 'Organization is already suspended' };
      }

      await query(
        `UPDATE organizations
         SET status = 'suspended',
             suspended_at = NOW(),
             suspended_reason = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [orgId, reason]
      );

      // Invalidate organization status cache to immediately block access
      organizationStatusCache.invalidate(orgId);

      this.emit('organization:suspended', {
        orgId,
        orgName: orgResult.rows[0].name,
        reason,
        suspendedBy,
      });

      return { success: true };
    } catch (error) {
      console.error('Error suspending organization:', error);
      return { success: false, error: 'Failed to suspend organization' };
    }
  }

  /**
   * Unsuspend/reactivate an organization
   */
  async unsuspendOrganization(
    orgId: number,
    unsuspendedBy: number
  ): Promise<ServiceResponse<void>> {
    try {
      const orgResult = await query(
        'SELECT id, name, status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      if (orgResult.rows[0].status === 'active') {
        return { success: false, error: 'Organization is already active' };
      }

      await query(
        `UPDATE organizations
         SET status = 'active',
             suspended_at = NULL,
             suspended_reason = NULL,
             grace_period_ends_at = NULL,
             suspension_warning_sent_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [orgId]
      );

      // Invalidate organization status cache to immediately allow access
      organizationStatusCache.invalidate(orgId);

      this.emit('organization:unsuspended', {
        orgId,
        orgName: orgResult.rows[0].name,
        unsuspendedBy,
      });

      return { success: true };
    } catch (error) {
      console.error('Error unsuspending organization:', error);
      return { success: false, error: 'Failed to unsuspend organization' };
    }
  }

  /**
   * Initiate organization deletion (sets pending_deletion with grace period)
   * Returns a random confirmation word that must be entered to confirm deletion
   */
  async initiateOrganizationDeletion(
    orgId: number,
    initiatedBy: number
  ): Promise<ServiceResponse<{ confirmationWord: string; gracePeriodEnds: Date }>> {
    try {
      const orgResult = await query(
        'SELECT id, name, status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      // Generate random word for confirmation
      const words = ['CONFIRM', 'DELETE', 'REMOVE', 'ERASE', 'DESTROY', 'PURGE', 'TERMINATE'];
      const randomWord = words[Math.floor(Math.random() * words.length)];
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const confirmationWord = `${randomWord}-${randomSuffix}`;

      // Set grace period (7 days from now)
      const gracePeriodEnds = new Date();
      gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 7);

      await query(
        `UPDATE organizations
         SET status = 'pending_deletion',
             suspended_at = NOW(),
             suspended_reason = $2,
             grace_period_ends_at = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [orgId, `Deletion initiated. Confirmation word: ${confirmationWord}`, gracePeriodEnds]
      );

      // Invalidate organization status cache to immediately block access
      organizationStatusCache.invalidate(orgId);

      this.emit('organization:deletion_initiated', {
        orgId,
        orgName: orgResult.rows[0].name,
        confirmationWord,
        gracePeriodEnds,
        initiatedBy,
      });

      return {
        success: true,
        data: { confirmationWord, gracePeriodEnds },
      };
    } catch (error) {
      console.error('Error initiating organization deletion:', error);
      return { success: false, error: 'Failed to initiate organization deletion' };
    }
  }

  /**
   * Cancel pending organization deletion
   */
  async cancelOrganizationDeletion(
    orgId: number,
    cancelledBy: number
  ): Promise<ServiceResponse<void>> {
    try {
      const orgResult = await query(
        'SELECT id, name, status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      if (orgResult.rows[0].status !== 'pending_deletion') {
        return { success: false, error: 'Organization is not pending deletion' };
      }

      await query(
        `UPDATE organizations
         SET status = 'active',
             suspended_at = NULL,
             suspended_reason = NULL,
             grace_period_ends_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [orgId]
      );

      // Invalidate organization status cache to immediately allow access
      organizationStatusCache.invalidate(orgId);

      this.emit('organization:deletion_cancelled', {
        orgId,
        orgName: orgResult.rows[0].name,
        cancelledBy,
      });

      return { success: true };
    } catch (error) {
      console.error('Error cancelling organization deletion:', error);
      return { success: false, error: 'Failed to cancel organization deletion' };
    }
  }

  /**
   * Permanently delete organization (requires confirmation word)
   */
  async confirmOrganizationDeletion(
    orgId: number,
    confirmationWord: string,
    deletedBy: number
  ): Promise<ServiceResponse<void>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orgResult = await client.query(
        'SELECT id, name, status, suspended_reason FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Organization not found' };
      }

      const org = orgResult.rows[0];

      if (org.status !== 'pending_deletion') {
        await client.query('ROLLBACK');
        return { success: false, error: 'Organization must be in pending_deletion status' };
      }

      // Verify confirmation word
      const storedWord = org.suspended_reason?.match(/Confirmation word: ([A-Z]+-\d+)/)?.[1];
      if (!storedWord || storedWord !== confirmationWord) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invalid confirmation word' };
      }

      // Soft delete the organization
      await client.query(
        `UPDATE organizations
         SET deleted_at = NOW(),
             status = 'suspended',
             updated_at = NOW()
         WHERE id = $1`,
        [orgId]
      );

      // Log the deletion event
      await client.query(
        `INSERT INTO subscription_events (organization_id, event_type, stripe_event_id, data, processed_at)
         VALUES ($1, 'organization_deleted', $2, $3, NOW())`,
        [
          orgId,
          `org_delete_${orgId}_${Date.now()}`,
          JSON.stringify({ deletedBy, orgName: org.name, confirmationWord }),
        ]
      );

      await client.query('COMMIT');

      // Invalidate organization status cache to immediately block access
      organizationStatusCache.invalidate(orgId);

      this.emit('organization:deleted', {
        orgId,
        orgName: org.name,
        deletedBy,
      });

      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error deleting organization:', error);
      return { success: false, error: 'Failed to delete organization' };
    } finally {
      client.release();
    }
  }

  /**
   * Send suspension warning to organizations with overdue invoices
   * Call this from a scheduled job
   */
  async processOverdueInvoices(): Promise<ServiceResponse<{ warned: number; suspended: number }>> {
    try {
      // Find organizations with overdue invoices that haven't been warned
      const warnResult = await query(
        `SELECT DISTINCT o.id, o.name, o.owner_id, i.id as invoice_id, i.due_date
         FROM organizations o
         JOIN invoices i ON o.id = i.organization_id
         WHERE i.status = 'open'
         AND i.due_date < NOW()
         AND o.status = 'active'
         AND o.suspension_warning_sent_at IS NULL
         AND o.deleted_at IS NULL`
      );

      let warned = 0;
      for (const row of warnResult.rows) {
        // Set warning and grace period (10 days)
        const gracePeriodEnds = new Date();
        gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 10);

        await query(
          `UPDATE organizations
           SET suspension_warning_sent_at = NOW(),
               grace_period_ends_at = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, gracePeriodEnds]
        );

        this.emit('organization:payment_warning', {
          orgId: row.id,
          orgName: row.name,
          ownerId: row.owner_id,
          invoiceId: row.invoice_id,
          dueDate: row.due_date,
          gracePeriodEnds,
        });

        warned++;
      }

      // Find organizations past grace period that should be suspended
      const suspendResult = await query(
        `SELECT o.id, o.name
         FROM organizations o
         WHERE o.grace_period_ends_at < NOW()
         AND o.status = 'active'
         AND o.suspension_warning_sent_at IS NOT NULL
         AND o.deleted_at IS NULL`
      );

      let suspended = 0;
      for (const row of suspendResult.rows) {
        await query(
          `UPDATE organizations
           SET status = 'suspended',
               suspended_at = NOW(),
               suspended_reason = 'Automatic suspension due to unpaid invoices',
               updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        // Invalidate organization status cache to immediately block access
        organizationStatusCache.invalidate(row.id);

        this.emit('organization:auto_suspended', {
          orgId: row.id,
          orgName: row.name,
          reason: 'Unpaid invoices past grace period',
        });

        suspended++;
      }

      return { success: true, data: { warned, suspended } };
    } catch (error) {
      console.error('Error processing overdue invoices:', error);
      return { success: false, error: 'Failed to process overdue invoices' };
    }
  }

  /**
   * Get organization suspension status for display
   */
  async getOrganizationStatus(orgId: number): Promise<ServiceResponse<{
    status: string;
    suspended_at?: Date;
    suspended_reason?: string;
    grace_period_ends_at?: Date;
    days_until_suspension?: number;
    has_overdue_invoices: boolean;
  }>> {
    try {
      const orgResult = await query(
        `SELECT
          o.status,
          o.suspended_at,
          o.suspended_reason,
          o.grace_period_ends_at,
          o.suspension_warning_sent_at,
          EXISTS(
            SELECT 1 FROM invoices i
            WHERE i.organization_id = o.id
            AND i.status = 'open'
            AND i.due_date < NOW()
          ) as has_overdue_invoices
         FROM organizations o
         WHERE o.id = $1 AND o.deleted_at IS NULL`,
        [orgId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const org = orgResult.rows[0];
      let daysUntilSuspension: number | undefined;

      if (org.grace_period_ends_at && org.status === 'active') {
        const now = new Date();
        const graceEnd = new Date(org.grace_period_ends_at);
        const diffTime = graceEnd.getTime() - now.getTime();
        daysUntilSuspension = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysUntilSuspension < 0) daysUntilSuspension = 0;
      }

      return {
        success: true,
        data: {
          status: org.status,
          suspended_at: org.suspended_at,
          suspended_reason: org.suspended_reason,
          grace_period_ends_at: org.grace_period_ends_at,
          days_until_suspension: daysUntilSuspension,
          has_overdue_invoices: org.has_overdue_invoices,
        },
      };
    } catch (error) {
      console.error('Error getting organization status:', error);
      return { success: false, error: 'Failed to get organization status' };
    }
  }
}

export const superAdminService = new SuperAdminService();
