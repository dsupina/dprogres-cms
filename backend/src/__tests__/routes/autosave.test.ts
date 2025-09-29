/**
 * Auto-Save API Routes Integration Tests
 *
 * Tests for the autosave REST API endpoints:
 * - POST /api/content/:contentType/:contentId/autosave
 * - GET /api/content/:contentType/:contentId/autosave/latest
 * - GET /api/content/:contentType/:contentId/autosave/status
 * - DELETE /api/content/:contentType/:contentId/autosave/cleanup
 */

// Mock the database pool first to avoid hoisting issues
const mockDatabasePoolQuery = jest.fn();
const mockDatabasePoolConnect = jest.fn();
const mockDatabasePoolEnd = jest.fn();

const mockDatabasePool = {
  query: mockDatabasePoolQuery,
  connect: mockDatabasePoolConnect,
  end: mockDatabasePoolEnd,
};

jest.mock('../../utils/database', () => mockDatabasePool);

import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import autosaveRouter from '../../routes/autosave';
import { authenticateToken } from '../../middleware/auth';
import { checkContentAccess } from '../../middleware/versionAuth';
import { VersionService } from '../../services/VersionService';
import { ContentVersion } from '../../types/versioning/core';
import { ContentType, VersionType } from '../../types/versioning/enums';

jest.mock('../../services/VersionService');
jest.mock('../../middleware/auth');
jest.mock('../../middleware/versionAuth');


const mockVersionService = {
  createAutoSave: jest.fn(),
  getLatestAutoSave: jest.fn(),
  hasUnsavedChanges: jest.fn(),
  pruneOldAutoSaves: jest.fn(),
} as unknown as jest.Mocked<VersionService>;

// Mock the VersionService constructor to return our mock instance
(VersionService as jest.MockedClass<typeof VersionService>).mockImplementation(() => mockVersionService);

// Mock middleware
const mockAuthenticateToken = authenticateToken as jest.MockedFunction<typeof authenticateToken>;
const mockCheckContentAccess = checkContentAccess as jest.MockedFunction<typeof checkContentAccess>;

// Mock request with user
const mockUser = { userId: 1, role: 'admin' };

// Helper function to create a complete mock ContentVersion
// Use the extended ContentVersion from versioning.ts which includes content_hash
import { ContentVersion as ExtendedContentVersion } from '../../types/versioning';

function createMockContentVersion(overrides: Partial<ExtendedContentVersion> = {}): ExtendedContentVersion {
  return {
    id: 123,
    site_id: 1,
    locale: 'en',
    content_type: ContentType.POST,
    content_id: 1,
    version_number: 1,
    version_type: VersionType.AUTO_SAVE,
    is_current_draft: false,
    is_current_published: false,
    title: 'Test Post',
    slug: 'test-post',
    content: 'Test content',
    excerpt: 'Test excerpt',
    data: null,
    meta_data: null,
    created_by: 1,
    created_at: new Date(),
    published_at: null,
    change_summary: null,
    diff_from_previous: null,
    content_hash: 'abc123hash',
    ...overrides
  } as ExtendedContentVersion;
}

