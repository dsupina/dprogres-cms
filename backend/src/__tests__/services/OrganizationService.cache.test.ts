import { organizationService } from '../../services/OrganizationService';
import { permissionCache } from '../../middleware/rbac';
import { OrganizationRole } from '../../config/permissions';
import { pool } from '../../utils/database';

// Mock the pool module
jest.mock('../../utils/database', () => ({
  pool: {
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

/**
 * Integration tests for OrganizationService cache invalidation
 *
 * These tests verify that permission cache is properly invalidated
 * during ownership transfer operations.
 *
 * Security Requirement: Cache must be invalidated for BOTH users
 * during ownership transfer to prevent stale permission windows.
 */

describe('OrganizationService Cache Invalidation', () => {
  beforeEach(() => {
    // Clear cache before each test
    permissionCache.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('transferOwnership', () => {
    it('should invalidate cache for both old and new owner', async () => {
      const organizationId = 1;
      const currentOwnerId = 10;
      const newOwnerId = 20;

      // Prime cache with current roles
      permissionCache.set(organizationId, currentOwnerId, OrganizationRole.OWNER);
      permissionCache.set(organizationId, newOwnerId, OrganizationRole.ADMIN);

      // Verify cache is populated
      expect(permissionCache.get(organizationId, currentOwnerId)).toBe(OrganizationRole.OWNER);
      expect(permissionCache.get(organizationId, newOwnerId)).toBe(OrganizationRole.ADMIN);

      // Mock database to return success
      const mockClient = {
        query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve();

          // Get organization
          if (sql.includes('SELECT id, owner_id FROM organizations')) {
            return Promise.resolve({
              rows: [{ id: organizationId, owner_id: currentOwnerId }],
            });
          }

          // Verify new owner is a member
          if (sql.includes('SELECT id, role FROM organization_members') &&
              params && params[1] === newOwnerId) {
            return Promise.resolve({
              rows: [{ id: 1, role: 'admin' }],
            });
          }

          // Update organization owner_id
          if (sql.includes('UPDATE organizations')) {
            return Promise.resolve({
              rows: [{
                id: organizationId,
                name: 'Test Org',
                owner_id: newOwnerId,
              }],
            });
          }

          // Update member roles (both queries)
          if (sql.includes('UPDATE organization_members')) {
            return Promise.resolve();
          }

          return Promise.resolve({ rows: [] });
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValueOnce(mockClient);

      // Transfer ownership
      const result = await organizationService.transferOwnership(
        organizationId,
        newOwnerId,
        currentOwnerId
      );

      expect(result.success).toBe(true);

      // CRITICAL: Both users' cache must be invalidated
      expect(permissionCache.get(organizationId, currentOwnerId)).toBeNull();
      expect(permissionCache.get(organizationId, newOwnerId)).toBeNull();
    });

    it('should prevent stale owner permissions after transfer', async () => {
      const organizationId = 1;
      const oldOwnerId = 10;
      const newOwnerId = 20;

      // Old owner has OWNER role cached
      permissionCache.set(organizationId, oldOwnerId, OrganizationRole.OWNER);

      // New owner has ADMIN role cached
      permissionCache.set(organizationId, newOwnerId, OrganizationRole.ADMIN);

      // Mock successful ownership transfer
      const mockClient = {
        query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve();

          if (sql.includes('SELECT id, owner_id FROM organizations')) {
            return Promise.resolve({
              rows: [{ id: organizationId, owner_id: oldOwnerId }],
            });
          }

          if (sql.includes('SELECT id, role FROM organization_members') &&
              params && params[1] === newOwnerId) {
            return Promise.resolve({
              rows: [{ id: 1, role: 'admin' }],
            });
          }

          if (sql.includes('UPDATE organizations')) {
            return Promise.resolve({
              rows: [{
                id: organizationId,
                name: 'Test Org',
                owner_id: newOwnerId,
              }],
            });
          }

          if (sql.includes('UPDATE organization_members')) {
            return Promise.resolve();
          }

          return Promise.resolve({ rows: [] });
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValueOnce(mockClient);

      // Transfer ownership
      await organizationService.transferOwnership(organizationId, newOwnerId, oldOwnerId);

      // SECURITY: Old owner must not retain OWNER permissions in cache
      expect(permissionCache.get(organizationId, oldOwnerId)).toBeNull();

      // SECURITY: New owner must not have stale ADMIN permissions in cache
      expect(permissionCache.get(organizationId, newOwnerId)).toBeNull();
    });

    it('should handle ownership transfer with empty cache', async () => {
      const organizationId = 1;
      const currentOwnerId = 10;
      const newOwnerId = 20;

      // Cache is empty
      expect(permissionCache.get(organizationId, currentOwnerId)).toBeNull();
      expect(permissionCache.get(organizationId, newOwnerId)).toBeNull();

      // Mock successful transfer
      const mockClient = {
        query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve();

          if (sql.includes('SELECT id, owner_id FROM organizations')) {
            return Promise.resolve({
              rows: [{ id: organizationId, owner_id: currentOwnerId }],
            });
          }

          if (sql.includes('SELECT id, role FROM organization_members')) {
            return Promise.resolve({
              rows: [{ id: 1, role: 'admin' }],
            });
          }

          if (sql.includes('UPDATE organizations')) {
            return Promise.resolve({
              rows: [{
                id: organizationId,
                name: 'Test Org',
                owner_id: newOwnerId,
              }],
            });
          }

          if (sql.includes('UPDATE organization_members')) {
            return Promise.resolve();
          }

          return Promise.resolve({ rows: [] });
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValueOnce(mockClient);

      // Transfer ownership (should not error even with empty cache)
      const result = await organizationService.transferOwnership(
        organizationId,
        newOwnerId,
        currentOwnerId
      );

      expect(result.success).toBe(true);

      // Cache should still be empty (invalidate is idempotent)
      expect(permissionCache.get(organizationId, currentOwnerId)).toBeNull();
      expect(permissionCache.get(organizationId, newOwnerId)).toBeNull();
    });
  });
});
