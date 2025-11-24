/**
 * SF-010 Quota Enforcement Integration Tests
 *
 * Tests the full integration of quota enforcement middleware on protected routes
 */

import request from 'supertest';
import express, { Express } from 'express';
import sitesRouter from '../../routes/sites';
import postsRouter from '../../routes/posts';
import mediaRouter from '../../routes/media';

// Mock dependencies
jest.mock('../../middleware/auth');
jest.mock('../../utils/database');
jest.mock('../../services/QuotaService');
jest.mock('../../services/siteService');
jest.mock('../../utils/subscriptionCache');
jest.mock('multer', () => {
  const multer = () => ({
    single: () => (req: any, res: any, next: any) => {
      req.file = {
        filename: 'test-file.jpg',
        originalname: 'test.jpg',
        size: 1024,
        mimetype: 'image/jpeg',
      };
      next();
    },
    array: () => (req: any, res: any, next: any) => {
      req.files = [
        {
          filename: 'test-file-1.jpg',
          originalname: 'test1.jpg',
          size: 1024,
          mimetype: 'image/jpeg',
        },
      ];
      next();
    },
  });
  multer.diskStorage = jest.fn();
  return multer;
});

import { authenticateToken, requireAuthor, requireAdmin } from '../../middleware/auth';
import { pool, query } from '../../utils/database';
import { quotaService } from '../../services/QuotaService';
import { subscriptionCache } from '../../utils/subscriptionCache';
import { siteService } from '../../services/siteService';

const mockAuth = authenticateToken as jest.MockedFunction<typeof authenticateToken>;
const mockRequireAuthor = requireAuthor as jest.MockedFunction<typeof requireAuthor>;
const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockPool = pool as jest.Mocked<typeof pool>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQuotaService = quotaService as jest.Mocked<typeof quotaService>;
const mockSubscriptionCache = subscriptionCache as jest.Mocked<typeof subscriptionCache>;
const mockSiteService = siteService as jest.Mocked<typeof siteService>;

