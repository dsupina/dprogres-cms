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
  pool: {
    query: mockPoolQuery,
    connect: mockConnect,
  },
}));

// Import after mocks are defined
import { organizationService } from '../../services/OrganizationService';

describe('OrganizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrganization', () => {
    it('should create organization with auto-generated slug', async () => {
      // Mock BEGIN transaction (client)
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      // Mock user existence check (client)
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      // Mock slug uniqueness check (pool - outside transaction)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // Mock organization creation (client)
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Organization',
          slug: 'test-organization-abc123',
          owner_id: 1,
          plan_tier: 'free',
          logo_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // Mock adding owner as member (client)
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      // Mock COMMIT (client)
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.createOrganization({
        name: 'Test Organization',
        ownerId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Test Organization');
      expect(result.data?.owner_id).toBe(1);
      expect(result.data?.plan_tier).toBe('free');
    });

    it('should retry slug generation on collision', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user check
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 999 }] }); // slug collision
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // slug unique
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-def456',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // add member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 1,
      });

      expect(result.success).toBe(true);
    });

    it('should return error if name is empty', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.createOrganization({
        name: '',
        ownerId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization name is required');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if owner does not exist', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // user not found
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Owner user not found');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if slug generation fails after retries', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user check
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // attempt 1 fail
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] }); // attempt 2 fail
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] }); // attempt 3 fail
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate unique slug');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should not reuse slugs from soft-deleted organizations', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user check
      // Slug check returns a deleted org (has id, so not unique)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 999, deleted_at: new Date() }] });
      // Second attempt succeeds
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-new123',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // add member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 1,
      });

      expect(result.success).toBe(true);
      // Should have checked slug twice (once collision with deleted org, then success)
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT id FROM organizations WHERE slug = $1',
        expect.any(Array)
      );
    });
  });

  describe('getOrganization', () => {
    it('should get organization with member count', async () => {
      // Mock access validation (pool)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      // Mock organization fetch (pool)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // Mock member count (pool)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await organizationService.getOrganization(1, 1);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(1);
      expect(result.data?.member_count).toBe(5);
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // org not found

      const result = await organizationService.getOrganization(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if user has no access', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      }); // org exists
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // no access

      const result = await organizationService.getOrganization(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not have access to this organization');
    });
  });

  describe('updateOrganization', () => {
    it('should update organization name', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Updated Organization',
          slug: 'test-org',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await organizationService.updateOrganization(
        1,
        { name: 'Updated Organization' },
        1
      );

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated Organization');
    });

    it('should update organization logo', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          owner_id: 1,
          plan_tier: 'free',
          logo_url: 'https://example.com/logo.png',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await organizationService.updateOrganization(
        1,
        { logoUrl: 'https://example.com/logo.png' },
        1
      );

      expect(result.success).toBe(true);
      expect(result.data?.logo_url).toBe('https://example.com/logo.png');
    });

    it('should return error if user is not owner', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 2 }] });

      const result = await organizationService.updateOrganization(
        1,
        { name: 'Updated' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only organization owner can update organization details');
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.updateOrganization(
        999,
        { name: 'Updated' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if name is empty', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });

      const result = await organizationService.updateOrganization(
        1,
        { name: '' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization name cannot be empty');
    });

    it('should return error if no fields to update', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });

      const result = await organizationService.updateOrganization(1, {}, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No fields to update');
    });
  });

  describe('deleteOrganization', () => {
    it('should soft delete organization', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1, name: 'Test Org' }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.deleteOrganization(1, 1);

      expect(result.success).toBe(true);
    });

    it('should return error if user is not owner', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 2, name: 'Test Org' }],
      });

      const result = await organizationService.deleteOrganization(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only organization owner can delete organization');
    });

    it('should return error if organization not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.deleteOrganization(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership to existing member', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 2, role: 'admin' }],
      });
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          owner_id: 2,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // update new owner role
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // update old owner role
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await organizationService.transferOwnership(1, 2, 1);

      expect(result.success).toBe(true);
      expect(result.data?.owner_id).toBe(2);
    });

    it('should return error if attempting self-transfer', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.transferOwnership(1, 1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot transfer ownership to yourself');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if user is not current owner', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 2 }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.transferOwnership(1, 3, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only current owner can transfer ownership');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if new owner is not a member', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // not a member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.transferOwnership(1, 999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('New owner must be an existing organization member');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if organization not found', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // org not found
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await organizationService.transferOwnership(999, 2, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('listUserOrganizations', () => {
    it('should list all organizations where user is member', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Org 1',
            slug: 'org-1',
            owner_id: 1,
            plan_tier: 'free',
            created_at: new Date(),
            updated_at: new Date(),
            member_count: '3',
          },
          {
            id: 2,
            name: 'Org 2',
            slug: 'org-2',
            owner_id: 2,
            plan_tier: 'starter',
            created_at: new Date(),
            updated_at: new Date(),
            member_count: '5',
          },
        ],
      });

      const result = await organizationService.listUserOrganizations(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].member_count).toBe(3);
      expect(result.data![1].member_count).toBe(5);
    });

    it('should return empty array if user has no organizations', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.listUserOrganizations(999);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('validateAccess', () => {
    it('should return true if user is member', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await organizationService.validateAccess(1, 1);

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should return false if user is not member', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.validateAccess(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not have access to this organization');
    });
  });

  describe('getMemberRole', () => {
    it('should return member role', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

      const result = await organizationService.getMemberRole(1, 1);

      expect(result.success).toBe(true);
      expect(result.data).toBe('admin');
    });

    it('should return error if user is not member', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.getMemberRole(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not a member of this organization');
    });
  });

  describe('getAdminEmails', () => {
    it('should return admin emails for organization', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { email: 'owner@example.com', name: 'Owner User' },
          { email: 'admin@example.com', name: 'Admin User' },
        ],
      });

      const result = await organizationService.getAdminEmails(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toEqual({
        email: 'owner@example.com',
        name: 'Owner User',
      });
      expect(result.data![1]).toEqual({
        email: 'admin@example.com',
        name: 'Admin User',
      });
    });

    it('should return empty array if no admins found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.getAdminEmails(999);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle null name as undefined', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ email: 'admin@example.com', name: null }],
      });

      const result = await organizationService.getAdminEmails(1);

      expect(result.success).toBe(true);
      expect(result.data![0]).toEqual({
        email: 'admin@example.com',
        name: undefined,
      });
    });

    it('should handle database errors', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await organizationService.getAdminEmails(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve admin emails');
    });

    it('should only include owners and admins', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { email: 'owner@example.com', name: 'Owner' },
          { email: 'admin@example.com', name: 'Admin' },
        ],
      });

      await organizationService.getAdminEmails(1);

      // Verify the query only selects owner and admin roles
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("role IN ('owner', 'admin')"),
        [1]
      );
    });

    it('should exclude soft-deleted members', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ email: 'admin@example.com', name: 'Admin' }],
      });

      await organizationService.getAdminEmails(1);

      // Verify the query excludes deleted members
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('om.deleted_at IS NULL'),
        [1]
      );
    });
  });

  describe('Event Emission', () => {
    it('should emit organization:created event', async () => {
      const eventHandler = jest.fn();
      organizationService.on('organization:created', eventHandler);

      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // slug check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // add member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 1,
      });

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          ownerId: 1,
          name: 'Test Org',
        })
      );
    });

    it('should emit organization:updated event', async () => {
      const eventHandler = jest.fn();
      organizationService.on('organization:updated', eventHandler);

      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Updated Org',
          slug: 'test-org',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      await organizationService.updateOrganization(
        1,
        { name: 'Updated Org' },
        1
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          userId: 1,
        })
      );
    });

    it('should emit organization:deleted event', async () => {
      const eventHandler = jest.fn();
      organizationService.on('organization:deleted', eventHandler);

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1, name: 'Test Org' }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await organizationService.deleteOrganization(1, 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          userId: 1,
          organizationName: 'Test Org',
        })
      );
    });

    it('should emit organization:ownership_transferred event', async () => {
      const eventHandler = jest.fn();
      organizationService.on('organization:ownership_transferred', eventHandler);

      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 2, role: 'admin' }] });
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          owner_id: 2,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      await organizationService.transferOwnership(1, 2, 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          previousOwnerId: 1,
          newOwnerId: 2,
        })
      );
    });
  });
});
