import { Request, Response, NextFunction } from 'express';
import { siteResolver, requireSiteContext, clearSiteCache } from '../../middleware/siteResolver';
import { pool } from '../../utils/database';
import { domainCache } from '../../services/domainService';

jest.mock('../../utils/database');
jest.mock('../../services/domainService');

describe('Site Resolver Middleware', () => {
  let mockReq: any;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      get: jest.fn(),
      path: '/test',
      siteContext: undefined,
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    clearSiteCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('siteResolver', () => {
    it('should skip resolution for auth routes', async () => {
      mockReq.path = '/api/auth/login';

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.siteContext).toBeUndefined();
    });

    it('should skip resolution for health check', async () => {
      mockReq.path = '/api/health';

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.siteContext).toBeUndefined();
    });

    it('should resolve site for known domain with root path', async () => {
      const mockDomain = { id: 1, hostname: 'example.com' };
      const mockSite = { id: 1, name: 'Example Site', base_path: '/', is_default: true };

      (mockReq.get as jest.Mock).mockReturnValue('example.com');
      mockReq.path = '/';
      (domainCache.get as jest.Mock).mockResolvedValue(mockDomain);
      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockSite] });

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(domainCache.get).toHaveBeenCalledWith('example.com');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, base_path'),
        [1, '/']
      );
      expect(mockReq.siteContext).toEqual({
        domainId: 1,
        siteId: 1,
        siteName: 'Example Site',
        basePath: '/'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should resolve site with base path', async () => {
      const mockDomain = { id: 1, hostname: 'example.com' };
      const mockSite = { id: 2, name: 'Blog Site', base_path: '/blog', is_default: false };

      (mockReq.get as jest.Mock).mockReturnValue('example.com');
      mockReq.path = '/blog/posts';
      (domainCache.get as jest.Mock).mockResolvedValue(mockDomain);
      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockSite] });

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, base_path'),
        [1, '/blog']
      );
      expect(mockReq.siteContext).toEqual({
        domainId: 1,
        siteId: 2,
        siteName: 'Blog Site',
        basePath: '/blog'
      });
    });

    it('should fall back to default site if specific path not found', async () => {
      const mockDomain = { id: 1, hostname: 'example.com' };
      const mockDefaultSite = { id: 1, name: 'Default Site', base_path: '/', is_default: true };

      (mockReq.get as jest.Mock).mockReturnValue('example.com');
      mockReq.path = '/unknown/path';
      (domainCache.get as jest.Mock).mockResolvedValue(mockDomain);
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // No site for /unknown
        .mockResolvedValueOnce({ rows: [] }) // No site for /
        .mockResolvedValueOnce({ rows: [mockDefaultSite] }); // Default site

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(mockReq.siteContext).toEqual({
        domainId: 1,
        siteId: 1,
        siteName: 'Default Site',
        basePath: '/'
      });
    });

    it('should handle unknown domain', async () => {
      (mockReq.get as jest.Mock).mockReturnValue('unknown.com');
      mockReq.path = '/';
      (domainCache.get as jest.Mock).mockResolvedValue(null);

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.siteContext).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use cache for repeated requests', async () => {
      const mockDomain = { id: 1, hostname: 'example.com' };
      const mockSite = { id: 1, name: 'Example Site', base_path: '/', is_default: true };

      (mockReq.get as jest.Mock).mockReturnValue('example.com');
      mockReq.path = '/';
      (domainCache.get as jest.Mock).mockResolvedValue(mockDomain);
      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockSite] });

      // First request
      await siteResolver(mockReq as Request, mockRes as Response, mockNext);
      expect(pool.query).toHaveBeenCalledTimes(1);

      // Second request - should use cache
      await siteResolver(mockReq as Request, mockRes as Response, mockNext);
      expect(pool.query).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should handle missing host header', async () => {
      (mockReq.get as jest.Mock).mockReturnValue(undefined);

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.siteContext).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (mockReq.get as jest.Mock).mockReturnValue('example.com');
      mockReq.path = '/';
      (domainCache.get as jest.Mock).mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await siteResolver(mockReq as Request, mockRes as Response, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in site resolver middleware:',
        expect.any(Error)
      );
      expect(mockNext).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('requireSiteContext', () => {
    it('should pass through if site context exists', () => {
      mockReq.siteContext = {
        domainId: 1,
        siteId: 1,
        siteName: 'Test Site',
        basePath: '/'
      };

      requireSiteContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 404 if site context is missing', () => {
      mockReq.siteContext = undefined;

      requireSiteContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site not found for this domain'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 404 if site ID is null', () => {
      mockReq.siteContext = {
        domainId: 1,
        siteId: null,
        siteName: 'Domain Only',
        basePath: '/'
      };

      requireSiteContext(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});