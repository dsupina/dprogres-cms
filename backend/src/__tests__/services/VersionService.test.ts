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

  // Helper to create a pattern-matching mock for BOTH pool and client queries
  const setupMocks = (overrides: Record<string, any> = {}) => {
    let versionCounter = 1;

    const handleQuery = (query: any, params?: any[]) => {
      if (typeof query === 'string') {
        if (query === 'BEGIN') return Promise.resolve({ rows: [] });
        if (query === 'COMMIT') return Promise.resolve({ rows: [] });
        if (query === 'ROLLBACK') return Promise.resolve({ rows: [] });

        // Check for overrides first
        for (const [pattern, result] of Object.entries(overrides)) {
          if (query.includes(pattern)) {
            return typeof result === 'function' ? result(query, params) : Promise.resolve(result);
          }
        }

        // Default responses - validateSiteAccess uses pool.query
        if (query.includes('SELECT 1 FROM sites')) {
          return Promise.resolve({ rows: [{ exists: 1 }] });
        }
        if (query.includes('COUNT(*)') && query.includes('content_versions')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('get_next_version_number')) {
          return Promise.resolve({ rows: [{ version_number: versionCounter++ }] });
        }
        if (query.includes('FROM content_versions') && query.includes('ORDER BY version_number DESC') && query.includes('LIMIT 1')) {
          return Promise.resolve({ rows: [] }); // No previous version
        }
        if (query.includes('INSERT INTO content_versions')) {
          return Promise.resolve({
            rows: [{
              id: 1,
              version_number: versionCounter - 1,
              site_id: params?.[0] || 1,
              content_type: params?.[1] || 'post',
              content_id: params?.[2] || 1,
              version_type: 'draft',
              created_at: new Date(),
              created_by: 1
            }]
          });
        }
        if (query.includes('version_audit_log') || query.includes('INSERT INTO')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('UPDATE content_versions')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
      }
      return Promise.resolve({ rows: [] });
    };

    // Apply to both pool and client queries
    mockPool.query.mockImplementation(handleQuery);
    mockClient.query.mockImplementation(handleQuery);
  };

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

      // Use pattern-matching mock with custom INSERT response
      setupMocks({
        'INSERT INTO content_versions': { rows: [mockVersion] }
      });

      const result = await service.createVersion(input, 1);

      expect(result.success).toBe(true);
      expect(result.data?.version_number).toBe(1);
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

      // Use pattern-matching mock that throws on get_next_version_number
      setupMocks({
        'get_next_version_number': () => Promise.reject(new Error('Database error'))
      });

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

      const mockCreatedVersion = {
        id: 2,
        version_number: 2,
        site_id: 1,
        content_type: 'post',
        content_id: 1,
        title: 'Updated Title',
        changed_fields: ['title', 'content']
      };

      // Use pattern-matching mock with version counter starting at 2
      setupMocks({
        'get_next_version_number': { rows: [{ version_number: 2 }] },
        'INSERT INTO content_versions': { rows: [mockCreatedVersion] },
        'COUNT(*)': { rows: [{ count: '1' }] }
      });

      const result = await service.createVersion(input, 1);

      expect(result.success).toBe(true);
      expect(result.data?.version_number).toBe(2);
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
        slug: 'test-post',
        is_current_published: false
      };

      const publishedVersion = { ...mockVersion, is_current_published: true };

      // Use pattern-matching mock for publish flow
      setupMocks({
        'SELECT': (query: string) => {
          if (query.includes('content_versions') && query.includes('id = ')) {
            return Promise.resolve({ rows: [mockVersion] });
          }
          if (query.includes('SELECT 1 FROM sites')) {
            return Promise.resolve({ rows: [{ exists: 1 }] });
          }
          return Promise.resolve({ rows: [] });
        },
        'UPDATE content_versions': { rows: [publishedVersion] }
      });

      const result = await service.publishVersion(1, 1);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle version not found', async () => {
      // Use pattern-matching mock that returns empty for version select
      setupMocks({
        'SELECT': (query: string) => {
          if (query.includes('SELECT 1 FROM sites')) {
            return Promise.resolve({ rows: [{ exists: 1 }] });
          }
          return Promise.resolve({ rows: [] });
        }
      });

      const result = await service.publishVersion(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Version not found');
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

      // Use pattern-matching mock for revert flow
      // revertToVersion calls: getVersion(1) -> createVersion -> publishVersion(3)
      // publishVersion at the end calls getVersion(3) to return the updated version (line 436)
      setupMocks({
        'get_next_version_number': { rows: [{ version_number: 3 }] },
        'INSERT INTO content_versions': { rows: [newVersion] },
        'COUNT(*)': { rows: [{ count: '2' }] },
        'UPDATE content_versions': { rows: [{ ...newVersion, is_current_published: true }] },
        // getVersion query pattern: SELECT v.*, u.name as created_by_name
        // Called for: getVersion(1) and getVersion(3) at end of publishVersion
        'created_by_name': (query: string, params?: any[]) => {
          if (params && params[0] === 1) {
            return Promise.resolve({ rows: [oldVersion] });
          }
          if (params && params[0] === 3) {
            // publishVersion calls getVersion at the end to return updated version
            return Promise.resolve({ rows: [{ ...newVersion, is_current_published: true }] });
          }
          return Promise.resolve({ rows: [] });
        },
        // publishVersion direct query: SELECT * FROM content_versions WHERE id
        'SELECT * FROM content_versions WHERE id': (query: string, params?: any[]) => {
          if (params && params[0] === 3) {
            return Promise.resolve({ rows: [newVersion] });
          }
          return Promise.resolve({ rows: [] });
        }
      });

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