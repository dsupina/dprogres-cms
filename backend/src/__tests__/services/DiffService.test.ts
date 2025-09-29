/**
 * DiffService Unit Tests - CV-007
 *
 * Testing diff algorithms, change statistics, and export functionality
 */

import { Pool } from 'pg';
import { DiffService } from '../../services/DiffService';
import {
  ContentVersion,
  ContentType,
  VersionType
} from '../../types/versioning';

// Mock DOMPurify
jest.mock('isomorphic-dompurify', () => {
  const sanitize = jest.fn((input: string) => input);
  return {
    __esModule: true,
    default: { sanitize },
    sanitize
  };
});

// Mock diff-match-patch
jest.mock('diff-match-patch', () => {
  return {
    diff_match_patch: jest.fn().mockImplementation(() => ({
      diff_main: jest.fn((text1: string, text2: string) => {
        // Simple mock diff implementation
        if (text1 === text2) {
          return [[0, text1]];
        }
        return [
          [-1, text1],
          [1, text2]
        ];
      }),
      diff_cleanupSemantic: jest.fn(),
      diff_levenshtein: jest.fn((diffs: any[]) => {
        // Return 0 for identical content, otherwise return a value based on content
        if (diffs.length === 1 && diffs[0][0] === 0) {
          return 0; // No changes
        }
        return 10; // Some changes
      }),
      Diff_Timeout: 5.0,
      Diff_EditCost: 4
    }))
  };
});

