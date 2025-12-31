import { Request, Response, NextFunction } from 'express';
import {
  enforceOrganizationStatus,
  enforceOrganizationStatusExcept,
  organizationStatusCache,
} from '../../middleware/organizationStatus';

// Mock database utility
jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));
import { query } from '../../utils/database';
const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('Organization Status Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      params: {},
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
    // IMPORTANT: Clear cache FIRST, then clear mocks
    organizationStatusCache.clear();
    jest.clearAllMocks();
    // Reset the mock to a default implementation
    mockedQuery.mockReset();
  });

  describe('enforceOrganizationStatus', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow super admins regardless of organization status', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'superadmin@example.com',
        role: 'admin',
        organizationId: 1,
        isSuperAdmin: true,
      };

      // Even if org is suspended, super admin should pass
      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'suspended' }] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockedQuery).not.toHaveBeenCalled(); // Should bypass DB check
    });

    it('should allow access when no organization context', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'user',
        // No organizationId
      };

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('should allow access for active organizations', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'active' }] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should block access for suspended organizations', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'suspended' }] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Organization is suspended. Please contact support.',
        code: 'ORG_SUSPENDED',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should block access for pending_deletion organizations', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'pending_deletion' }] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Organization is pending deletion and access is restricted.',
        code: 'ORG_PENDING_DELETION',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should block access when organization not found', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 999,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Organization not found or has been deleted',
        code: 'ORG_NOT_FOUND',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should use organization ID from request params if not in JWT', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        // No organizationId in JWT
      };
      mockRequest.params = { organizationId: '2' };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'active' }] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockedQuery).toHaveBeenCalledWith(
        'SELECT status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [2]
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should use organization ID from request body if not in JWT or params', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
      };
      mockRequest.body = { organizationId: '3' };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'active' }] } as any);

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockedQuery).toHaveBeenCalledWith(
        'SELECT status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [3]
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should cache organization status', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'active' }] } as any);

      // First call - should query database
      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockedQuery).toHaveBeenCalledTimes(1);

      // Reset for second call
      nextFunction = jest.fn();

      // Second call - should use cache
      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Should not have made another DB call
      expect(mockedQuery).toHaveBeenCalledTimes(1);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Should treat as not found (fail closed)
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Organization not found or has been deleted',
        code: 'ORG_NOT_FOUND',
      });
    });
  });

  describe('enforceOrganizationStatusExcept', () => {
    it('should allow suspended organizations when suspended is in exception list', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'suspended' }] } as any);

      const middleware = enforceOrganizationStatusExcept(['suspended']);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should still block pending_deletion when only suspended is allowed', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'pending_deletion' }] } as any);

      const middleware = enforceOrganizationStatusExcept(['suspended']);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Organization is pending deletion and access is restricted.',
        code: 'ORG_PENDING_DELETION',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow both suspended and pending_deletion when both are in exception list', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValueOnce({ rows: [{ status: 'pending_deletion' }] } as any);

      const middleware = enforceOrganizationStatusExcept(['suspended', 'pending_deletion']);
      await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('organizationStatusCache', () => {
    it('should invalidate cache entry', async () => {
      mockRequest.user = {
        userId: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 1,
      };

      mockedQuery.mockResolvedValue({ rows: [{ status: 'active' }] } as any);

      // First call - populate cache
      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockedQuery).toHaveBeenCalledTimes(1);

      // Invalidate cache
      organizationStatusCache.invalidate(1);

      // Reset for next call
      nextFunction = jest.fn();

      // Second call - should query database again
      await enforceOrganizationStatus(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockedQuery).toHaveBeenCalledTimes(2);
    });
  });
});
