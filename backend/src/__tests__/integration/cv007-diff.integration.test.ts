/**
 * CV-007 Diff Service Integration Tests
 *
 * Tests the full integration of version comparison and diff functionality
 */

import request from 'supertest';
import express, { Express } from 'express';
import { Pool } from 'pg';
import { createVersionRoutes } from '../../routes/versions';
import { authenticateToken } from '../../middleware/auth';

// Mock dependencies
jest.mock('../../middleware/auth');
jest.mock('pg');

describe('CV-007 Version Comparison Integration Tests', () => {
  let app: Express;
  let mockPool: any;
  const mockAuth = authenticateToken as jest.MockedFunction<typeof authenticateToken>;

  beforeEach(() => {
    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock authentication
    mockAuth.mockImplementation((req: any, res: any, next: any) => {
      req.user = { id: 1, email: 'test@example.com' };
      next();
      return undefined as any;
    });

    // Setup mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn()
    };

    // Create routes with mock pool
    const versionRoutes = createVersionRoutes(mockPool);
    app.use('/api/versions', versionRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/versions/compare', () => {
    it('should compare two versions successfully', async () => {
      // Mock database responses
      const mockVersion1 = {
        id: 1,
        site_id: 1,
        content_type: 'post',
        content_id: 1,
        version_number: 1,
        version_type: 'published',
        is_current_published: true,
        is_current_draft: false,
        title: 'Original Title',
        content: '<p>Original content</p>',
        created_at: new Date('2024-01-01'),
        created_by: 1
      };

      const mockVersion2 = {
        id: 2,
        site_id: 1,
        content_type: 'post',
        content_id: 1,
        version_number: 2,
        version_type: 'draft',
        is_current_published: false,
        is_current_draft: true,
        title: 'Updated Title',
        content: '<p>Updated content with changes</p>',
        created_at: new Date('2024-01-02'),
        created_by: 1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] }) // Fetch version 1
        .mockResolvedValueOnce({ rows: [mockVersion2] }) // Fetch version 2
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Validate user access
        .mockResolvedValueOnce({ rows: [] }); // Log diff operation

      const response = await request(app)
        .get('/api/versions/compare')
        .query({
          version_a_id: 1,
          version_b_id: 2
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.leftVersion.id).toBe(1);
      expect(response.body.data.rightVersion.id).toBe(2);
      expect(response.body.data.textDiff).toBeDefined();
      expect(response.body.data.statistics).toBeDefined();
      expect(response.body.data.statistics.totalChanges).toBeGreaterThan(0);
    });

    it('should enforce site isolation', async () => {
      const version1 = { ...{ id: 1, site_id: 1 } };
      const version2 = { ...{ id: 2, site_id: 999 } }; // Different site

      mockPool.query
        .mockResolvedValueOnce({ rows: [version1] })
        .mockResolvedValueOnce({ rows: [version2] });

      const response = await request(app)
        .get('/api/versions/compare')
        .query({
          version_a_id: 1,
          version_b_id: 2
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('site isolation');
    });

    it('should validate user access', async () => {
      const mockVersion = { id: 1, site_id: 1 };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion] })
        .mockResolvedValueOnce({ rows: [mockVersion] })
        .mockResolvedValueOnce({ rows: [] }); // No access

      const response = await request(app)
        .get('/api/versions/compare')
        .query({
          version_a_id: 1,
          version_b_id: 2
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Access denied');
    });
  });

  describe('GET /api/versions/:id1/diff/:id2', () => {
    it('should get diff between two versions', async () => {
      const mockVersion1 = {
        id: 1,
        site_id: 1,
        content_type: 'post',
        title: 'Version 1',
        content: 'Line 1\nLine 2\nLine 3',
        created_at: new Date()
      };

      const mockVersion2 = {
        id: 2,
        site_id: 1,
        content_type: 'post',
        title: 'Version 2',
        content: 'Line 1\nModified Line 2\nLine 3\nLine 4',
        created_at: new Date()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] })
        .mockResolvedValueOnce({ rows: [mockVersion2] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/versions/1/diff/2')
        .query({ format: 'json' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.textDiff.linesAdded).toBeGreaterThanOrEqual(0);
      expect(response.body.data.textDiff.linesRemoved).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /api/versions/diff/export', () => {
    it('should export diff as JSON', async () => {
      const mockVersion1 = {
        id: 1,
        site_id: 1,
        content_type: 'page',
        title: 'Page v1',
        content: '<h1>Original</h1>',
        created_at: new Date()
      };

      const mockVersion2 = {
        id: 2,
        site_id: 1,
        content_type: 'page',
        title: 'Page v2',
        content: '<h1>Updated</h1><p>New paragraph</p>',
        created_at: new Date()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] })
        .mockResolvedValueOnce({ rows: [mockVersion2] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/versions/diff/export')
        .send({
          version_ids: [1, 2],
          format: 'json',
          include_metadata: true,
          include_statistics: true
        })
        .expect(200);

      // Response should be JSON export
      const exportData = JSON.parse(response.text);
      expect(exportData.leftVersion).toBeDefined();
      expect(exportData.rightVersion).toBeDefined();
      expect(exportData.changes).toBeDefined();
      expect(exportData.statistics).toBeDefined();
    });

    it('should export diff as HTML', async () => {
      const mockVersion1 = {
        id: 1,
        site_id: 1,
        title: 'Test',
        content: 'Original',
        created_at: new Date()
      };

      const mockVersion2 = {
        id: 2,
        site_id: 1,
        title: 'Test Updated',
        content: 'Modified',
        created_at: new Date()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] })
        .mockResolvedValueOnce({ rows: [mockVersion2] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/versions/diff/export')
        .send({
          version_ids: [1, 2],
          format: 'html',
          include_metadata: true
        })
        .expect(200);

      // Response should be HTML
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Version Comparison');
      expect(response.headers['content-type']).toContain('text/html');
    });
  });

  describe('GET /api/versions/:id/changes-summary', () => {
    it('should get changes summary for a version', async () => {
      const targetVersion = {
        id: 2,
        site_id: 1,
        content_type: 'post',
        content_id: 1,
        version_number: 2,
        title: 'Current Version',
        content: 'Updated content'
      };

      const previousVersion = {
        id: 1,
        site_id: 1,
        content_type: 'post',
        content_id: 1,
        version_number: 1,
        title: 'Previous Version',
        content: 'Original content'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [targetVersion] }) // Fetch target version
        .mockResolvedValueOnce({ rows: [previousVersion] }) // Find previous version
        .mockResolvedValueOnce({ rows: [previousVersion] }) // Fetch for diff
        .mockResolvedValueOnce({ rows: [targetVersion] }) // Fetch for diff
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Validate access
        .mockResolvedValueOnce({ rows: [] }); // Log operation

      const response = await request(app)
        .get('/api/versions/2/changes-summary')
        .query({ compare_with: 'previous' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.version_id).toBe(2);
      expect(response.body.data.compared_with_id).toBe(1);
      expect(response.body.data.statistics).toBeDefined();
    });
  });

  describe('GET /api/versions/history/:contentType/:contentId', () => {
    it('should get version history with diff summaries', async () => {
      const versions = [
        {
          id: 3,
          site_id: 1,
          content_type: 'post',
          content_id: 1,
          version_number: 3,
          title: 'Version 3',
          content: 'Latest content',
          created_at: new Date('2024-01-03'),
          created_by: 1,
          author_email: 'user@example.com',
          author_name: 'Test User'
        },
        {
          id: 2,
          site_id: 1,
          content_type: 'post',
          content_id: 1,
          version_number: 2,
          title: 'Version 2',
          content: 'Middle content',
          created_at: new Date('2024-01-02'),
          created_by: 1,
          author_email: 'user@example.com',
          author_name: 'Test User'
        },
        {
          id: 1,
          site_id: 1,
          content_type: 'post',
          content_id: 1,
          version_number: 1,
          title: 'Version 1',
          content: 'Original content',
          created_at: new Date('2024-01-01'),
          created_by: 1,
          author_email: 'user@example.com',
          author_name: 'Test User'
        }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: versions }) // Fetch all versions
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Validate access
        // Mock diff comparisons for each version pair
        .mockResolvedValueOnce({ rows: [versions[1]] }) // v2 for diff
        .mockResolvedValueOnce({ rows: [versions[0]] }) // v3 for diff
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Access check
        .mockResolvedValueOnce({ rows: [] }) // Log
        .mockResolvedValueOnce({ rows: [versions[2]] }) // v1 for diff
        .mockResolvedValueOnce({ rows: [versions[1]] }) // v2 for diff
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Access check
        .mockResolvedValueOnce({ rows: [] }); // Log

      const response = await request(app)
        .get('/api/versions/history/post/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.versions).toHaveLength(3);
      expect(response.body.data.content_type).toBe('post');
      expect(response.body.data.content_id).toBe(1);

      // First version should have changes from previous
      expect(response.body.data.versions[0].changes_from_previous).toBeDefined();
      expect(response.body.data.versions[0].changes_from_previous.total_changes).toBeGreaterThanOrEqual(0);
    });

    it('should return 404 when no versions found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/versions/history/post/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No versions found');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      // Remove authentication mock
      mockAuth.mockImplementation((req: any, res: any) => {
        res.status(401).json({ error: 'Unauthorized' });
        return res as any;
      });

      await request(app)
        .get('/api/versions/compare')
        .query({ version_a_id: 1, version_b_id: 2 })
        .expect(401);

      await request(app)
        .get('/api/versions/1/diff/2')
        .expect(401);

      await request(app)
        .post('/api/versions/diff/export')
        .send({ version_ids: [1, 2], format: 'json' })
        .expect(401);

      await request(app)
        .get('/api/versions/1/changes-summary')
        .expect(401);

      await request(app)
        .get('/api/versions/history/post/1')
        .expect(401);
    });
  });
});