describe('DiffService - CV-007', () => {
  let mockPool: any;
  let diffService: DiffService;

  const mockVersion1: ContentVersion = {
    id: 1,
    site_id: 1,
    locale: 'en',
    content_type: ContentType.POST,
    content_id: 1,
    version_number: 1,
    version_type: VersionType.PUBLISHED,
    is_current_draft: false,
    is_current_published: true,
    title: 'Original Title',
    slug: 'original-title',
    content: '<p>Original content with some text.</p>',
    excerpt: 'Original excerpt',
    data: { seo_title: 'Original SEO' } as any,
    meta_data: { author: 'John Doe' } as any,
    created_by: 1,
    created_at: new Date('2023-01-01'),
    published_at: new Date('2023-01-01'),
    change_summary: null,
    diff_from_previous: null,
    content_hash: null
  } as ContentVersion;

  const mockVersion2: ContentVersion = {
    ...mockVersion1,
    id: 2,
    version_number: 2,
    version_type: VersionType.DRAFT,
    is_current_draft: true,
    is_current_published: false,
    title: 'Updated Title',
    content: '<p>Updated content with new text and more details.</p>',
    data: { seo_title: 'Updated SEO Title' },
    created_at: new Date('2023-01-02')
  };

  beforeEach(() => {
    const mockQuery = jest.fn();
    mockPool = {
      query: mockQuery,
      connect: jest.fn(),
      end: jest.fn()
    } as any;

    diffService = new DiffService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('compareVersions', () => {
    it('should compare two versions successfully', async () => {
      // Mock fetching versions
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] }) // Fetch version 1
        .mockResolvedValueOnce({ rows: [mockVersion2] }) // Fetch version 2
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Validate user access
        .mockResolvedValueOnce({ rows: [] }); // Log diff operation

      const result = await diffService.compareVersions(1, 2, 1, {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.leftVersion).toEqual(mockVersion1);
      expect(result.data?.rightVersion).toEqual(mockVersion2);
      expect(result.data?.textDiff).toBeDefined();
      expect(result.data?.statistics).toBeDefined();
    });

    it('should enforce site isolation', async () => {
      const differentSiteVersion = { ...mockVersion2, site_id: 999 };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] })
        .mockResolvedValueOnce({ rows: [differentSiteVersion] });

      const result = await diffService.compareVersions(1, 2, 1, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('site isolation');
    });

    it('should validate user access', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] })
        .mockResolvedValueOnce({ rows: [mockVersion2] })
        .mockResolvedValueOnce({ rows: [] }); // No access

      const result = await diffService.compareVersions(1, 2, 999, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should handle missing versions', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Version not found
        .mockResolvedValueOnce({ rows: [mockVersion2] });

      const result = await diffService.compareVersions(999, 2, 1, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch versions');
    });
  });

  describe('generateTextDiff', () => {
    it('should generate line-by-line diff', () => {
      const text1 = 'Line 1\nLine 2\nLine 3';
      const text2 = 'Line 1\nModified Line 2\nLine 3\nNew Line 4';

      const result = diffService.generateTextDiff(text1, text2);

      expect(result).toBeDefined();
      expect(result.changes).toBeDefined();
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('should handle identical content', () => {
      const text = 'Same content';

      const result = diffService.generateTextDiff(text, text);

      expect(result.changes.length).toBe(0);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
      expect(result.similarityRatio).toBeCloseTo(1);
    });

    it('should handle empty content', () => {
      const result1 = diffService.generateTextDiff('', 'New content');
      expect(result1.linesAdded).toBeGreaterThan(0);

      const result2 = diffService.generateTextDiff('Old content', '');
      expect(result2.linesRemoved).toBeGreaterThan(0);
    });
  });

  describe('generateStructuralDiff', () => {
    it('should detect HTML structure changes', () => {
      const html1 = '<div><p>Original paragraph</p></div>';
      const html2 = '<div><p>Original paragraph</p><h2>New heading</h2></div>';

      const result = diffService.generateStructuralDiff(html1, html2);

      expect(result).toBeDefined();
      expect(result.changes).toBeDefined();
      expect(result.changes.some(c => c.type === 'element_added')).toBe(true);
    });

    it('should detect attribute changes', () => {
      const html1 = '<img src="old.jpg" alt="Old image">';
      const html2 = '<img src="new.jpg" alt="New image" class="responsive">';

      const result = diffService.generateStructuralDiff(html1, html2);

      expect(result.changes).toBeDefined();
      expect(result.changes.some(c => c.type === 'attribute_changed' && c.attribute === 'src')).toBe(true);
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHtml1 = '<div><p>Unclosed paragraph';
      const malformedHtml2 = '<div><p>Fixed paragraph</p></div>';

      expect(() => {
        diffService.generateStructuralDiff(malformedHtml1, malformedHtml2);
      }).not.toThrow();
    });
  });

  describe('generateMetadataDiff', () => {
    it('should detect title changes', () => {
      const result = diffService.generateMetadataDiff(mockVersion1, mockVersion2);

      expect(result.title).toBeDefined();
      expect(result.title?.changeType).toBe('modified');
      expect(result.title?.oldValue).toBe('Original Title');
      expect(result.title?.newValue).toBe('Updated Title');
    });

    it('should detect data field changes', () => {
      const result = diffService.generateMetadataDiff(mockVersion1, mockVersion2);

      expect(result['data.seo_title']).toBeDefined();
      expect(result['data.seo_title']?.changeType).toBe('modified');
      expect(result['data.seo_title']?.oldValue).toBe('Original SEO');
      expect(result['data.seo_title']?.newValue).toBe('Updated SEO Title');
    });

    it('should handle missing fields', () => {
      const version1 = { ...mockVersion1, data: { field1: 'value1' } };
      const version2 = { ...mockVersion2, data: { field2: 'value2' } };

      const result = diffService.generateMetadataDiff(version1 as any, version2 as any);

      expect(result['data.field1']?.changeType).toBe('removed');
      expect(result['data.field2']?.changeType).toBe('added');
    });
  });

  describe('calculateChangeStats', () => {
    it('should calculate accurate statistics', () => {
      const textDiff = {
        hunks: [],
        changes: [
          { type: 'add' as const, content: 'New line' },
          { type: 'remove' as const, content: 'Old line' },
          { type: 'unchanged' as const, content: 'Same line' }
        ],
        linesAdded: 1,
        linesRemoved: 1,
        linesModified: 0,
        similarityRatio: 0.8
      };

      const structuralDiff = {
        changes: [
          { type: 'element_added' as const, element: 'p' }
        ]
      };

      const metadataDiff = {
        title: {
          changeType: 'modified' as const,
          oldValue: 'Old Title',
          newValue: 'New Title'
        }
      };

      const stats = diffService.calculateChangeStats(
        textDiff as any,
        structuralDiff as any,
        metadataDiff,
        'Old content',
        'New content with more text'
      );

      expect(stats.totalChanges).toBeGreaterThan(0);
      expect(stats.linesAdded).toBe(1);
      expect(stats.linesRemoved).toBe(1);
      expect(stats.changePercent).toBeGreaterThan(0);
      expect(stats.majorChanges).toContain('Title changed');
    });
  });

  describe('exportDiff', () => {
    it('should export as HTML', async () => {
      const mockDiff = {
        leftVersion: mockVersion1,
        rightVersion: mockVersion2,
        textDiff: { hunks: [], changes: [], linesAdded: 1, linesRemoved: 0, linesModified: 0, similarityRatio: 0.9 },
        structuralDiff: { changes: [] },
        metadataDiff: {},
        statistics: {
          totalChanges: 1,
          linesAdded: 1,
          linesRemoved: 0,
          linesModified: 0,
          charactersAdded: 10,
          charactersRemoved: 0,
          wordsAdded: 2,
          wordsRemoved: 0,
          changePercent: 10,
          complexityScore: 1,
          reviewTimeEstimate: 1,
          majorChanges: []
        }
      };

      const result = await diffService.exportDiff(mockDiff as any, 'html', {
        includeMetadata: true,
        includeStatistics: true
      });

      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');
      expect(result.data).toContain('<html lang="en">');
      expect(result.data).toContain('Version Comparison');
    });

    it('should export as JSON', async () => {
      const mockDiff = {
        leftVersion: mockVersion1,
        rightVersion: mockVersion2,
        textDiff: { hunks: [], changes: [], linesAdded: 0, linesRemoved: 0, linesModified: 0, similarityRatio: 1 },
        structuralDiff: { changes: [] },
        metadataDiff: {},
        statistics: {
          totalChanges: 0,
          linesAdded: 0,
          linesRemoved: 0,
          linesModified: 0,
          charactersAdded: 0,
          charactersRemoved: 0,
          wordsAdded: 0,
          wordsRemoved: 0,
          changePercent: 0,
          complexityScore: 0,
          reviewTimeEstimate: 0,
          majorChanges: []
        }
      };

      const result = await diffService.exportDiff(mockDiff as any, 'json', {});

      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');

      const parsed = JSON.parse(result.data as string);
      expect(parsed.leftVersion).toBeDefined();
      expect(parsed.rightVersion).toBeDefined();
    });
  });

  describe('Caching', () => {
    it('should cache diff results', async () => {
      // First call - should compute
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion1] })
        .mockResolvedValueOnce({ rows: [mockVersion2] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result1 = await diffService.compareVersions(1, 2, 1, {});
      expect(result1.success).toBe(true);

      // Second call - should use cache (no database calls)
      const result2 = await diffService.compareVersions(1, 2, 1, {});
      expect(result2.success).toBe(true);
      expect(result2.data?.cacheKey).toBe(result1.data?.cacheKey);

      // Verify database was only called once
      expect(mockPool.query).toHaveBeenCalledTimes(4); // Only first call
    });
  });
});