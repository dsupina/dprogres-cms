/**
 * VersionService Test Suite
 *
 * Comprehensive tests for the content versioning service
 */

import { Pool } from 'pg';
import { VersionService } from '../../services/VersionService';
import {
  ContentType,
  CreateVersionInput,
  VersionHistoryOptions,
  VersionType
} from '../../types/versioning';

// Mock the pg module
jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn(() => mClient),
    query: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('VersionService', () => {
  let service: VersionService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockPool = new Pool();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool.connect = jest.fn(() => Promise.resolve(mockClient));
    mockPool.query = jest.fn();

    service = new VersionService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createVersion', () => {
    it('should create a new version successfully', async () => {
      const input: CreateVersionInput = {
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Post',
        slug: 'test-post',
        content: 'Test content',
        excerpt: 'Test excerpt',
        data: {
          category_id: 1,
          tags: []
        },
        change_summary: 'Initial version',
        is_current_draft: true
      };

      const mockVersion = {
        id: 1,
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        title: 'Test Post',
        slug: 'test-post',
        content: 'Test content',
        excerpt: 'Test excerpt',
        is_current_draft: true,
        is_current_published: false,
        version_type: 'draft',
        created_by: 1,
        created_at: new Date()
      };

      // Mock the transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 1 }] }) // get_next_version_number with site_id
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields query
        .mockResolvedValueOnce({ rows: [mockVersion] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.createVersion(input, 1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockVersion);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const input: CreateVersionInput = {
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Post',
        slug: 'test-post'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // get_next_version_number fails

      const result = await service.createVersion(input, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should detect changed fields correctly', async () => {
      const input: CreateVersionInput = {
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Updated Title',
        slug: 'test-post',
        content: 'Updated content'
      };

      const previousVersion = {
        title: 'Original Title',
        slug: 'test-post',
        content: 'Original content'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 2 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [previousVersion] }) // detectChangedFields query
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            changed_fields: ['title', 'content']
          }]
        }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.createVersion(input, 1);

      expect(result.success).toBe(true);
      expect(result.metadata?.version_number).toBe(2);
    });
  });

  describe('getVersion', () => {
    it('should retrieve a version successfully', async () => {
      const mockVersion = {
        id: 1,
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        title: 'Test Post',
        created_by_name: 'John Doe'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion] });

      const result = await service.getVersion(1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockVersion);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT v.*, u.name as created_by_name'),
        [1]
      );
    });

    it('should return error for non-existent version', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getVersion(999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version not found');
    });
  });

  describe('getVersionHistory', () => {
    it('should retrieve version history with default options', async () => {
      const mockVersions = [
        { id: 2, version_number: 2, title: 'Version 2' },
        { id: 1, version_number: 1, title: 'Version 1' }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // COUNT query
        .mockResolvedValueOnce({ rows: mockVersions }); // SELECT query

      const result = await service.getVersionHistory(
        ContentType.POST,
        1,
        { site_id: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual(mockVersions);
      expect(result.data?.total).toBe(2);
      expect(result.data?.has_more).toBe(false);
    });

    it('should apply filters correctly', async () => {
      const options: VersionHistoryOptions = {
        site_id: 1,
        locale: 'en-US',
        version_type: VersionType.PUBLISHED,
        limit: 10,
        offset: 0,
        order_by: 'created_at',
        order_direction: 'ASC'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getVersionHistory(
        ContentType.PAGE,
        5,
        options
      );

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('version_type = $4'),
        expect.anything()
      );
    });

    it('should exclude auto-saves by default', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await service.getVersionHistory(ContentType.POST, 1, { site_id: 1 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("version_type != 'auto_save'"),
        expect.anything()
      );
    });
  });

  describe('publishVersion', () => {
    it('should publish a version successfully', async () => {
      const mockVersion = {
        id: 1,
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        title: 'Test Post',
        slug: 'test-post'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockVersion] }) // SELECT version
        .mockResolvedValueOnce({ rows: [] }) // UPDATE previous published
        .mockResolvedValueOnce({ rows: [] }) // UPDATE current version
        .mockResolvedValueOnce({ rows: [] }) // syncToMainTable UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion] }); // getVersion

      const result = await service.publishVersion(1, 1);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle version not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT version (not found)

      const result = await service.publishVersion(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version not found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('revertToVersion', () => {
    it('should revert to a previous version', async () => {
      const oldVersion = {
        id: 1,
        site_id: 1,
        locale: 'en-US',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        title: 'Old Version',
        slug: 'old-version',
        content: 'Old content'
      };

      const newVersion = {
        ...oldVersion,
        id: 3,
        version_number: 3,
        change_summary: 'Reverted to version 1'
      };

      // Mock getVersion
      mockPool.query.mockResolvedValueOnce({ rows: [oldVersion] });

      // Mock createVersion transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 3 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields
        .mockResolvedValueOnce({ rows: [newVersion] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock publishVersion transaction
      const mockClient2 = { ...mockClient };
      mockPool.connect.mockResolvedValueOnce(mockClient2);

      mockClient2.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [newVersion] }) // SELECT version
        .mockResolvedValueOnce({ rows: [] }) // UPDATE previous
        .mockResolvedValueOnce({ rows: [] }) // UPDATE current
        .mockResolvedValueOnce({ rows: [] }) // syncToMainTable
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [newVersion] }); // Final getVersion

      const result = await service.revertToVersion(1, 1);

      expect(result.success).toBe(true);
      expect(result.data?.version_number).toBe(3);
    });
  });

  describe('deleteVersion', () => {
    it('should delete a draft version', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_current_published: false }] }) // Check version
        .mockResolvedValueOnce({ rows: [] }); // DELETE

      const result = await service.deleteVersion(1);

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM content_versions WHERE id = $1',
        [1]
      );
    });

    it('should prevent deletion of published versions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_current_published: true }]
      });

      const result = await service.deleteVersion(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot delete published version');
    });

    it('should handle non-existent version', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.deleteVersion(999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version not found');
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions successfully', async () => {
      const version1 = {
        id: 1,
        site_id: 1,
        locale: 'en-US',
        title: 'Original Title',
        content: 'Original content',
        slug: 'test-post'
      };

      const version2 = {
        id: 2,
        site_id: 1,
        locale: 'en-US',
        title: 'Updated Title',
        content: 'Updated content',
        slug: 'test-post'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [version1] }) // getVersion(1)
        .mockResolvedValueOnce({ rows: [version2] }); // getVersion(2)

      const result = await service.compareVersions(1, 2);

      expect(result.success).toBe(true);
      expect(result.data?.diffs).toHaveLength(2);
      expect(result.data?.diffs).toContainEqual(
        expect.objectContaining({
          field: 'title',
          old_value: 'Original Title',
          new_value: 'Updated Title',
          change_type: 'modified'
        })
      );
    });

    it('should handle missing versions', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // First version not found

      const result = await service.compareVersions(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('First version not found');
    });
  });

  describe('getLatestDraft', () => {
    it('should get the latest draft version', async () => {
      const mockDraft = {
        id: 5,
        site_id: 1,
        locale: 'en-US',
        version_number: 5,
        is_current_draft: true,
        title: 'Latest Draft'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockDraft] });

      const result = await service.getLatestDraft(1, ContentType.POST, 1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockDraft);
    });

    it('should return null when no draft exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getLatestDraft(1, ContentType.PAGE, 1);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('getPublishedVersion', () => {
    it('should get the published version', async () => {
      const mockPublished = {
        id: 3,
        site_id: 1,
        locale: 'en-US',
        version_number: 3,
        is_current_published: true,
        title: 'Published Version'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockPublished] });

      const result = await service.getPublishedVersion(1, ContentType.POST, 1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPublished);
    });

    it('should return null when no published version exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getPublishedVersion(1, ContentType.PAGE, 5);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });
});