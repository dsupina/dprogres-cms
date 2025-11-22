import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock pool with connect() method for transactions
const mockQuery: any = jest.fn();
const mockRelease: any = jest.fn();
const mockClient: any = {
  query: mockQuery,
  release: mockRelease,
};
const mockConnect: any = jest.fn(() => Promise.resolve(mockClient));

// Mock database module
jest.mock('../../utils/database', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

// Import after mocks are defined
import { organizationService, OrganizationService } from '../../services/OrganizationService';

describe('OrganizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrganization', () => {
    it('should create organization with auto-generated slug', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock user existence check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      // Mock slug uniqueness check (unique on first attempt)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock organization creation
      mockQuery.mockResolvedValueOnce({
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

      // Mock adding owner as member
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock COMMIT transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.createOrganization({
        name: 'Test Organization',
        ownerId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Test Organization');
      expect(result.data?.slug).toMatch(/^test-organization-[a-f0-9]{6}$/);
      expect(result.data?.owner_id).toBe(1);
      expect(result.data?.plan_tier).toBe('free');

      // Verify owner was added as member
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO organization_members'),
        expect.arrayContaining([1, 1])
      );
    });

    it('should retry slug generation on collision', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock user existence check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      // Mock slug uniqueness check (collision on first attempt, success on second)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 999 }] }); // Collision
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Unique

      // Mock organization creation
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-def456',
          owner_id: 1,
          plan_tier: 'free',
          logo_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      // Mock adding owner as member
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock COMMIT transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 1,
      });

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM organizations WHERE slug = $1 AND deleted_at IS NULL',
        expect.any(Array)
      );
    });

    it('should return error if name is empty', async () => {
      const result = await organizationService.createOrganization({
        name: '',
        ownerId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization name is required');
    });

    it('should return error if owner does not exist', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock user existence check (user not found)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock ROLLBACK
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Owner user not found');
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if slug generation fails after retries', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock user existence check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      // Mock slug uniqueness check (all attempts fail)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Attempt 1
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] }); // Attempt 2
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] }); // Attempt 3

      // Mock ROLLBACK
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate unique slug');
    });
  });

  describe('getOrganization', () => {
    it('should get organization with member count', async () => {
      // Mock access validation
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      // Mock organization fetch
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-abc123',
          owner_id: 1,
          plan_tier: 'free',
          logo_url: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        }],
      });

      // Mock member count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '5' }],
      });

      const result = await organizationService.getOrganization(1, 1);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(1);
      expect(result.data?.member_count).toBe(5);
    });

    it('should return error if user has no access', async () => {
      // Mock access validation (no access)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.getOrganization(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not have access to this organization');
    });

    it('should return error if organization not found', async () => {
      // Mock access validation
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      // Mock organization fetch (not found)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.getOrganization(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });
  });

  describe('updateOrganization', () => {
    it('should update organization name', async () => {
      // Mock organization fetch with owner check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });

      // Mock update query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Updated Organization',
          slug: 'test-org-abc123',
          owner_id: 1,
          plan_tier: 'free',
          logo_url: null,
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
      // Mock organization fetch with owner check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });

      // Mock update query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-abc123',
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
      // Mock organization fetch (different owner)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 2 }],
      });

      const result = await organizationService.updateOrganization(
        1,
        { name: 'Updated' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only organization owner can update organization details');
    });

    it('should return error if organization not found', async () => {
      // Mock organization fetch (not found)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.updateOrganization(
        999,
        { name: 'Updated' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });

    it('should return error if name is empty', async () => {
      // Mock organization fetch
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });

      const result = await organizationService.updateOrganization(
        1,
        { name: '' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization name cannot be empty');
    });

    it('should return error if no fields to update', async () => {
      // Mock organization fetch
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });

      const result = await organizationService.updateOrganization(
        1,
        {},
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No fields to update');
    });
  });

  describe('deleteOrganization', () => {
    it('should soft delete organization', async () => {
      // Mock organization fetch with owner check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1, name: 'Test Org' }],
      });

      // Mock soft delete query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.deleteOrganization(1, 1);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET deleted_at = NOW()'),
        [1]
      );
    });

    it('should return error if user is not owner', async () => {
      // Mock organization fetch (different owner)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 2, name: 'Test Org' }],
      });

      const result = await organizationService.deleteOrganization(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only organization owner can delete organization');
    });

    it('should return error if organization not found', async () => {
      // Mock organization fetch (not found)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.deleteOrganization(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership to existing member', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock organization fetch with owner check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });

      // Mock new owner membership check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 2, role: 'admin' }],
      });

      // Mock organization update
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-abc123',
          owner_id: 2,
          plan_tier: 'free',
          logo_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      // Mock new owner role update
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock old owner role update
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock COMMIT transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.transferOwnership(1, 2, 1);

      expect(result.success).toBe(true);
      expect(result.data?.owner_id).toBe(2);

      // Verify role updates
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET role = 'owner'"),
        [1, 2]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET role = 'admin'"),
        [1, 1]
      );
    });

    it('should return error if user is not current owner', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock organization fetch (different owner)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 2 }],
      });

      // Mock ROLLBACK
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.transferOwnership(1, 3, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only current owner can transfer ownership');
    });

    it('should return error if new owner is not a member', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock organization fetch with owner check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });

      // Mock new owner membership check (not a member)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      // Mock ROLLBACK
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.transferOwnership(1, 999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('New owner must be an existing organization member');
    });

    it('should return error if organization not found', async () => {
      // Mock BEGIN transaction
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock organization fetch (not found)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      // Mock ROLLBACK
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await organizationService.transferOwnership(999, 2, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
    });
  });

  describe('listUserOrganizations', () => {
    it('should list all organizations where user is member', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Org 1',
            slug: 'org-1',
            owner_id: 1,
            plan_tier: 'free',
            logo_url: null,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            member_count: '3',
          },
          {
            id: 2,
            name: 'Org 2',
            slug: 'org-2',
            owner_id: 2,
            plan_tier: 'starter',
            logo_url: null,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
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
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.listUserOrganizations(999);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('validateAccess', () => {
    it('should return true if user is member', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const result = await organizationService.validateAccess(1, 1);

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should return false if user is not member', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.validateAccess(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not have access to this organization');
    });
  });

  describe('getMemberRole', () => {
    it('should return member role', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      });

      const result = await organizationService.getMemberRole(1, 1);

      expect(result.success).toBe(true);
      expect(result.data).toBe('admin');
    });

    it('should return error if user is not member', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await organizationService.getMemberRole(1, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is not a member of this organization');
    });
  });

  describe('Event Emission', () => {
    it('should emit organization:created event', async () => {
      const eventHandler = jest.fn();
      organizationService.on('organization:created', eventHandler);

      // Mock all queries for successful creation
      mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user check
      mockQuery.mockResolvedValueOnce({ rows: [] }); // slug check
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Test Org',
          slug: 'test-org-abc123',
          owner_id: 1,
          plan_tier: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // add member
      mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

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

      // Mock queries
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1 }],
      });
      mockQuery.mockResolvedValueOnce({
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

      // Mock queries
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, owner_id: 1, name: 'Test Org' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

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

      // Mock all queries for successful transfer
      mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, role: 'admin' }] });
      mockQuery.mockResolvedValueOnce({
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
      mockQuery.mockResolvedValueOnce({ rows: [] }); // update new owner role
      mockQuery.mockResolvedValueOnce({ rows: [] }); // update old owner role
      mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

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
