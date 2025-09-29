import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../utils/database';
import versionsRouter from '../routes/versions_simple';
import { authenticateToken } from '../middleware/auth';

// Mock the database pool
jest.mock('../utils/database');

// Mock VersionService
jest.mock('../services/VersionService', () => {
  return jest.fn().mockImplementation(() => ({
    createVersion: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        siteId: 1,
        contentType: 'post',
        contentId: 1,
        title: 'Test Version',
        content: 'Test content',
        versionType: 'draft',
        versionNumber: 1,
        createdBy: 1,
        createdAt: new Date('2025-01-01')
      }
    }),
    getVersion: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        siteId: 1,
        contentType: 'post',
        contentId: 1,
        title: 'Test Version',
        content: 'Test content',
        versionType: 'draft',
        versionNumber: 1,
        createdBy: 1,
        createdAt: new Date('2025-01-01')
      }
    }),
    getVersionHistory: jest.fn().mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 1,
            title: 'Version 1',
            versionType: 'published',
            createdAt: new Date('2025-01-01')
          },
          {
            id: 2,
            title: 'Version 2',
            versionType: 'draft',
            createdAt: new Date('2025-01-02')
          }
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1
      }
    }),
    updateVersion: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        title: 'Updated Version',
        content: 'Updated content',
        versionType: 'draft'
      }
    }),
    publishVersion: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        versionType: 'published',
        publishedAt: new Date('2025-01-01')
      }
    }),
    revertToVersion: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 3,
        title: 'Reverted Version',
        versionType: 'draft'
      }
    }),
    deleteVersion: jest.fn().mockResolvedValue({
      success: true
    }),
    getLatestDraft: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 2,
        title: 'Latest Draft',
        versionType: 'draft'
      }
    }),
    getPublishedVersion: jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        title: 'Published Version',
        versionType: 'published'
      }
    }),
    compareVersions: jest.fn().mockResolvedValue({
      success: true,
      data: {
        version1: { id: 1, title: 'Version 1' },
        version2: { id: 2, title: 'Version 2' },
        changes: [
          { field: 'title', oldValue: 'Version 1', newValue: 'Version 2' }
        ]
      }
    })
  }));
});

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', versionsRouter);
  return app;
};

// Generate test JWT token
const generateTestToken = (userId = 1, role = 'author') => {
  return jwt.sign(
    { id: userId, email: 'test@example.com', role },
    process.env.JWT_SECRET || 'test-secret'
  );
};

describe('Version API Endpoints', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();

    // Mock database queries
    (pool.query as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT site_id FROM posts')) {
        return { rows: [{ site_id: 1 }] };
      }
      if (query.includes('SELECT site_id FROM pages')) {
        return { rows: [{ site_id: 1 }] };
      }
      if (query.includes('SELECT created_by, version_type')) {
        return { rows: [{ created_by: 1, version_type: 'draft' }] };
      }
      if (query.includes('SELECT author_id')) {
        return { rows: [{ author_id: 1 }] };
      }
      return { rows: [] };
    });
  });

  describe('GET /api/content/:contentType/:contentId/versions', () => {
    it('should list versions for a content item', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .get('/api/content/post/1/versions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/content/post/1/versions');

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent content', async () => {
      const token = generateTestToken();
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/content/post/999/versions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/content/:contentType/:contentId/versions', () => {
    it('should create a new version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/content/post/1/versions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'New Version',
          content: 'New content',
          version_type: 'draft'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Test Version');
    });

    it('should validate required fields', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/content/post/1/versions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Missing title'
        });

      expect(response.status).toBe(400);
    });

    it('should check content ownership for authors', async () => {
      const token = generateTestToken(2, 'author'); // Different user
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT site_id')) {
          return { rows: [{ site_id: 1 }] };
        }
        if (query.includes('SELECT author_id')) {
          return { rows: [{ author_id: 1 }] }; // Different owner
        }
        return { rows: [] };
      });

      const response = await request(app)
        .post('/api/content/post/1/versions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'New Version',
          content: 'New content'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/versions/:versionId', () => {
    it('should get a specific version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .get('/api/versions/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(1);
    });

    it('should check version access', async () => {
      const token = generateTestToken(2, 'author');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ created_by: 1, version_type: 'draft' }]
      });

      const response = await request(app)
        .get('/api/versions/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200); // GET is allowed for all authenticated users
    });
  });

  describe('PUT /api/versions/:versionId', () => {
    it('should update a draft version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .put('/api/versions/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Title'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should prevent updating published versions', async () => {
      const token = generateTestToken();
      const VersionService = require('../services/VersionService');
      const mockService = new VersionService();
      mockService.getVersion.mockResolvedValueOnce({
        success: true,
        data: { versionType: 'published' }
      });

      const response = await request(app)
        .put('/api/versions/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Title'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/versions/:versionId/publish', () => {
    it('should publish a version', async () => {
      const token = generateTestToken(1, 'editor'); // Editor can publish

      const response = await request(app)
        .post('/api/versions/1/publish')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('published successfully');
    });

    it('should require publish permission', async () => {
      const token = generateTestToken(1, 'author'); // Author cannot publish

      const response = await request(app)
        .post('/api/versions/1/publish')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('permission to publish');
    });
  });

  describe('POST /api/versions/:versionId/revert', () => {
    it('should create new draft from version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/versions/1/revert')
        .set('Authorization', `Bearer ${token}`)
        .send({
          change_summary: 'Reverting to previous version'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('created new draft');
    });
  });

  describe('DELETE /api/versions/:versionId', () => {
    it('should delete a version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .delete('/api/versions/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
    });
  });

  describe('GET /api/content/:contentType/:contentId/versions/latest', () => {
    it('should get latest draft version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .get('/api/content/post/1/versions/latest?type=draft')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Latest Draft');
    });

    it('should get published version', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .get('/api/content/post/1/versions/latest?type=published')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Published Version');
    });
  });

  describe('GET /api/versions/:versionId/diff', () => {
    it('should compare two versions', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .get('/api/versions/1/diff?compareWith=2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.changes).toHaveLength(1);
    });

    it('should validate versions belong to same content', async () => {
      const token = generateTestToken();
      const VersionService = require('../services/VersionService');
      const mockService = new VersionService();
      mockService.getVersion
        .mockResolvedValueOnce({
          success: true,
          data: { contentId: 1, contentType: 'post' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: { contentId: 2, contentType: 'post' } // Different content
        });

      const response = await request(app)
        .get('/api/versions/1/diff?compareWith=3')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('same content');
    });
  });
});