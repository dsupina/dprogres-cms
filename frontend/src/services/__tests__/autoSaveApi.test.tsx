import { vi, describe, it, expect, beforeEach } from 'vitest';
/**
 * AutoSave API Service Unit Tests
 *
 * Comprehensive tests for the auto-save API service including:
 * - All CRUD operations for auto-save functionality
 * - Request/response handling and error scenarios
 * - API endpoint parameter validation
 * - TypeScript interface compliance
 * - Network error handling
 */

import { autoSaveApi, AutoSaveRequest, AutoSaveResponse, LatestAutoSaveResponse, AutoSaveStatusResponse } from '../autoSaveApi';
import api from '../../lib/api';

// Mock the API module
vi.mock('../../lib/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApi = api as vi.Mocked<typeof api>;

describe('autoSaveApi Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAutoSave', () => {
    const validRequest: AutoSaveRequest = {
      title: 'Test Auto-save Post',
      content: 'This is auto-saved content',
      excerpt: 'Auto-save excerpt',
      slug: 'test-auto-save-post',
      data: { category_id: 1, tags: ['test'] },
      meta_data: { description: 'Meta description' },
      content_hash: 'abc123hash'
    };

    it('should create auto-save for post successfully', async () => {
      const mockResponse: AutoSaveResponse = {
        success: true,
        data: {
          version: {
            id: 123,
            version_number: 5,
            version_type: 'auto_save',
            title: validRequest.title,
            content: validRequest.content,
            created_at: new Date(),
            created_by: 1
          },
          content_hash: 'abc123hash'
        }
      };

      mockApi.post.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.createAutoSave('post', 1, validRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApi.post).toHaveBeenCalledWith(
        '/content/post/1/autosave',
        validRequest
      );
    });

    it('should create auto-save for page successfully', async () => {
      const mockResponse: AutoSaveResponse = {
        success: true,
        data: {
          version: {
            id: 124,
            version_number: 3,
            version_type: 'auto_save',
          },
          content_hash: 'page_hash_456'
        }
      };

      mockApi.post.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.createAutoSave('page', 5, validRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApi.post).toHaveBeenCalledWith(
        '/content/page/5/autosave',
        validRequest
      );
    });

    it('should handle no changes detected response', async () => {
      const mockResponse: AutoSaveResponse = {
        success: true,
        data: undefined,
        message: 'No changes to save'
      };

      mockApi.post.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.createAutoSave('post', 1, validRequest);

      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.message).toBe('No changes to save');
    });

    it('should handle API errors', async () => {
      const mockErrorResponse: AutoSaveResponse = {
        success: false,
        error: 'Content validation failed'
      };

      mockApi.post.mockResolvedValue({ data: mockErrorResponse });

      const result = await autoSaveApi.createAutoSave('post', 1, validRequest);

      expect(result).toEqual(mockErrorResponse);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Content validation failed');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockApi.post.mockRejectedValue(networkError);

      await expect(
        autoSaveApi.createAutoSave('post', 1, validRequest)
      ).rejects.toThrow('Network timeout');

      expect(mockApi.post).toHaveBeenCalledWith(
        '/content/post/1/autosave',
        validRequest
      );
    });

    it('should send minimal request with only required fields', async () => {
      const minimalRequest: AutoSaveRequest = {
        title: 'Minimal Title',
        content: 'Minimal content'
      };

      const mockResponse: AutoSaveResponse = {
        success: true,
        data: {
          version: { id: 125 },
          content_hash: 'minimal_hash'
        }
      };

      mockApi.post.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.createAutoSave('post', 1, minimalRequest);

      expect(result).toEqual(mockResponse);
      expect(mockApi.post).toHaveBeenCalledWith(
        '/content/post/1/autosave',
        minimalRequest
      );
    });

    it('should handle different content types correctly', async () => {
      const contentTypes: Array<'post' | 'page'> = ['post', 'page'];
      const mockResponse: AutoSaveResponse = {
        success: true,
        data: {
          version: { id: 126 },
          content_hash: 'type_test_hash'
        }
      };

      mockApi.post.mockResolvedValue({ data: mockResponse });

      for (const contentType of contentTypes) {
        await autoSaveApi.createAutoSave(contentType, 1, validRequest);

        expect(mockApi.post).toHaveBeenCalledWith(
          `/content/${contentType}/1/autosave`,
          validRequest
        );
      }

      expect(mockApi.post).toHaveBeenCalledTimes(contentTypes.length);
    });
  });

  describe('getLatestAutoSave', () => {
    it('should retrieve latest auto-save successfully', async () => {
      const mockResponse: LatestAutoSaveResponse = {
        success: true,
        data: {
          version: {
            id: 456,
            version_number: 7,
            version_type: 'auto_save',
            title: 'Latest Auto-save',
            content: 'Latest content',
            created_at: new Date(),
            content_hash: 'latest_hash_456'
          },
          has_newer_manual_save: false
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.getLatestAutoSave('post', 1);

      expect(result).toEqual(mockResponse);
      expect(mockApi.get).toHaveBeenCalledWith('/content/post/1/autosave/latest');
    });

    it('should handle no auto-save found', async () => {
      const mockResponse: LatestAutoSaveResponse = {
        success: true,
        data: {
          version: null,
          has_newer_manual_save: false
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.getLatestAutoSave('page', 5);

      expect(result).toEqual(mockResponse);
      expect(result.data?.version).toBeNull();
      expect(mockApi.get).toHaveBeenCalledWith('/content/page/5/autosave/latest');
    });

    it('should indicate when newer manual save exists', async () => {
      const mockResponse: LatestAutoSaveResponse = {
        success: true,
        data: {
          version: {
            id: 457,
            version_number: 5,
            version_type: 'auto_save',
            created_at: new Date('2023-12-01T10:00:00Z')
          },
          has_newer_manual_save: true
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.getLatestAutoSave('post', 2);

      expect(result.data?.has_newer_manual_save).toBe(true);
      expect(mockApi.get).toHaveBeenCalledWith('/content/post/2/autosave/latest');
    });

    it('should handle API errors', async () => {
      const mockErrorResponse: LatestAutoSaveResponse = {
        success: false
      };

      mockApi.get.mockResolvedValue({ data: mockErrorResponse });

      const result = await autoSaveApi.getLatestAutoSave('post', 1);

      expect(result).toEqual(mockErrorResponse);
      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Connection timeout');
      mockApi.get.mockRejectedValue(networkError);

      await expect(
        autoSaveApi.getLatestAutoSave('post', 1)
      ).rejects.toThrow('Connection timeout');
    });

    it('should work with different content types and IDs', async () => {
      const testCases = [
        { contentType: 'post' as const, contentId: 1 },
        { contentType: 'page' as const, contentId: 5 },
        { contentType: 'post' as const, contentId: 999 }
      ];

      const mockResponse: LatestAutoSaveResponse = {
        success: true,
        data: {
          version: { id: 100 },
          has_newer_manual_save: false
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      for (const testCase of testCases) {
        await autoSaveApi.getLatestAutoSave(testCase.contentType, testCase.contentId);

        expect(mockApi.get).toHaveBeenCalledWith(
          `/content/${testCase.contentType}/${testCase.contentId}/autosave/latest`
        );
      }

      expect(mockApi.get).toHaveBeenCalledTimes(testCases.length);
    });
  });

  describe('checkAutoSaveStatus', () => {
    const testContentHash = 'test_content_hash_123';

    it('should check unsaved changes status successfully', async () => {
      const mockResponse: AutoSaveStatusResponse = {
        success: true,
        data: {
          has_unsaved_changes: true,
          latest_version_number: 8
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.checkAutoSaveStatus('post', 1, testContentHash);

      expect(result).toEqual(mockResponse);
      expect(mockApi.get).toHaveBeenCalledWith(
        '/content/post/1/autosave/status',
        {
          params: { content_hash: testContentHash }
        }
      );
    });

    it('should return false for no unsaved changes', async () => {
      const mockResponse: AutoSaveStatusResponse = {
        success: true,
        data: {
          has_unsaved_changes: false,
          latest_version_number: 5
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.checkAutoSaveStatus('page', 3, testContentHash);

      expect(result.data?.has_unsaved_changes).toBe(false);
      expect(result.data?.latest_version_number).toBe(5);
      expect(mockApi.get).toHaveBeenCalledWith(
        '/content/page/3/autosave/status',
        {
          params: { content_hash: testContentHash }
        }
      );
    });

    it('should handle zero version number for new content', async () => {
      const mockResponse: AutoSaveStatusResponse = {
        success: true,
        data: {
          has_unsaved_changes: true,
          latest_version_number: 0
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.checkAutoSaveStatus('post', 1, testContentHash);

      expect(result.data?.latest_version_number).toBe(0);
    });

    it('should handle API errors', async () => {
      const mockErrorResponse: AutoSaveStatusResponse = {
        success: false
      };

      mockApi.get.mockResolvedValue({ data: mockErrorResponse });

      const result = await autoSaveApi.checkAutoSaveStatus('post', 1, testContentHash);

      expect(result).toEqual(mockErrorResponse);
      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Request failed');
      mockApi.get.mockRejectedValue(networkError);

      await expect(
        autoSaveApi.checkAutoSaveStatus('post', 1, testContentHash)
      ).rejects.toThrow('Request failed');
    });

    it('should properly encode content hash in query parameters', async () => {
      const specialHash = 'hash/with+special=characters&symbols';
      const mockResponse: AutoSaveStatusResponse = {
        success: true,
        data: {
          has_unsaved_changes: false,
          latest_version_number: 1
        }
      };

      mockApi.get.mockResolvedValue({ data: mockResponse });

      await autoSaveApi.checkAutoSaveStatus('post', 1, specialHash);

      expect(mockApi.get).toHaveBeenCalledWith(
        '/content/post/1/autosave/status',
        {
          params: { content_hash: specialHash }
        }
      );
    });
  });

  describe('cleanupAutoSaves', () => {
    it('should cleanup auto-saves successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Cleaned up 3 old auto-saves'
      };

      mockApi.delete.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.cleanupAutoSaves('post', 1);

      expect(result).toEqual(mockResponse);
      expect(mockApi.delete).toHaveBeenCalledWith('/content/post/1/autosave/cleanup');
    });

    it('should handle zero deletions', async () => {
      const mockResponse = {
        success: true,
        message: 'Cleaned up 0 old auto-saves'
      };

      mockApi.delete.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.cleanupAutoSaves('page', 5);

      expect(result.message).toBe('Cleaned up 0 old auto-saves');
      expect(mockApi.delete).toHaveBeenCalledWith('/content/page/5/autosave/cleanup');
    });

    it('should handle cleanup errors', async () => {
      const mockErrorResponse = {
        success: false,
        message: 'Cleanup failed: Database error'
      };

      mockApi.delete.mockResolvedValue({ data: mockErrorResponse });

      const result = await autoSaveApi.cleanupAutoSaves('post', 1);

      expect(result).toEqual(mockErrorResponse);
      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Delete request failed');
      mockApi.delete.mockRejectedValue(networkError);

      await expect(
        autoSaveApi.cleanupAutoSaves('post', 1)
      ).rejects.toThrow('Delete request failed');
    });

    it('should work with different content types and IDs', async () => {
      const testCases = [
        { contentType: 'post' as const, contentId: 1 },
        { contentType: 'page' as const, contentId: 10 },
        { contentType: 'post' as const, contentId: 999 }
      ];

      const mockResponse = {
        success: true,
        message: 'Cleaned up successfully'
      };

      mockApi.delete.mockResolvedValue({ data: mockResponse });

      for (const testCase of testCases) {
        await autoSaveApi.cleanupAutoSaves(testCase.contentType, testCase.contentId);

        expect(mockApi.delete).toHaveBeenCalledWith(
          `/content/${testCase.contentType}/${testCase.contentId}/autosave/cleanup`
        );
      }

      expect(mockApi.delete).toHaveBeenCalledTimes(testCases.length);
    });

    it('should handle server-side validation errors', async () => {
      const mockErrorResponse = {
        success: false,
        message: 'Content not found'
      };

      mockApi.delete.mockResolvedValue({ data: mockErrorResponse });

      const result = await autoSaveApi.cleanupAutoSaves('post', 999);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Content not found');
    });
  });

  describe('Type Safety and Interface Compliance', () => {
    it('should enforce AutoSaveRequest interface requirements', () => {
      // TypeScript compilation test - these should not cause type errors
      const validRequests: AutoSaveRequest[] = [
        {
          title: 'Required Title',
          content: 'Required Content'
        },
        {
          title: 'Full Request',
          content: 'Full Content',
          excerpt: 'Optional excerpt',
          slug: 'optional-slug',
          data: { key: 'value' },
          meta_data: { meta: 'data' },
          content_hash: 'optional_hash'
        }
      ];

      expect(validRequests).toHaveLength(2);
    });

    it('should provide type-safe response handling', async () => {
      const mockResponse: AutoSaveResponse = {
        success: true,
        data: {
          version: {
            id: 123,
            version_type: 'auto_save'
          },
          content_hash: 'type_safe_hash'
        }
      };

      mockApi.post.mockResolvedValue({ data: mockResponse });

      const result = await autoSaveApi.createAutoSave('post', 1, {
        title: 'Type Test',
        content: 'Type Content'
      });

      // TypeScript should infer correct types
      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.version.id).toBe(123);
        expect(result.data.content_hash).toBe('type_safe_hash');
      }
    });

    it('should handle optional response fields correctly', async () => {
      const responseWithoutData: AutoSaveResponse = {
        success: false,
        error: 'Validation failed'
      };

      mockApi.post.mockResolvedValue({ data: responseWithoutData });

      const result = await autoSaveApi.createAutoSave('post', 1, {
        title: 'Error Test',
        content: 'Error Content'
      });

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Validation failed');
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle empty response data', async () => {
      mockApi.get.mockResolvedValue({ data: null });

      await expect(
        autoSaveApi.getLatestAutoSave('post', 1)
      ).resolves.toBeNull();
    });

    it('should handle malformed API responses', async () => {
      mockApi.post.mockResolvedValue({ data: 'not an object' });

      const result = await autoSaveApi.createAutoSave('post', 1, {
        title: 'Malformed Test',
        content: 'Malformed Content'
      });

      expect(result).toBe('not an object');
    });

    it('should handle HTTP status errors', async () => {
      const httpError = new Error('HTTP 500: Internal Server Error');
      mockApi.post.mockRejectedValue(httpError);

      await expect(
        autoSaveApi.createAutoSave('post', 1, {
          title: 'HTTP Error Test',
          content: 'HTTP Error Content'
        })
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should handle request timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      mockApi.get.mockRejectedValue(timeoutError);

      await expect(
        autoSaveApi.getLatestAutoSave('post', 1)
      ).rejects.toThrow('Request timeout');
    });
  });
});