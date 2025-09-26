/**
 * Unit Tests for Type Guard Functions
 * Ticket: CV-002
 */

import {
  isContentVersion,
  isPreviewToken,
  isVersionComment,
  isContentType,
  isVersionType,
  isJsonValue,
  hasSiteContext,
  ensureSiteIsolation,
  validateRequiredFields,
  validateStringLength,
  validateArray,
  sanitizeHtml,
  sanitizeFilePath,
  sanitizeSqlIdentifier,
  isDraftVersion,
  isPublishedVersion,
  validateBatch
} from '../../../types/versioning/guards';

import { ContentType, VersionType } from '../../../types/versioning/enums';
import { ContentVersion, PreviewToken, VersionComment, TokenType } from '../../../types/versioning/core';

describe('Type Guards', () => {
  // ============================================
  // ContentVersion Guards
  // ============================================

  describe('isContentVersion', () => {
    it('should validate a valid ContentVersion', () => {
      const validVersion: ContentVersion = {
        id: 1,
        site_id: 1,
        locale: 'en',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        version_type: VersionType.DRAFT,
        is_current_draft: true,
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
        diff_from_previous: null
      };

      expect(isContentVersion(validVersion)).toBe(true);
    });

    it('should reject invalid ContentVersion - missing site_id', () => {
      const invalidVersion = {
        id: 1,
        // missing site_id
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        version_type: VersionType.DRAFT,
        is_current_draft: true,
        is_current_published: false,
        title: 'Test Post',
        created_by: 1,
        created_at: new Date()
      };

      expect(isContentVersion(invalidVersion)).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(isContentVersion(null)).toBe(false);
      expect(isContentVersion(undefined)).toBe(false);
    });

    it('should reject non-object types', () => {
      expect(isContentVersion('string')).toBe(false);
      expect(isContentVersion(123)).toBe(false);
      expect(isContentVersion([])).toBe(false);
    });
  });

  // ============================================
  // PreviewToken Guards
  // ============================================

  describe('isPreviewToken', () => {
    it('should validate a valid PreviewToken', () => {
      const validToken: PreviewToken = {
        id: 1,
        site_id: 1,
        version_id: 1,
        token: 'test-token-hash',
        token_type: TokenType.PREVIEW,
        created_by: 1,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
        use_count: 0,
        password_protected: false,
        require_auth: false,
        is_active: true
      };

      expect(isPreviewToken(validToken)).toBe(true);
    });

    it('should reject invalid PreviewToken - missing site_id', () => {
      const invalidToken = {
        id: 1,
        // missing site_id
        version_id: 1,
        token: 'test-token',
        created_by: 1,
        created_at: new Date(),
        expires_at: new Date(),
        use_count: 0,
        is_active: true
      };

      expect(isPreviewToken(invalidToken)).toBe(false);
    });
  });

  // ============================================
  // Enum Guards
  // ============================================

  describe('isContentType', () => {
    it('should validate valid ContentType enums', () => {
      expect(isContentType(ContentType.POST)).toBe(true);
      expect(isContentType(ContentType.PAGE)).toBe(true);
      expect(isContentType('post')).toBe(true);
      expect(isContentType('page')).toBe(true);
    });

    it('should reject invalid ContentType values', () => {
      expect(isContentType('article')).toBe(false);
      expect(isContentType('blog')).toBe(false);
      expect(isContentType(null)).toBe(false);
      expect(isContentType(undefined)).toBe(false);
    });
  });

  describe('isVersionType', () => {
    it('should validate valid VersionType enums', () => {
      expect(isVersionType(VersionType.DRAFT)).toBe(true);
      expect(isVersionType(VersionType.PUBLISHED)).toBe(true);
      expect(isVersionType(VersionType.AUTO_SAVE)).toBe(true);
      expect(isVersionType(VersionType.ARCHIVED)).toBe(true);
    });

    it('should reject invalid VersionType values', () => {
      expect(isVersionType('pending')).toBe(false);
      expect(isVersionType('deleted')).toBe(false);
      expect(isVersionType(null)).toBe(false);
    });
  });

  // ============================================
  // JSON Value Guards
  // ============================================

  describe('isJsonValue', () => {
    it('should validate primitive JSON values', () => {
      expect(isJsonValue('string')).toBe(true);
      expect(isJsonValue(123)).toBe(true);
      expect(isJsonValue(true)).toBe(true);
      expect(isJsonValue(false)).toBe(true);
      expect(isJsonValue(null)).toBe(true);
    });

    it('should validate arrays and objects', () => {
      expect(isJsonValue([1, 2, 3])).toBe(true);
      expect(isJsonValue({ key: 'value' })).toBe(true);
      expect(isJsonValue({ nested: { object: true } })).toBe(true);
      expect(isJsonValue([{ complex: 'array' }, 123])).toBe(true);
    });

    it('should reject non-JSON values', () => {
      expect(isJsonValue(undefined)).toBe(false);
      expect(isJsonValue(() => {})).toBe(false);
      expect(isJsonValue(Symbol('test'))).toBe(false);
      expect(isJsonValue(new Date())).toBe(false);
    });
  });

  // ============================================
  // Site Context Guards
  // ============================================

  describe('hasSiteContext', () => {
    it('should validate objects with site_id', () => {
      expect(hasSiteContext({ site_id: 1, other: 'data' })).toBe(true);
      expect(hasSiteContext({ site_id: 123 })).toBe(true);
    });

    it('should reject objects without site_id', () => {
      expect(hasSiteContext({ other: 'data' })).toBe(false);
      expect(hasSiteContext({})).toBe(false);
      expect(hasSiteContext({ site_id: 'not-a-number' })).toBe(false);
    });
  });

  describe('ensureSiteIsolation', () => {
    it('should pass queries with allowed site_id', () => {
      const query = { site_id: 1, data: 'test' };
      const allowed_sites = [1, 2, 3];

      const result = ensureSiteIsolation(query, allowed_sites);
      expect(result).toBe(query);
      expect(result.site_id).toBe(1);
    });

    it('should throw for queries without site_id', () => {
      const query = { data: 'test' };
      const allowed_sites = [1, 2, 3];

      expect(() => ensureSiteIsolation(query, allowed_sites)).toThrow(
        'Site context is required for all queries'
      );
    });

    it('should throw for unauthorized site access', () => {
      const query = { site_id: 5, data: 'test' };
      const allowed_sites = [1, 2, 3];

      expect(() => ensureSiteIsolation(query, allowed_sites)).toThrow(
        'Access denied to site 5'
      );
    });
  });

  // ============================================
  // Validation Helpers
  // ============================================

  describe('validateRequiredFields', () => {
    it('should validate objects with all required fields', () => {
      const obj = { id: 1, name: 'Test', active: true };
      expect(validateRequiredFields(obj, ['id', 'name'])).toBe(true);
    });

    it('should reject objects missing required fields', () => {
      const obj: { id: number; name?: string } = { id: 1 };
      expect(validateRequiredFields(obj, ['id', 'name'])).toBe(false);
    });

    it('should reject null/undefined values', () => {
      const obj = { id: 1, name: null };
      expect(validateRequiredFields(obj, ['id', 'name'])).toBe(false);
    });
  });

  describe('validateStringLength', () => {
    it('should validate strings within length constraints', () => {
      expect(validateStringLength('hello', 1, 10)).toBe(true);
      expect(validateStringLength('test', 4, 4)).toBe(true);
    });

    it('should reject strings outside length constraints', () => {
      expect(validateStringLength('', 1, 10)).toBe(false);
      expect(validateStringLength('too long string', 1, 5)).toBe(false);
    });
  });

  describe('validateArray', () => {
    it('should validate arrays within constraints', () => {
      expect(validateArray([1, 2, 3], 1, 5)).toBe(true);
      expect(validateArray(['a', 'b'], 2, 2)).toBe(true);
    });

    it('should validate with item validator', () => {
      const isPositive = (n: number) => n > 0;
      expect(validateArray([1, 2, 3], 1, 5, isPositive)).toBe(true);
      expect(validateArray([1, -2, 3], 1, 5, isPositive)).toBe(false);
    });

    it('should reject arrays outside constraints', () => {
      expect(validateArray([], 1, 5)).toBe(false);
      expect(validateArray([1, 2, 3, 4, 5, 6], 1, 5)).toBe(false);
    });
  });

  // ============================================
  // Sanitization Helpers
  // ============================================

  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const html = '<div>Hello<script>alert("xss")</script>World</div>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain('<script');
      expect(sanitized).toContain('HelloWorld');
    });

    it('should remove iframe tags', () => {
      const html = '<div><iframe src="evil.com"></iframe></div>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain('<iframe');
    });

    it('should remove javascript: protocols', () => {
      const html = '<a href="javascript:alert(1)">Link</a>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const html = '<div onclick="alert(1)" onmouseover="alert(2)">Test</div>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('onmouseover');
    });
  });

  describe('sanitizeFilePath', () => {
    it('should remove path traversal attempts', () => {
      expect(sanitizeFilePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizeFilePath('..\\..\\windows\\system32')).toBe('windowssystem32');
    });

    it('should normalize slashes', () => {
      expect(sanitizeFilePath('//path///to//file')).toBe('path/to/file');
    });

    it('should remove special characters', () => {
      expect(sanitizeFilePath('file$name%test#.txt')).toBe('filenametest.txt');
    });
  });

  describe('sanitizeSqlIdentifier', () => {
    it('should only allow alphanumeric and underscores', () => {
      expect(sanitizeSqlIdentifier('valid_table_123')).toBe('valid_table_123');
      expect(sanitizeSqlIdentifier('table-name')).toBe('tablename');
      expect(sanitizeSqlIdentifier('table.name')).toBe('tablename');
      expect(sanitizeSqlIdentifier("'; DROP TABLE users; --")).toBe('DROPTABLEusers');
    });
  });

  // ============================================
  // Type Narrowing
  // ============================================

  describe('isDraftVersion', () => {
    it('should identify draft versions', () => {
      const draft: ContentVersion = {
        id: 1,
        site_id: 1,
        locale: 'en',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        version_type: VersionType.DRAFT,
        is_current_draft: true,
        is_current_published: false,
        title: 'Draft',
        slug: null,
        content: null,
        excerpt: null,
        data: null,
        meta_data: null,
        created_by: 1,
        created_at: new Date(),
        published_at: null,
        change_summary: null,
        diff_from_previous: null
      };

      expect(isDraftVersion(draft)).toBe(true);
    });

    it('should reject non-draft versions', () => {
      const published: ContentVersion = {
        id: 1,
        site_id: 1,
        locale: 'en',
        content_type: ContentType.POST,
        content_id: 1,
        version_number: 1,
        version_type: VersionType.PUBLISHED,
        is_current_draft: false,
        is_current_published: true,
        title: 'Published',
        slug: null,
        content: null,
        excerpt: null,
        data: null,
        meta_data: null,
        created_by: 1,
        created_at: new Date(),
        published_at: new Date(),
        change_summary: null,
        diff_from_previous: null
      };

      expect(isDraftVersion(published)).toBe(false);
    });
  });

  // ============================================
  // Batch Validation
  // ============================================

  describe('validateBatch', () => {
    it('should separate valid and invalid items', () => {
      const items = [1, -1, 2, -2, 3];
      const isPositive = (n: number) => n > 0;

      const result = validateBatch(items, isPositive);

      expect(result.valid).toEqual([1, 2, 3]);
      expect(result.invalid).toEqual([
        { item: -1, index: 1 },
        { item: -2, index: 3 }
      ]);
    });

    it('should handle all valid items', () => {
      const items = [1, 2, 3];
      const isPositive = (n: number) => n > 0;

      const result = validateBatch(items, isPositive);

      expect(result.valid).toEqual([1, 2, 3]);
      expect(result.invalid).toEqual([]);
    });

    it('should handle all invalid items', () => {
      const items = [-1, -2, -3];
      const isPositive = (n: number) => n > 0;

      const result = validateBatch(items, isPositive);

      expect(result.valid).toEqual([]);
      expect(result.invalid.length).toBe(3);
    });
  });
});