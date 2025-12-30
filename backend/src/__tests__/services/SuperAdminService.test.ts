import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Separate mocks for pool.query and client.query
const mockPoolQuery: any = jest.fn();
const mockClientQuery: any = jest.fn();
const mockRelease: any = jest.fn();
const mockClient: any = {
  query: mockClientQuery,
  release: mockRelease,
};
const mockConnect: any = jest.fn(() => Promise.resolve(mockClient));

// Mock database module
jest.mock('../../utils/database', () => ({
  query: mockPoolQuery,
  pool: {
    query: mockPoolQuery,
    connect: mockConnect,
  },
}));

// Mock password utility
jest.mock('../../utils/password', () => ({
  hashPassword: jest.fn(() => Promise.resolve('hashed_password')),
}));

// Import after mocks are defined
import { superAdminService } from '../../services/SuperAdminService';

describe('SuperAdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardMetrics', () => {
    it('should return platform metrics', async () => {
      // Mock all metric queries
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: '10' }] }) // org total
        .mockResolvedValueOnce({ rows: [{ plan_tier: 'free', count: '5' }, { plan_tier: 'pro', count: '3' }] }) // org by tier
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // org new
        .mockResolvedValueOnce({ rows: [{ total: '50' }] }) // user total
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // super admins
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // user new
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // posts
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // pages
        .mockResolvedValueOnce({ rows: [{ count: '200' }] }) // media
        .mockResolvedValueOnce({ rows: [{ count: '5', mrr_cents: '50000' }] }); // subscriptions

      const result = await superAdminService.getDashboardMetrics();

      expect(result.success).toBe(true);
      expect(result.data?.organizations.total).toBe(10);
      expect(result.data?.organizations.byPlanTier.free).toBe(5);
      expect(result.data?.organizations.byPlanTier.pro).toBe(3);
      expect(result.data?.organizations.newLast30Days).toBe(2);
      expect(result.data?.users.total).toBe(50);
      expect(result.data?.users.superAdmins).toBe(2);
      expect(result.data?.content.totalPosts).toBe(100);
      expect(result.data?.content.totalPages).toBe(50);
      expect(result.data?.content.totalMedia).toBe(200);
      expect(result.data?.revenue.activeSubscriptions).toBe(5);
      expect(result.data?.revenue.mrr).toBe(500);
    });

    it('should handle subscriptions table not existing', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ total: '20' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '20' }] })
        .mockRejectedValueOnce(new Error('Table not found')); // subscriptions fails

      const result = await superAdminService.getDashboardMetrics();

      expect(result.success).toBe(true);
      expect(result.data?.revenue.activeSubscriptions).toBe(0);
      expect(result.data?.revenue.mrr).toBe(0);
    });

    it('should handle database error', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await superAdminService.getDashboardMetrics();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get dashboard metrics');
    });
  });

  describe('listAllOrganizations', () => {
    it('should return all organizations with owner info', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Org 1',
            slug: 'org-1',
            plan_tier: 'free',
            owner_id: 1,
            owner_email: 'owner@example.com',
            owner_name: 'John Doe',
            member_count: '3',
            status: 'active',
            created_at: new Date(),
          },
          {
            id: 2,
            name: 'Org 2',
            slug: 'org-2',
            plan_tier: 'pro',
            owner_id: 2,
            owner_email: 'owner2@example.com',
            owner_name: 'Jane Doe',
            member_count: '5',
            status: 'suspended',
            suspended_at: new Date(),
            suspended_reason: 'Non-payment',
            created_at: new Date(),
          },
        ],
      });

      const result = await superAdminService.listAllOrganizations();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].name).toBe('Org 1');
      expect(result.data![0].status).toBe('active');
      expect(result.data![1].status).toBe('suspended');
      expect(result.data![1].suspended_reason).toBe('Non-payment');
    });

    it('should return empty array when no organizations', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.listAllOrganizations();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle database error', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await superAdminService.listAllOrganizations();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to list organizations');
    });
  });

  describe('getOrganizationDetails', () => {
    it('should return organization with members and stats', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Test Org',
            slug: 'test-org',
            plan_tier: 'pro',
            owner_id: 1,
            owner_email: 'owner@example.com',
            owner_name: 'John Doe',
            member_count: '2',
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, user_id: 1, email: 'owner@example.com', first_name: 'John', last_name: 'Doe', role: 'owner', joined_at: new Date() },
            { id: 2, user_id: 2, email: 'admin@example.com', first_name: 'Jane', last_name: 'Doe', role: 'admin', joined_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // posts
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // pages
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // sites

      const result = await superAdminService.getOrganizationDetails(1);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Test Org');
      expect(result.data?.members).toHaveLength(2);
      expect(result.data?.stats.posts).toBe(10);
      expect(result.data?.stats.pages).toBe(5);
      expect(result.data?.stats.sites).toBe(2);
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.getOrganizationDetails(999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });
  });

  describe('listAllUsers', () => {
    it('should return all users with organization memberships', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, email: 'user1@example.com', first_name: 'John', last_name: 'Doe', role: 'admin', is_super_admin: true, email_verified: true, created_at: new Date() },
            { id: 2, email: 'user2@example.com', first_name: 'Jane', last_name: 'Doe', role: 'user', is_super_admin: false, email_verified: true, created_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Org 1', role: 'owner' }] }) // user 1 orgs
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Org 1', role: 'admin' }, { id: 2, name: 'Org 2', role: 'editor' }] }); // user 2 orgs

      const result = await superAdminService.listAllUsers();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].is_super_admin).toBe(true);
      expect(result.data![0].organizations).toHaveLength(1);
      expect(result.data![1].organizations).toHaveLength(2);
    });
  });

  describe('createOrgAdmin', () => {
    it('should create new user and add as admin', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // org exists
        .mockResolvedValueOnce({ rows: [] }) // user doesn't exist
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // create user
        .mockResolvedValueOnce({ rows: [] }) // add member
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await superAdminService.createOrgAdmin(
        1,
        'newadmin@example.com',
        'New',
        'Admin',
        1
      );

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe(5);
      expect(result.data?.temporaryPassword).toBeTruthy();
      expect(result.data?.temporaryPassword.length).toBe(16); // 8 bytes = 16 hex chars
    });

    it('should add existing user as admin without creating new user', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // org exists
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // user exists
        .mockResolvedValueOnce({ rows: [] }) // not already member
        .mockResolvedValueOnce({ rows: [] }) // add member
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await superAdminService.createOrgAdmin(
        1,
        'existing@example.com',
        'Existing',
        'User',
        1
      );

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe(5);
      expect(result.data?.temporaryPassword).toBe(''); // No password for existing user
    });

    it('should return error if organization not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // org not found
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await superAdminService.createOrgAdmin(
        999,
        'admin@example.com',
        'Admin',
        'User',
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if user is already a member', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // org exists
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // user exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // already member
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await superAdminService.createOrgAdmin(
        1,
        'existing@example.com',
        'Existing',
        'User',
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is already a member of this organization');
    });
  });

  describe('promoteToSuperAdmin', () => {
    it('should promote user to super admin', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.promoteToSuperAdmin(5, 1);

      expect(result.success).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_super_admin = true'),
        [5]
      );
    });

    it('should return error if user not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.promoteToSuperAdmin(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should return error if user is already super admin', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: true }] });

      const result = await superAdminService.promoteToSuperAdmin(5, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is already a super admin');
    });
  });

  describe('demoteSuperAdmin', () => {
    it('should demote super admin', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: true }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // more than 1 super admin
        .mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.demoteSuperAdmin(5, 1);

      expect(result.success).toBe(true);
    });

    it('should return error if user not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.demoteSuperAdmin(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should return error if user is not super admin', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: false }] });

      const result = await superAdminService.demoteSuperAdmin(5, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not a super admin');
    });

    it('should prevent demoting the last super admin', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: true }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // only 1 super admin

      const result = await superAdminService.demoteSuperAdmin(5, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot demote the last super admin');
    });

    it('should prevent self-demotion', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: true }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const result = await superAdminService.demoteSuperAdmin(5, 5);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot demote yourself');
    });
  });

  describe('suspendOrganization', () => {
    it('should suspend an active organization', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.suspendOrganization(1, 'Violation of terms', 1);

      expect(result.success).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'suspended'"),
        [1, 'Violation of terms']
      );
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.suspendOrganization(999, 'Reason', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if organization is already suspended', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'suspended' }] });

      const result = await superAdminService.suspendOrganization(1, 'Reason', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization is already suspended');
    });
  });

  describe('unsuspendOrganization', () => {
    it('should unsuspend a suspended organization', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'suspended' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.unsuspendOrganization(1, 1);

      expect(result.success).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
        [1]
      );
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.unsuspendOrganization(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if organization is already active', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'active' }] });

      const result = await superAdminService.unsuspendOrganization(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization is already active');
    });
  });

  describe('initiateOrganizationDeletion', () => {
    it('should initiate deletion with confirmation word', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.initiateOrganizationDeletion(1, 1);

      expect(result.success).toBe(true);
      expect(result.data?.confirmationWord).toMatch(/^[A-Z]+-\d{3}$/);
      expect(result.data?.gracePeriodEnds).toBeInstanceOf(Date);
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.initiateOrganizationDeletion(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });
  });

  describe('cancelOrganizationDeletion', () => {
    it('should cancel pending deletion', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'pending_deletion' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.cancelOrganizationDeletion(1, 1);

      expect(result.success).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
        [1]
      );
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.cancelOrganizationDeletion(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if organization is not pending deletion', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'active' }] });

      const result = await superAdminService.cancelOrganizationDeletion(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization is not pending deletion');
    });
  });

  describe('confirmOrganizationDeletion', () => {
    it('should permanently delete organization with correct confirmation word', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Test Org',
            status: 'pending_deletion',
            suspended_reason: 'Deletion initiated. Confirmation word: DELETE-123',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // soft delete
        .mockResolvedValueOnce({ rows: [] }) // log event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await superAdminService.confirmOrganizationDeletion(1, 'DELETE-123', 1);

      expect(result.success).toBe(true);
    });

    it('should return error with incorrect confirmation word', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Test Org',
            status: 'pending_deletion',
            suspended_reason: 'Deletion initiated. Confirmation word: DELETE-123',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await superAdminService.confirmOrganizationDeletion(1, 'WRONG-999', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid confirmation word');
    });

    it('should return error if organization not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // org not found
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await superAdminService.confirmOrganizationDeletion(999, 'DELETE-123', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if organization is not pending deletion', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Test Org',
            status: 'active',
            suspended_reason: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await superAdminService.confirmOrganizationDeletion(1, 'DELETE-123', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization must be in pending_deletion status');
    });
  });

  describe('processOverdueInvoices', () => {
    it('should warn organizations with overdue invoices', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Org 1', owner_id: 1, invoice_id: 100, due_date: new Date() },
          ],
        }) // find orgs to warn
        .mockResolvedValueOnce({ rows: [] }) // update org 1
        .mockResolvedValueOnce({ rows: [] }); // no orgs to suspend

      const result = await superAdminService.processOverdueInvoices();

      expect(result.success).toBe(true);
      expect(result.data?.warned).toBe(1);
      expect(result.data?.suspended).toBe(0);
    });

    it('should suspend organizations past grace period', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // no orgs to warn
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Org 1' },
            { id: 2, name: 'Org 2' },
          ],
        }) // orgs to suspend
        .mockResolvedValueOnce({ rows: [] }) // suspend org 1
        .mockResolvedValueOnce({ rows: [] }); // suspend org 2

      const result = await superAdminService.processOverdueInvoices();

      expect(result.success).toBe(true);
      expect(result.data?.warned).toBe(0);
      expect(result.data?.suspended).toBe(2);
    });

    it('should handle database error', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await superAdminService.processOverdueInvoices();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to process overdue invoices');
    });
  });

  describe('getOrganizationStatus', () => {
    it('should return organization status details', async () => {
      const gracePeriodEnds = new Date();
      gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 5);

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          status: 'active',
          suspended_at: null,
          suspended_reason: null,
          grace_period_ends_at: gracePeriodEnds,
          suspension_warning_sent_at: new Date(),
          has_overdue_invoices: true,
        }],
      });

      const result = await superAdminService.getOrganizationStatus(1);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('active');
      expect(result.data?.has_overdue_invoices).toBe(true);
      expect(result.data?.days_until_suspension).toBeGreaterThanOrEqual(4);
      expect(result.data?.days_until_suspension).toBeLessThanOrEqual(6);
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await superAdminService.getOrganizationStatus(999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return undefined days_until_suspension for suspended orgs', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          status: 'suspended',
          suspended_at: new Date(),
          suspended_reason: 'Non-payment',
          grace_period_ends_at: null,
          suspension_warning_sent_at: null,
          has_overdue_invoices: true,
        }],
      });

      const result = await superAdminService.getOrganizationStatus(1);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('suspended');
      expect(result.data?.days_until_suspension).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit organization:suspended event', async () => {
      const eventHandler = jest.fn();
      superAdminService.on('organization:suspended', eventHandler);

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [] });

      await superAdminService.suspendOrganization(1, 'Test reason', 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 1,
          orgName: 'Test Org',
          reason: 'Test reason',
          suspendedBy: 1,
        })
      );

      superAdminService.off('organization:suspended', eventHandler);
    });

    it('should emit organization:unsuspended event', async () => {
      const eventHandler = jest.fn();
      superAdminService.on('organization:unsuspended', eventHandler);

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'suspended' }] })
        .mockResolvedValueOnce({ rows: [] });

      await superAdminService.unsuspendOrganization(1, 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 1,
          orgName: 'Test Org',
          unsuspendedBy: 1,
        })
      );

      superAdminService.off('organization:unsuspended', eventHandler);
    });

    it('should emit super_admin:promoted event', async () => {
      const eventHandler = jest.fn();
      superAdminService.on('super_admin:promoted', eventHandler);

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', is_super_admin: false }] })
        .mockResolvedValueOnce({ rows: [] });

      await superAdminService.promoteToSuperAdmin(5, 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 5,
          email: 'user@example.com',
          promotedBy: 1,
        })
      );

      superAdminService.off('super_admin:promoted', eventHandler);
    });

    it('should emit organization:deletion_initiated event', async () => {
      const eventHandler = jest.fn();
      superAdminService.on('organization:deletion_initiated', eventHandler);

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Org', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [] });

      await superAdminService.initiateOrganizationDeletion(1, 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 1,
          orgName: 'Test Org',
          confirmationWord: expect.stringMatching(/^[A-Z]+-\d{3}$/),
          initiatedBy: 1,
        })
      );

      superAdminService.off('organization:deletion_initiated', eventHandler);
    });
  });
});
