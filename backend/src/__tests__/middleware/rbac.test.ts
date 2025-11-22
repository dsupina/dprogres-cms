import { Request, Response, NextFunction } from 'express';
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  checkPermission,
  permissionCache,
} from '../../middleware/rbac';
import { Permission, OrganizationRole } from '../../config/permissions';
import { organizationService } from '../../services/OrganizationService';

// Mock OrganizationService
jest.mock('../../services/OrganizationService', () => ({
  organizationService: {
    getMemberRole: jest.fn(),
  },
}));

describe('RBAC Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    // Clear cache before each test
    permissionCache.clear();

    // Reset mocks
    jest.clearAllMocks();

    // Setup mock request
    mockRequest = {
      user: {
        userId: 1,
        email: 'test@example.com',
        role: 'user',
      },
      params: {},
      body: {},
    };

    // Setup mock response
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    // Setup next function
    nextFunction = jest.fn();
  });

  describe('checkPermission', () => {
    it('should return true when user has permission', async () => {
      // Mock OrganizationService to return ADMIN role
      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.ADMIN,
      });

      const result = await checkPermission(1, 1, Permission.MANAGE_MEMBERS);

      expect(result).toBe(true);
      expect(organizationService.getMemberRole).toHaveBeenCalledWith(1, 1);
    });

    it('should return false when user does not have permission', async () => {
      // Mock OrganizationService to return VIEWER role
      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.VIEWER,
      });

      const result = await checkPermission(1, 1, Permission.MANAGE_MEMBERS);

      expect(result).toBe(false);
    });

    it('should return false when user is not a member', async () => {
      // Mock OrganizationService to return no membership
      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: false,
        error: 'User is not a member of this organization',
      });

      const result = await checkPermission(1, 1, Permission.VIEW_POSTS);

      expect(result).toBe(false);
    });

    it('should use cached role on subsequent calls', async () => {
      // First call - should query database
      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.EDITOR,
      });

      const result1 = await checkPermission(1, 1, Permission.EDIT_POSTS);
      expect(result1).toBe(true);
      expect(organizationService.getMemberRole).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await checkPermission(1, 1, Permission.CREATE_POSTS);
      expect(result2).toBe(true);
      expect(organizationService.getMemberRole).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should handle database errors gracefully', async () => {
      (organizationService.getMemberRole as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await checkPermission(1, 1, Permission.VIEW_POSTS);

      expect(result).toBe(false);
    });

    it('should log warning when permission check exceeds 20ms', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock slow database query (simulate with delay)
      (organizationService.getMemberRole as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  data: OrganizationRole.ADMIN,
                }),
              25
            );
          })
      );

      await checkPermission(1, 1, Permission.MANAGE_MEMBERS);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RBAC] Slow permission check')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('requirePermission middleware', () => {
    it('should call next() when user has permission', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.ADMIN,
      });

      const middleware = requirePermission(Permission.MANAGE_MEMBERS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.organizationId).toBe(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      const middleware = requirePermission(Permission.VIEW_POSTS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 400 when organizationId is missing', async () => {
      // No organizationId in params, body, or req

      const middleware = requirePermission(Permission.VIEW_POSTS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Organization ID required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 400 when organizationId is invalid', async () => {
      mockRequest.params = { organizationId: 'invalid' };

      const middleware = requirePermission(Permission.VIEW_POSTS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Organization ID required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks permission', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.VIEWER,
      });

      const middleware = requirePermission(Permission.MANAGE_MEMBERS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission denied',
        required: Permission.MANAGE_MEMBERS,
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should prioritize req.organizationId over params', async () => {
      mockRequest.organizationId = 5;
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.ADMIN,
      });

      const middleware = requirePermission(Permission.MANAGE_MEMBERS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(organizationService.getMemberRole).toHaveBeenCalledWith(5, 1);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should use params.organizationId if req.organizationId is not set', async () => {
      mockRequest.params = { organizationId: '2' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.ADMIN,
      });

      const middleware = requirePermission(Permission.MANAGE_MEMBERS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(organizationService.getMemberRole).toHaveBeenCalledWith(2, 1);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should use body.organizationId as fallback', async () => {
      mockRequest.body = { organizationId: '3' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.ADMIN,
      });

      const middleware = requirePermission(Permission.MANAGE_MEMBERS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(organizationService.getMemberRole).toHaveBeenCalledWith(3, 1);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should handle database errors as permission denied', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const middleware = requirePermission(Permission.VIEW_POSTS);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Database errors in checkPermission are caught and return false,
      // which is treated as "no permission" (403), not internal error (500)
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission denied',
        required: Permission.VIEW_POSTS,
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('requireAnyPermission middleware', () => {
    it('should call next() when user has at least one permission', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.EDITOR,
      });

      const middleware = requireAnyPermission([
        Permission.MANAGE_MEMBERS, // Editor does NOT have this
        Permission.EDIT_POSTS, // Editor HAS this
      ]);

      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 403 when user has none of the permissions', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.VIEWER,
      });

      const middleware = requireAnyPermission([
        Permission.MANAGE_MEMBERS,
        Permission.EDIT_POSTS,
        Permission.CREATE_SITES,
      ]);

      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission denied',
        required_any: [
          Permission.MANAGE_MEMBERS,
          Permission.EDIT_POSTS,
          Permission.CREATE_SITES,
        ],
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      const middleware = requireAnyPermission([Permission.VIEW_POSTS, Permission.EDIT_POSTS]);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('requireAllPermissions middleware', () => {
    it('should call next() when user has all permissions', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.ADMIN,
      });

      const middleware = requireAllPermissions([
        Permission.MANAGE_MEMBERS,
        Permission.INVITE_USERS,
        Permission.CREATE_SITES,
      ]);

      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks any one permission', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.EDITOR,
      });

      const middleware = requireAllPermissions([
        Permission.EDIT_POSTS, // Editor HAS this
        Permission.CREATE_POSTS, // Editor HAS this
        Permission.MANAGE_MEMBERS, // Editor does NOT have this
      ]);

      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission denied',
        required_all: [
          Permission.EDIT_POSTS,
          Permission.CREATE_POSTS,
          Permission.MANAGE_MEMBERS,
        ],
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      const middleware = requireAllPermissions([Permission.VIEW_POSTS]);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('PermissionCache', () => {
    it('should cache role and return it on subsequent gets', () => {
      permissionCache.set(1, 1, OrganizationRole.ADMIN);

      const cachedRole = permissionCache.get(1, 1);
      expect(cachedRole).toBe(OrganizationRole.ADMIN);
    });

    it('should return null for non-existent cache entry', () => {
      const cachedRole = permissionCache.get(999, 999);
      expect(cachedRole).toBeNull();
    });

    it('should expire cache entries after TTL', () => {
      jest.useFakeTimers();

      permissionCache.set(1, 1, OrganizationRole.EDITOR);

      // Immediately after setting, should be cached
      expect(permissionCache.get(1, 1)).toBe(OrganizationRole.EDITOR);

      // Advance time by 5 minutes + 1 second (past TTL)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Should now be expired
      expect(permissionCache.get(1, 1)).toBeNull();

      jest.useRealTimers();
    });

    it('should invalidate specific user-org combination', () => {
      permissionCache.set(1, 1, OrganizationRole.ADMIN);
      permissionCache.set(1, 2, OrganizationRole.EDITOR);

      permissionCache.invalidate(1, 1);

      expect(permissionCache.get(1, 1)).toBeNull();
      expect(permissionCache.get(1, 2)).toBe(OrganizationRole.EDITOR);
    });

    it('should invalidate all cache entries for an organization', () => {
      permissionCache.set(1, 1, OrganizationRole.ADMIN);
      permissionCache.set(1, 2, OrganizationRole.EDITOR);
      permissionCache.set(2, 1, OrganizationRole.OWNER);

      permissionCache.invalidateOrganization(1);

      expect(permissionCache.get(1, 1)).toBeNull();
      expect(permissionCache.get(1, 2)).toBeNull();
      expect(permissionCache.get(2, 1)).toBe(OrganizationRole.OWNER);
    });

    it('should clear all cache entries', () => {
      permissionCache.set(1, 1, OrganizationRole.ADMIN);
      permissionCache.set(2, 2, OrganizationRole.EDITOR);

      permissionCache.clear();

      expect(permissionCache.get(1, 1)).toBeNull();
      expect(permissionCache.get(2, 2)).toBeNull();
    });

    it('should return cache stats', () => {
      permissionCache.clear();

      permissionCache.set(1, 1, OrganizationRole.ADMIN);
      permissionCache.set(1, 2, OrganizationRole.EDITOR);

      const stats = permissionCache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.ttl).toBe(5 * 60 * 1000); // 5 minutes
    });
  });

  describe('Performance', () => {
    it('should complete permission check in under 20ms (with cache)', async () => {
      // Prime the cache
      permissionCache.set(1, 1, OrganizationRole.ADMIN);

      const startTime = Date.now();
      await checkPermission(1, 1, Permission.MANAGE_MEMBERS);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(20);
    });
  });

  describe('Soft-deleted members', () => {
    it('should deny access to soft-deleted members', async () => {
      mockRequest.params = { organizationId: '1' };

      // Simulate soft-deleted member (getMemberRole returns no data)
      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: false,
        error: 'User is not a member of this organization',
      });

      const result = await checkPermission(1, 1, Permission.VIEW_POSTS);

      expect(result).toBe(false);
      expect(organizationService.getMemberRole).toHaveBeenCalledWith(1, 1);
    });

    it('should not cache roles for soft-deleted members', async () => {
      // Prime cache with ADMIN role
      permissionCache.set(1, 1, OrganizationRole.ADMIN);

      // Simulate member gets removed (soft-deleted)
      // Cache gets invalidated, next call returns no member
      permissionCache.invalidate(1, 1);

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: false,
        error: 'User is not a member of this organization',
      });

      const result = await checkPermission(1, 1, Permission.MANAGE_MEMBERS);

      expect(result).toBe(false);

      // Verify cache is still empty (not re-cached with old role)
      expect(permissionCache.get(1, 1)).toBeNull();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle OWNER with all permissions', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.OWNER,
      });

      // Test all critical permissions
      const permissions = [
        Permission.MANAGE_BILLING,
        Permission.MANAGE_ORGANIZATION,
        Permission.MANAGE_MEMBERS,
        Permission.CREATE_SITES,
        Permission.DELETE_POSTS,
      ];

      for (const permission of permissions) {
        const middleware = requirePermission(permission);
        nextFunction.mockClear();

        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalled();
      }
    });

    it('should handle PUBLISHER with limited permissions', async () => {
      mockRequest.params = { organizationId: '1' };

      (organizationService.getMemberRole as jest.Mock).mockResolvedValue({
        success: true,
        data: OrganizationRole.PUBLISHER,
      });

      // PUBLISHER can publish
      const publishMiddleware = requirePermission(Permission.PUBLISH_POSTS);
      await publishMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();

      // But cannot create posts
      nextFunction.mockClear();
      statusMock.mockClear();
      const createMiddleware = requirePermission(Permission.CREATE_POSTS);
      await createMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
});