describe('Auto-Save API Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock authentication to add user to request
    mockAuthenticateToken.mockImplementation((req: any, res, next) => {
      req.user = mockUser;
      next();
      return undefined;
    });

    // Mock content access check
    mockCheckContentAccess.mockImplementation((req, res, next) => {
      next();
      return Promise.resolve();
    });

    app.use('/api', autosaveRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/content/:contentType/:contentId/autosave', () => {
    const validAutoSaveData = {
      title: 'Test Auto-save Post',
      content: 'This is auto-saved content',
      excerpt: 'Auto-save excerpt',
      slug: 'test-auto-save-post',
      data: { category_id: 1 },
      meta_data: { description: 'Test meta' }
    };

    beforeEach(() => {
      // Mock site lookup
      mockDatabasePoolQuery.mockResolvedValue({
        rows: [{ site_id: 1 }]
      });
    });

    it('should create auto-save successfully', async () => {
      const mockAutoSaveResult = {
        success: true,
        data: createMockContentVersion({
          id: 123,
          version_number: 5,
          version_type: VersionType.AUTO_SAVE,
          title: validAutoSaveData.title,
          content_hash: 'generated_hash_123'
        })
      };

      mockVersionService.createAutoSave.mockResolvedValue(mockAutoSaveResult);

      const response = await request(app)
        .post('/api/content/post/1/autosave')
        .send(validAutoSaveData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.version).toEqual(mockAutoSaveResult.data);
      expect(response.body.data.content_hash).toBeDefined();

      expect(mockVersionService.createAutoSave).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 1,
          content_type: ContentType.POST,
          content_id: 1,
          title: validAutoSaveData.title,
          content: validAutoSaveData.content,
          change_summary: 'Auto-save',
          content_hash: expect.any(String)
        }),
        mockUser.userId,
        1
      );
    });

    it('should handle no changes detected gracefully', async () => {
      mockVersionService.createAutoSave.mockResolvedValue({
        success: false,
        error: 'No changes detected - content hash matches previous version'
      });

      const response = await request(app)
        .post('/api/content/post/1/autosave')
        .send(validAutoSaveData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
      expect(response.body.message).toBe('No changes to save');
    });

    it('should return 404 when content not found', async () => {
      mockDatabasePoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/content/post/999/autosave')
        .send(validAutoSaveData)
        .expect(404);

      expect(response.body.error).toBe('post not found');
    });

    it('should handle VersionService errors', async () => {
      mockVersionService.createAutoSave.mockResolvedValue({
        success: false,
        error: 'Database connection failed'
      });

      const response = await request(app)
        .post('/api/content/post/1/autosave')
        .send(validAutoSaveData)
        .expect(400);

      expect(response.body.error).toBe('Database connection failed');
    });

    it('should handle internal server errors', async () => {
      mockDatabasePoolQuery.mockRejectedValue(new Error('Unexpected database error'));

      const response = await request(app)
        .post('/api/content/post/1/autosave')
        .send(validAutoSaveData)
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should generate content hash from request data', async () => {
      mockVersionService.createAutoSave.mockResolvedValue({
        success: true,
        data: createMockContentVersion({ id: 123 })
      });

      await request(app)
        .post('/api/content/post/1/autosave')
        .send(validAutoSaveData);

      const createCall = mockVersionService.createAutoSave.mock.calls[0];
      const inputData = createCall[0];

      expect(inputData.content_hash).toBeDefined();
      expect(typeof inputData.content_hash).toBe('string');
      expect(inputData.content_hash!.length).toBe(64); // SHA-256 hex string
    });

    it('should work with page content type', async () => {
      mockVersionService.createAutoSave.mockResolvedValue({
        success: true,
        data: createMockContentVersion({ id: 124, content_type: ContentType.PAGE })
      });

      const response = await request(app)
        .post('/api/content/page/1/autosave')
        .send(validAutoSaveData)
        .expect(200);

      expect(response.body.success).toBe(true);

      const createCall = mockVersionService.createAutoSave.mock.calls[0];
      expect(createCall[0].content_type).toBe(ContentType.PAGE);
    });

    it('should use default site_id when not found', async () => {
      mockDatabasePoolQuery.mockResolvedValue({
        rows: [{ site_id: null }]
      });

      mockVersionService.createAutoSave.mockResolvedValue({
        success: true,
        data: createMockContentVersion({ id: 125 })
      });

      await request(app)
        .post('/api/content/post/1/autosave')
        .send(validAutoSaveData);

      const createCall = mockVersionService.createAutoSave.mock.calls[0];
      expect(createCall[0].site_id).toBe(1); // Default site ID
      expect(createCall[2]).toBe(1); // Site ID parameter
    });
  });

  describe('GET /api/content/:contentType/:contentId/autosave/latest', () => {
    beforeEach(() => {
      mockDatabasePoolQuery.mockResolvedValue({
        rows: [{ site_id: 1 }]
      });
    });

    it('should retrieve latest auto-save successfully', async () => {
      const mockAutoSave = createMockContentVersion({
        id: 456,
        version_number: 7,
        version_type: VersionType.AUTO_SAVE,
        title: 'Latest Auto-save',
        content: 'Latest content',
        created_at: new Date('2023-12-01T10:00:00Z'),
        content_hash: 'latest_hash_456'
      });

      mockVersionService.getLatestAutoSave.mockResolvedValue({
        success: true,
        data: mockAutoSave
      });

      // Mock latest version check
      mockDatabasePoolQuery
        .mockResolvedValueOnce({ rows: [{ site_id: 1 }] }) // Site lookup
        .mockResolvedValueOnce({ rows: [] }); // No newer manual save

      const response = await request(app)
        .get('/api/content/post/1/autosave/latest')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.version).toEqual(mockAutoSave);
      expect(response.body.data.has_newer_manual_save).toBe(false);

      expect(mockVersionService.getLatestAutoSave).toHaveBeenCalledWith(
        'post',
        1,
        1
      );
    });

    it('should detect newer manual save', async () => {
      const autoSaveDate = new Date('2023-12-01T10:00:00Z');
      const manualSaveDate = new Date('2023-12-01T11:00:00Z');

      const mockAutoSave = createMockContentVersion({
        id: 456,
        created_at: autoSaveDate
      });

      mockVersionService.getLatestAutoSave.mockResolvedValue({
        success: true,
        data: mockAutoSave
      });

      mockDatabasePoolQuery
        .mockResolvedValueOnce({ rows: [{ site_id: 1 }] }) // Site lookup
        .mockResolvedValueOnce({ rows: [{ created_at: manualSaveDate }] }); // Newer manual save

      const response = await request(app)
        .get('/api/content/post/1/autosave/latest')
        .expect(200);

      expect(response.body.data.has_newer_manual_save).toBe(true);
    });

    it('should return null when no auto-save exists', async () => {
      mockVersionService.getLatestAutoSave.mockResolvedValue({
        success: true,
        data: null
      });

      mockDatabasePoolQuery
        .mockResolvedValueOnce({ rows: [{ site_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/content/post/1/autosave/latest')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.version).toBeNull();
      expect(response.body.data.has_newer_manual_save).toBe(false);
    });

    it('should handle VersionService errors', async () => {
      mockVersionService.getLatestAutoSave.mockResolvedValue({
        success: false,
        error: 'Database query failed'
      });

      const response = await request(app)
        .get('/api/content/post/1/autosave/latest')
        .expect(400);

      expect(response.body.error).toBe('Database query failed');
    });

    it('should return 404 for non-existent content', async () => {
      mockDatabasePoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/content/post/999/autosave/latest')
        .expect(404);

      expect(response.body.error).toBe('post not found');
    });
  });

  describe('GET /api/content/:contentType/:contentId/autosave/status', () => {
    const testContentHash = 'test_content_hash_123';

    beforeEach(() => {
      mockDatabasePoolQuery.mockResolvedValue({
        rows: [{ site_id: 1 }]
      });
    });

    it('should check unsaved changes status successfully', async () => {
      mockVersionService.hasUnsavedChanges.mockResolvedValue({
        success: true,
        data: true
      });

      mockDatabasePoolQuery
        .mockResolvedValueOnce({ rows: [{ site_id: 1 }] }) // Site lookup
        .mockResolvedValueOnce({ // Latest version info
          rows: [{ version_number: 8, created_at: new Date(), created_by: 1 }]
        });

      const response = await request(app)
        .get(`/api/content/post/1/autosave/status?content_hash=${testContentHash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.has_unsaved_changes).toBe(true);
      expect(response.body.data.latest_version_number).toBe(8);

      expect(mockVersionService.hasUnsavedChanges).toHaveBeenCalledWith(
        testContentHash,
        'post',
        1,
        1
      );
    });

    it('should return false for no unsaved changes', async () => {
      mockVersionService.hasUnsavedChanges.mockResolvedValue({
        success: true,
        data: false
      });

      mockDatabasePoolQuery
        .mockResolvedValueOnce({ rows: [{ site_id: 1 }] })
        .mockResolvedValueOnce({
          rows: [{ version_number: 5, created_at: new Date(), created_by: 1 }]
        });

      const response = await request(app)
        .get(`/api/content/post/1/autosave/status?content_hash=${testContentHash}`)
        .expect(200);

      expect(response.body.data.has_unsaved_changes).toBe(false);
    });

    it('should require content_hash parameter', async () => {
      const response = await request(app)
        .get('/api/content/post/1/autosave/status')
        .expect(400);

      expect(response.body.error).toBe('Content hash required');
    });

    it('should handle no existing versions', async () => {
      mockVersionService.hasUnsavedChanges.mockResolvedValue({
        success: true,
        data: true
      });

      mockDatabasePoolQuery
        .mockResolvedValueOnce({ rows: [{ site_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] }); // No versions exist

      const response = await request(app)
        .get(`/api/content/post/1/autosave/status?content_hash=${testContentHash}`)
        .expect(200);

      expect(response.body.data.latest_version_number).toBe(0);
    });

    it('should handle VersionService errors', async () => {
      mockVersionService.hasUnsavedChanges.mockResolvedValue({
        success: false,
        error: 'Hash comparison failed'
      });

      const response = await request(app)
        .get(`/api/content/post/1/autosave/status?content_hash=${testContentHash}`)
        .expect(400);

      expect(response.body.error).toBe('Hash comparison failed');
    });
  });

  describe('DELETE /api/content/:contentType/:contentId/autosave/cleanup', () => {
    beforeEach(() => {
      mockDatabasePoolQuery.mockResolvedValue({
        rows: [{ site_id: 1 }]
      });
    });

    it('should cleanup old auto-saves successfully', async () => {
      mockVersionService.pruneOldAutoSaves.mockResolvedValue({
        success: true,
        data: { deleted_count: 3 }
      });

      const response = await request(app)
        .delete('/api/content/post/1/autosave/cleanup')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Cleaned up 3 old auto-saves');

      expect(mockVersionService.pruneOldAutoSaves).toHaveBeenCalledWith(
        1, // siteId
        'post',
        1 // contentId
      );
    });

    it('should handle zero deletions', async () => {
      mockVersionService.pruneOldAutoSaves.mockResolvedValue({
        success: true,
        data: { deleted_count: 0 }
      });

      const response = await request(app)
        .delete('/api/content/post/1/autosave/cleanup')
        .expect(200);

      expect(response.body.message).toBe('Cleaned up 0 old auto-saves');
    });

    it('should handle missing deleted_count in response', async () => {
      mockVersionService.pruneOldAutoSaves.mockResolvedValue({
        success: true,
        data: undefined
      });

      const response = await request(app)
        .delete('/api/content/post/1/autosave/cleanup')
        .expect(200);

      expect(response.body.message).toBe('Cleaned up 0 old auto-saves');
    });

    it('should handle VersionService errors', async () => {
      mockVersionService.pruneOldAutoSaves.mockResolvedValue({
        success: false,
        error: 'Cleanup operation failed'
      });

      const response = await request(app)
        .delete('/api/content/post/1/autosave/cleanup')
        .expect(400);

      expect(response.body.error).toBe('Cleanup operation failed');
    });

    it('should return 404 for non-existent content', async () => {
      mockDatabasePoolQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/content/post/999/autosave/cleanup')
        .expect(404);

      expect(response.body.error).toBe('post not found');
    });

    it('should require content access permissions', async () => {
      // This test verifies that checkContentAccess middleware is called
      expect(mockCheckContentAccess).toBeDefined();

      // The middleware is mocked to pass, but in real scenarios it would
      // check if the user has permission to modify the content
      mockVersionService.pruneOldAutoSaves.mockResolvedValue({
        success: true,
        data: { deleted_count: 1 }
      });

      await request(app)
        .delete('/api/content/post/1/autosave/cleanup')
        .expect(200);

      // Verify middleware was called
      expect(mockCheckContentAccess).toHaveBeenCalled();
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      // Reset mock to simulate unauthenticated request
      mockAuthenticateToken.mockImplementation((req, res, next) => {
        return res.status(401).json({ error: 'Unauthorized' });
      });

      await request(app)
        .post('/api/content/post/1/autosave')
        .send({ title: 'Test' })
        .expect(401);

      await request(app)
        .get('/api/content/post/1/autosave/latest')
        .expect(401);

      await request(app)
        .get('/api/content/post/1/autosave/status?content_hash=test')
        .expect(401);

      await request(app)
        .delete('/api/content/post/1/autosave/cleanup')
        .expect(401);
    });

    it('should check content access for create and cleanup endpoints', async () => {
      mockVersionService.createAutoSave.mockResolvedValue({
        success: true,
        data: createMockContentVersion({ id: 123 })
      });

      mockVersionService.pruneOldAutoSaves.mockResolvedValue({
        success: true,
        data: { deleted_count: 1 }
      });

      // Reset to ensure middleware is called
      mockCheckContentAccess.mockClear();

      await request(app)
        .post('/api/content/post/1/autosave')
        .send({ title: 'Test', content: 'Content' });

      await request(app)
        .delete('/api/content/post/1/autosave/cleanup');

      // Content access should be checked for both endpoints
      expect(mockCheckContentAccess).toHaveBeenCalledTimes(2);
    });
  });

  describe('Content Hash Generation', () => {
    it('should generate deterministic hashes for same content', async () => {
      const sameContent = {
        title: 'Same Title',
        content: 'Same Content',
        excerpt: 'Same Excerpt',
        data: { key: 'value' }
      };

      mockVersionService.createAutoSave.mockResolvedValue({
        success: true,
        data: createMockContentVersion({ id: 123 })
      });

      // Make two identical requests
      await request(app)
        .post('/api/content/post/1/autosave')
        .send(sameContent);

      await request(app)
        .post('/api/content/post/1/autosave')
        .send(sameContent);

      const call1 = mockVersionService.createAutoSave.mock.calls[0];
      const call2 = mockVersionService.createAutoSave.mock.calls[1];

      expect(call1[0].content_hash).toBe(call2[0].content_hash);
    });

    it('should generate different hashes for different content', async () => {
      const content1 = { title: 'Title 1', content: 'Content 1' };
      const content2 = { title: 'Title 2', content: 'Content 2' };

      mockVersionService.createAutoSave.mockResolvedValue({
        success: true,
        data: createMockContentVersion({ id: 123 })
      });

      await request(app)
        .post('/api/content/post/1/autosave')
        .send(content1);

      await request(app)
        .post('/api/content/post/1/autosave')
        .send(content2);

      const call1 = mockVersionService.createAutoSave.mock.calls[0];
      const call2 = mockVersionService.createAutoSave.mock.calls[1];

      expect(call1[0].content_hash).not.toBe(call2[0].content_hash);
    });
  });
});