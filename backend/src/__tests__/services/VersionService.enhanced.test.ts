/**
 * Enhanced VersionService Tests - CV-003
 *
 * Comprehensive test suite for the enhanced VersionService with security,
 * performance, and multi-site support features.
 */

import { Pool, PoolClient } from 'pg';
import { VersionService } from '../../services/VersionService';
import {
  ContentVersion,
  CreateVersionInput,
  ContentType,
  VersionType,
  ServiceResponse,
  PaginatedResponse,
  VersionHistoryOptions
} from '../../types/versioning';
import {
  VersionErrorCode,
  DataClassification
} from '../../types/versioning/enums';
import {
  VersionAction
} from '../../types/versioning/core';

// Mock the DOMPurify module
jest.mock('isomorphic-dompurify', () => ({
  sanitize: jest.fn((input: string) => input) // Simple passthrough for tests
}));

describe('Enhanced VersionService - CV-003', () => {
  let mockPool: any;
  let mockClient: any;
  let versionService: VersionService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    // Separate mocks for pool and client queries
    const mockPoolQuery = jest.fn() as jest.MockedFunction<any>;
    const mockClientQuery = jest.fn() as jest.MockedFunction<any>;

    mockClient = {
      query: mockClientQuery,
      release: jest.fn(),
    } as any;

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: mockPoolQuery,
      end: jest.fn(),
    } as any;

    // Make mockQuery point to the client query for most tests
    mockQuery = mockClientQuery;

    versionService = new VersionService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Security Features', () => {
    describe('validateSiteAccess', () => {
      it('should allow access for admin users', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ id: 1 }]
        });

        const result = await versionService.validateSiteAccess(1, 1);

        expect(result.success).toBe(true);
        expect(result.data).toBe(true);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT 1 FROM sites'),
          [1, 1]
        );
      });

      it('should deny access for unauthorized users', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: []
        });

        const result = await versionService.validateSiteAccess(1, 999);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Access denied');
      });

      it('should handle database errors gracefully', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('Database error'));

        const result = await versionService.validateSiteAccess(1, 1);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to validate');
      });
    });

    describe('sanitizeVersionInput', () => {
      it('should sanitize input data successfully', async () => {
        const input: CreateVersionInput = {
          site_id: 1,
          content_type: ContentType.POST,
          content_id: 1,
          title: 'Test Title',
          content: '<script>alert(\"xss\")</script>Safe content',
          excerpt: 'Test excerpt'
        };

        const result = await versionService.sanitizeVersionInput(input);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.title).toBe('Test Title');
      });

      it('should reject empty title', async () => {
        const input: CreateVersionInput = {
          site_id: 1,
          content_type: ContentType.POST,
          content_id: 1,
          title: '',
          content: 'Some content'
        };

        const result = await versionService.sanitizeVersionInput(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Title is required');
      });

      it('should reject title exceeding 255 characters', async () => {
        const input: CreateVersionInput = {
          site_id: 1,
          content_type: ContentType.POST,
          content_id: 1,
          title: 'a'.repeat(256),
          content: 'Some content'
        };

        const result = await versionService.sanitizeVersionInput(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('cannot exceed 255 characters');
      });
    });

    describe('classifyVersionData', () => {
      it('should classify data as RESTRICTED when PII is detected', () => {
        const input: CreateVersionInput = {
          site_id: 1,
          content_type: ContentType.POST,
          content_id: 1,
          title: 'Contact Info',
          content: 'Email me at test@example.com for more info'
        };

        const classification = versionService.classifyVersionData(input);

        expect(classification).toBe(DataClassification.RESTRICTED);
      });

      it('should classify data as INTERNAL for normal content', () => {
        const input: CreateVersionInput = {
          site_id: 1,
          content_type: ContentType.POST,
          content_id: 1,
          title: 'Normal Title',
          content: 'This is normal content without PII'
        };

        const classification = versionService.classifyVersionData(input);

        expect(classification).toBe(DataClassification.INTERNAL);
      });
    });
  });

  describe('Enhanced Version Creation', () => {
    // Note: Each test sets up its own mocks for better control

    it('should create version with enhanced security validation', async () => {
      // Set up mock responses for pool queries (validateSiteAccess and getVersionCount)
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getVersionCount

      // Set up mock responses for client queries (transaction operations)
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION ISOLATION LEVEL
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 6 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields
        .mockResolvedValueOnce({ // INSERT version
          rows: [{
            id: 123,
            site_id: 1,
            content_type: 'post',
            content_id: 1,
            version_number: 6,
            version_type: 'draft',
            title: 'Test Title',
            content: 'Test content',
            created_by: 1,
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // auditVersionOperation
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Title',
        content: 'Test content'
      };

      const result = await versionService.createVersion(input, 1, {
        ip_address: '127.0.0.1',
        user_agent: 'Test Agent'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(123);

      // Verify site access validation was called
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1 FROM sites'),
        [1, 1]
      );

      // Verify audit logging was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO version_audit_log'),
        expect.arrayContaining(['created', 123, 1, 1])
      );
    });

    it('should respect version limits', async () => {
      // Mock version count at maximum
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] }); // getVersionCount at max

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Title'
      };

      const result = await versionService.createVersion(input, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum version limit');
    });
  });

  describe('Enhanced Draft Operations', () => {
    it('should create draft with proper version type', async () => {
      // Mock pool queries for validateSiteAccess and getVersionCount
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getVersionCount

      // Mock client queries for transaction operations
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION ISOLATION LEVEL
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 6 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields
        .mockResolvedValueOnce({ // INSERT version
          rows: [{
            id: 124,
            site_id: 1,
            content_type: 'post',
            content_id: 1,
            version_number: 6,
            version_type: 'draft',
            is_current_draft: true,
            title: 'Draft Title',
            created_by: 1
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // auditVersionOperation

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Draft Title',
        content: 'Draft content'
      };

      const result = await versionService.createDraft(input, 1);

      expect(result.success).toBe(true);
      expect(result.data?.version_type).toBe('draft');
      expect(result.data?.is_current_draft).toBe(true);
    });
  });

  describe('Auto-Save Features', () => {
    it('should create auto-save version and trigger pruning', async () => {
      // Mock pool queries for validateSiteAccess and getVersionCount
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getVersionCount

      // Mock client queries for transaction operations
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION ISOLATION LEVEL
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 6 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields
        .mockResolvedValueOnce({ // INSERT version
          rows: [{
            id: 125,
            site_id: 1,
            content_type: 'post',
            content_id: 1,
            version_number: 6,
            version_type: 'auto_save',
            title: 'Auto-save Title',
            created_by: 1
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // auditVersionOperation

      // Mock pruneOldAutoSaves (uses pool.query)
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 3 }); // pruneOldAutoSaves

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Auto-save Title',
        content: 'Auto-save content'
      };

      const result = await versionService.autoSave(input, 1);

      expect(result.success).toBe(true);
      expect(result.data?.version_type).toBe('auto_save');

      // Wait a bit for async pruning to be called
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify pruning was called
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM content_versions'),
        expect.arrayContaining([1, 'post', 1])
      );
    });
  });

  describe('Version Metrics', () => {
    it('should calculate comprehensive metrics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_versions: '25',
          draft_count: '5',
          published_count: '15',
          auto_save_count: '5',
          last_activity: new Date('2023-01-01'),
          storage_size_bytes: '102400'
        }]
      });

      const result = await versionService.getVersionMetrics(1, ContentType.POST, 1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        total_versions: 25,
        draft_count: 5,
        published_count: 15,
        auto_save_count: 5,
        last_activity: new Date('2023-01-01'),
        storage_size_bytes: 102400
      });
    });

    it('should use cache for subsequent requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_versions: '25',
          draft_count: '5',
          published_count: '15',
          auto_save_count: '5',
          last_activity: new Date('2023-01-01'),
          storage_size_bytes: '102400'
        }]
      });

      // First call
      const result1 = await versionService.getVersionMetrics(1, ContentType.POST, 1);
      expect(result1.success).toBe(true);

      // Second call should use cache
      const result2 = await versionService.getVersionMetrics(1, ContentType.POST, 1);
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual(result1.data);

      // Database should only be called once
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event System', () => {
    it('should emit events on version creation', async () => {
      const eventHandler = jest.fn();
      versionService.onVersionCreated(eventHandler);

      // Mock pool queries for validateSiteAccess and getVersionCount
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getVersionCount

      // Mock client queries for transaction operations
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION ISOLATION LEVEL
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 6 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields
        .mockResolvedValueOnce({ // INSERT version
          rows: [{
            id: 126,
            site_id: 1,
            content_type: 'post',
            content_id: 1,
            title: 'Test Title',
            created_by: 1
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // auditVersionOperation

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Title'
      };

      await versionService.createVersion(input, 1);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          action: VersionAction.CREATED,
          userId: 1,
          siteId: 1
        })
      );
    });

    it('should support any event handler', async () => {
      const anyEventHandler = jest.fn();
      versionService.onAnyVersionEvent(anyEventHandler);

      // Mock pool queries for validateSiteAccess and getVersionCount
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getVersionCount

      // Mock client queries for transaction operations
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION ISOLATION LEVEL
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ version_number: 6 }] }) // get_next_version_number
        .mockResolvedValueOnce({ rows: [] }) // detectChangedFields
        .mockResolvedValueOnce({
          rows: [{
            id: 127,
            site_id: 1,
            content_type: 'post',
            content_id: 1,
            title: 'Test Title',
            created_by: 1
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // auditVersionOperation

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Title'
      };

      await versionService.createVersion(input, 1);

      expect(anyEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          action: VersionAction.CREATED
        })
      );
    });
  });

  describe('Performance Features', () => {
    it('should prune old auto-save versions', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 5 });

      const result = await versionService.pruneOldAutoSaves(1, ContentType.POST, 1);

      expect(result.success).toBe(true);
      expect(result.data?.deleted_count).toBe(5);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM content_versions'),
        expect.arrayContaining([1, 'post', 1])
      );
    });

    it('should handle cache invalidation', () => {
      // Test cache invalidation doesn't throw errors
      expect(() => {
        versionService.invalidateVersionCaches(1, ContentType.POST, 1);
      }).not.toThrow();
    });

    it('should cleanup expired cache entries', () => {
      // Test cache cleanup doesn't throw errors
      expect(() => {
        versionService.cleanupExpiredCache();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Mock validateSiteAccess to fail first (before connection attempt)
      mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Title'
      };

      const result = await versionService.createVersion(input, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to validate');
    });

    it('should rollback transactions on failure', async () => {
      // Mock pool queries for validateSiteAccess and getVersionCount
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // validateSiteAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getVersionCount

      // Mock client queries - fail on get_next_version_number
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION ISOLATION LEVEL
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // get_next_version_number fails

      const input: CreateVersionInput = {
        site_id: 1,
        content_type: ContentType.POST,
        content_id: 1,
        title: 'Test Title'
      };

      const result = await versionService.createVersion(input, 1);

      expect(result.success).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});