describe('SF-010 Quota Enforcement Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock authentication - pass through with organizationId
    mockAuth.mockImplementation((req: any, res: any, next: any) => {
      req.user = {
        userId: 1,
        email: 'test@example.com',
        role: 'admin',
        organizationId: 1,
      };
      next();
      return undefined as any;
    });

    mockRequireAuthor.mockImplementation((req: any, res: any, next: any) => {
      next();
      return undefined as any;
    });

    mockRequireAdmin.mockImplementation((req: any, res: any, next: any) => {
      next();
      return undefined as any;
    });

    // Default: cache miss, subscription lookup returns pro tier
    mockSubscriptionCache.getTier = jest.fn().mockReturnValue(null);
    mockSubscriptionCache.setTier = jest.fn();
    mockSubscriptionCache.invalidateTier = jest.fn();

    mockPool.query = jest.fn().mockResolvedValue({
      rows: [{ plan_tier: 'pro', status: 'active' }],
    });

    // Mount routes
    app.use('/api/sites', sitesRouter);
    app.use('/api/posts', postsRouter);
    app.use('/api/media', mediaRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/sites - Site creation with quota', () => {
    it('should allow site creation when quota is not exceeded', async () => {
      // Mock quota service - allow creation
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 3,
          limit: 10,
          remaining: 7,
          percentage_used: 30,
        },
      });

      // Mock quota increment (P2 fix)
      mockQuotaService.incrementQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          current: 4,
          limit: 10,
          remaining: 6,
        },
      });

      // Mock site service - successful creation
      mockSiteService.createSite = jest.fn().mockResolvedValue({
        id: 1,
        domain_id: 1,
        name: 'Test Site',
        base_path: '/',
      });

      const response = await request(app)
        .post('/api/sites')
        .send({
          domain_id: 1,
          name: 'Test Site',
          base_path: '/',
        });

      expect(response.status).toBe(201);
      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'sites',
        amount: 1,
      });
      expect(mockSiteService.createSite).toHaveBeenCalled();
    });

    it('should reject site creation when quota is exceeded', async () => {
      // Mock quota service - quota exceeded
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 10,
          limit: 10,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const response = await request(app)
        .post('/api/sites')
        .send({
          domain_id: 1,
          name: 'Test Site',
          base_path: '/',
        });

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Quota exceeded for sites',
        tier: 'pro',
        upgradeUrl: expect.any(String),
      });
      expect(mockSiteService.createSite).not.toHaveBeenCalled();
    });

    it('should bypass quota check for enterprise tier', async () => {
      // Mock enterprise tier
      mockPool.query = jest.fn().mockResolvedValue({
        rows: [{ plan_tier: 'enterprise', status: 'active' }],
      });

      // Mock quota increment (P2 fix) - enterprise still needs this
      mockQuotaService.incrementQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          current: 100,
          limit: 999999,
          remaining: 999899,
        },
      });

      // Mock successful site creation
      mockSiteService.createSite = jest.fn().mockResolvedValue({
        id: 1,
        domain_id: 1,
        name: 'Enterprise Site',
        base_path: '/',
      });

      const response = await request(app)
        .post('/api/sites')
        .send({
          domain_id: 1,
          name: 'Enterprise Site',
          base_path: '/',
        });

      expect(response.status).toBe(201);
      expect(mockQuotaService.checkQuota).not.toHaveBeenCalled();
      expect(mockSiteService.createSite).toHaveBeenCalled();
    });
  });

  describe('POST /api/posts - Post creation with quota', () => {
    beforeEach(() => {
      // Mock database queries for posts
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT slug FROM posts')) {
          return Promise.resolve({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });
        }
        if (sql.includes('INSERT INTO posts')) {
          return Promise.resolve({
            rows: [{
              id: 1,
              title: 'Test Post',
              slug: 'test-post',
              status: 'draft',
            }],
            command: 'INSERT',
            rowCount: 1,
            oid: 0,
            fields: [],
          });
        }
        return Promise.resolve({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });
      });
    });

    it('should allow post creation when quota is not exceeded', async () => {
      // Mock quota service - allow creation
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 50,
          limit: 100,
          remaining: 50,
          percentage_used: 50,
        },
      });

      // Mock quota increment (P2 fix)
      mockQuotaService.incrementQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          current: 51,
          limit: 100,
          remaining: 49,
        },
      });

      const response = await request(app)
        .post('/api/posts')
        .send({
          title: 'Test Post',
          content: 'Test content',
          excerpt: 'Test excerpt',
          status: 'draft',
        });

      expect(response.status).toBe(201);
      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'posts',
        amount: 1,
      });
    });

    it('should reject post creation when quota is exceeded', async () => {
      // Mock quota service - quota exceeded
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 100,
          limit: 100,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const response = await request(app)
        .post('/api/posts')
        .send({
          title: 'Test Post',
          content: 'Test content',
          excerpt: 'Test excerpt',
          status: 'draft',
        });

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Quota exceeded for posts',
        quota: {
          dimension: 'posts',
          current: 100,
          limit: 100,
        },
      });
    });
  });

  describe('POST /api/media/upload - Media upload with quota', () => {
    beforeEach(() => {
      // Mock database queries for media
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO media_files')) {
          return Promise.resolve({
            rows: [{
              id: 1,
              filename: 'test-file.jpg',
              file_size: 1024,
            }],
            command: 'INSERT',
            rowCount: 1,
            oid: 0,
            fields: [],
          });
        }
        return Promise.resolve({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });
      });
    });

    it('should allow media upload when quota is not exceeded', async () => {
      // Mock quota service - allow upload
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 1048576, // 1MB
          limit: 10485760, // 10MB
          remaining: 9437184,
          percentage_used: 10,
        },
      });

      // Mock quota increment (P2 fix)
      mockQuotaService.incrementQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          current: 1049600, // 1MB + 1024 bytes
          limit: 10485760,
          remaining: 9436160,
        },
      });

      const response = await request(app)
        .post('/api/media/upload')
        .attach('file', Buffer.from('test'), 'test.jpg');

      expect(response.status).toBe(201);
      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'storage_bytes',
        amount: 1844, // Estimated size: 1024 * 1.8 (includes derivatives)
      });
    });

    it('should reject media upload when quota is exceeded', async () => {
      // Mock quota service - quota exceeded
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 10485760, // 10MB
          limit: 10485760,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const response = await request(app)
        .post('/api/media/upload')
        .attach('file', Buffer.from('test'), 'test.jpg');

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Storage quota exceeded',
        quota: {
          dimension: 'storage_bytes',
          uploadSize: 1844, // Estimated size: 1024 * 1.8 (includes derivatives)
        },
      });
    });

    it('should check quota with actual file size from multer', async () => {
      // Note: The multer mock returns a fixed size of 1024 bytes
      // In a real scenario, multer would return the actual buffer size

      // Mock quota service - quota exceeded
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 8 * 1024 * 1024, // Already used 8MB
          limit: 10 * 1024 * 1024, // 10MB limit
          remaining: 2 * 1024 * 1024, // Only 2MB remaining
          percentage_used: 80,
        },
      });

      const response = await request(app)
        .post('/api/media/upload')
        .attach('file', Buffer.from('test'), 'test-file.jpg');

      expect(response.status).toBe(402);
      // Verify quota was checked with ESTIMATED file size (1024 * 1.8 for images)
      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'storage_bytes',
        amount: 1844, // Estimated size: 1024 * 1.8 (includes derivatives)
      });
    });
  });

  describe('POST /api/media/upload-multiple - Multiple file upload with quota', () => {
    beforeEach(() => {
      // Mock database queries for media
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO media_files')) {
          return Promise.resolve({
            rows: [{
              id: 1,
              filename: 'test-file-1.jpg',
              file_size: 1024,
            }],
            command: 'INSERT',
            rowCount: 1,
            oid: 0,
            fields: [],
          });
        }
        return Promise.resolve({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });
      });
    });

    it('should allow multiple file upload when quota is not exceeded', async () => {
      // Mock quota service - allow upload
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 2097152, // 2MB
          limit: 10485760, // 10MB
          remaining: 8388608,
          percentage_used: 20,
        },
      });

      // Mock quota increment (P2 fix)
      mockQuotaService.incrementQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          current: 2098176, // 2MB + 1024 bytes
          limit: 10485760,
          remaining: 8387584,
        },
      });

      const response = await request(app)
        .post('/api/media/upload-multiple')
        .attach('files', Buffer.from('test1'), 'test1.jpg')
        .attach('files', Buffer.from('test2'), 'test2.jpg');

      expect(response.status).toBe(201);
      expect(mockQuotaService.checkQuota).toHaveBeenCalledWith({
        organizationId: 1,
        dimension: 'storage_bytes',
        amount: 1844, // Estimated size: 1024 * 1.8 (includes derivatives)
      });
    });

    it('should reject multiple file upload when quota is exceeded', async () => {
      // Mock quota service - quota exceeded
      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current: 10485760,
          limit: 10485760,
          remaining: 0,
          percentage_used: 100,
        },
      });

      const response = await request(app)
        .post('/api/media/upload-multiple')
        .attach('files', Buffer.from('test1'), 'test1.jpg');

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Storage quota exceeded',
      });
    });
  });

  describe('Subscription tier caching', () => {
    it('should use cached subscription tier on subsequent requests', async () => {
      // First request - cache miss
      mockSubscriptionCache.getTier = jest.fn()
        .mockReturnValueOnce(null) // First call: cache miss
        .mockReturnValueOnce({ planTier: 'pro', status: 'active' }); // Second call: cache hit

      mockQuotaService.checkQuota = jest.fn().mockResolvedValue({
        success: true,
        data: {
          allowed: true,
          current: 3,
          limit: 10,
          remaining: 7,
          percentage_used: 30,
        },
      });

      mockSiteService.createSite = jest.fn().mockResolvedValue({
        id: 1,
        domain_id: 1,
        name: 'Test Site 1',
        base_path: '/',
      });

      // First request
      await request(app)
        .post('/api/sites')
        .send({
          domain_id: 1,
          name: 'Test Site 1',
          base_path: '/',
        });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionCache.setTier).toHaveBeenCalledWith(1, {
        planTier: 'pro',
        status: 'active',
      });

      // Second request - should use cache
      mockSiteService.createSite = jest.fn().mockResolvedValue({
        id: 2,
        domain_id: 1,
        name: 'Test Site 2',
        base_path: '/site2',
      });

      await request(app)
        .post('/api/sites')
        .send({
          domain_id: 1,
          name: 'Test Site 2',
          base_path: '/site2',
        });

      // Database query should still be 1 (from first request only)
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Missing organizationId handling', () => {
    it('should reject request when organizationId is missing', async () => {
      // Mock auth to not include organizationId
      mockAuth.mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          userId: 1,
          email: 'test@example.com',
          role: 'admin',
          // organizationId missing
        };
        next();
        return undefined as any;
      });

      mockSiteService.createSite = jest.fn();

      const response = await request(app)
        .post('/api/sites')
        .send({
          domain_id: 1,
          name: 'Test Site',
          base_path: '/',
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Organization ID is required for quota enforcement',
      });
      expect(mockSiteService.createSite).not.toHaveBeenCalled();
    });
  });
});
