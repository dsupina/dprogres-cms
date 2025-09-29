/**
 * Type Guard Functions for Runtime Validation
 * Ticket: CV-002
 *
 * Runtime type checking and validation functions
 */

import {
  ContentVersion,
  PreviewToken,
  VersionComment,
  JsonValue
} from './core';
import { ContentType, VersionType } from './enums';

// ============================================
// Core Type Guards
// ============================================

/**
 * Check if a value is a valid ContentVersion
 */
export function isContentVersion(value: unknown): value is ContentVersion {
  if (!value || typeof value !== 'object') return false;

  const v = value as any;

  return (
    typeof v.id === 'number' &&
    typeof v.site_id === 'number' &&
    isContentType(v.content_type) &&
    typeof v.content_id === 'number' &&
    typeof v.version_number === 'number' &&
    isVersionType(v.version_type) &&
    typeof v.is_current_draft === 'boolean' &&
    typeof v.is_current_published === 'boolean' &&
    typeof v.title === 'string' &&
    typeof v.created_by === 'number' &&
    v.created_at instanceof Date
  );
}

/**
 * Check if a value is a valid PreviewToken
 */
export function isPreviewToken(value: unknown): value is PreviewToken {
  if (!value || typeof value !== 'object') return false;

  const v = value as any;

  return (
    typeof v.id === 'number' &&
    typeof v.site_id === 'number' &&
    typeof v.version_id === 'number' &&
    typeof v.token === 'string' &&
    typeof v.created_by === 'number' &&
    v.created_at instanceof Date &&
    v.expires_at instanceof Date &&
    typeof v.use_count === 'number' &&
    typeof v.is_active === 'boolean'
  );
}

/**
 * Check if a value is a valid VersionComment
 */
export function isVersionComment(value: unknown): value is VersionComment {
  if (!value || typeof value !== 'object') return false;

  const v = value as any;

  return (
    typeof v.id === 'number' &&
    typeof v.site_id === 'number' &&
    typeof v.version_id === 'number' &&
    typeof v.comment_text === 'string' &&
    typeof v.created_by === 'number' &&
    v.created_at instanceof Date &&
    v.updated_at instanceof Date
  );
}

// ============================================
// Enum Type Guards
// ============================================

/**
 * Check if a value is a valid ContentType
 */
export function isContentType(value: unknown): value is ContentType {
  return value === ContentType.POST || value === ContentType.PAGE;
}

/**
 * Check if a value is a valid VersionType
 */
export function isVersionType(value: unknown): value is VersionType {
  return (
    value === VersionType.DRAFT ||
    value === VersionType.PUBLISHED ||
    value === VersionType.AUTO_SAVE ||
    value === VersionType.ARCHIVED
  );
}

// ============================================
// JSON Value Guards
// ============================================

/**
 * Check if a value is a valid JsonValue
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;

  const type = typeof value;

  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (type === 'object') {
    // Check for Date, RegExp, and other non-plain objects
    if (value instanceof Date || value instanceof RegExp) {
      return false;
    }

    // Check for plain object
    if (Object.prototype.toString.call(value) !== '[object Object]') {
      return false;
    }

    const obj = value as Record<string, unknown>;
    return Object.values(obj).every(isJsonValue);
  }

  return false;
}

// ============================================
// Site Context Guards
// ============================================

/**
 * Check if a query has required site context
 */
export function hasSiteContext<T extends object>(query: T): query is T & { site_id: number } {
  return 'site_id' in query && typeof (query as any).site_id === 'number';
}

/**
 * Ensure site isolation is enforced
 */
export function ensureSiteIsolation<T extends object>(
  query: T,
  allowed_sites: number[]
): T & { site_id: number } {
  if (!hasSiteContext(query)) {
    throw new Error('Site context is required for all queries');
  }

  const siteQuery = query as T & { site_id: number };

  if (!allowed_sites.includes(siteQuery.site_id)) {
    throw new Error(`Access denied to site ${siteQuery.site_id}`);
  }

  return siteQuery;
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate required fields are present
 */
export function validateRequiredFields<T extends object>(
  obj: T,
  requiredFields: (keyof T)[]
): obj is T {
  return requiredFields.every(field => field in obj && obj[field] != null);
}

/**
 * Validate string length constraints
 */
export function validateStringLength(
  value: string,
  min: number,
  max: number
): boolean {
  return value.length >= min && value.length <= max;
}

/**
 * Validate array constraints
 */
export function validateArray<T>(
  arr: T[],
  minLength: number,
  maxLength: number,
  itemValidator?: (item: T) => boolean
): boolean {
  if (arr.length < minLength || arr.length > maxLength) {
    return false;
  }

  if (itemValidator) {
    return arr.every(itemValidator);
  }

  return true;
}

// ============================================
// Sanitization Helpers
// ============================================

/**
 * Sanitize HTML content
 */
export function sanitizeHtml(html: string): string {
  // Basic HTML sanitization - in production use a library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * Sanitize file paths
 */
export function sanitizeFilePath(path: string): string {
  // Remove path traversal attempts
  return path
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/[^a-zA-Z0-9_\-./]/g, '');
}

/**
 * Sanitize SQL identifiers
 */
export function sanitizeSqlIdentifier(identifier: string): string {
  // Only allow alphanumeric and underscores
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}

// ============================================
// Type Narrowing
// ============================================

/**
 * Narrow ContentVersion to DraftVersion
 */
export function isDraftVersion(version: ContentVersion): version is ContentVersion & {
  version_type: VersionType.DRAFT;
  is_current_draft: true;
  published_at: null;
} {
  return (
    version.version_type === VersionType.DRAFT &&
    version.is_current_draft === true &&
    version.published_at === null
  );
}

/**
 * Narrow ContentVersion to PublishedVersion
 */
export function isPublishedVersion(version: ContentVersion): version is ContentVersion & {
  version_type: VersionType.PUBLISHED;
  is_current_published: boolean;
  published_at: Date;
} {
  return (
    version.version_type === VersionType.PUBLISHED &&
    version.published_at !== null
  );
}

// ============================================
// Batch Validation
// ============================================

/**
 * Validate multiple items with error collection
 */
export function validateBatch<T>(
  items: T[],
  validator: (item: T) => boolean
): {
  valid: T[];
  invalid: Array<{ item: T; index: number }>;
} {
  const valid: T[] = [];
  const invalid: Array<{ item: T; index: number }> = [];

  items.forEach((item, index) => {
    if (validator(item)) {
      valid.push(item);
    } else {
      invalid.push({ item, index });
    }
  });

  return { valid, invalid };
}

// ============================================
// Export All Guards
// ============================================

export default {
  // Core guards
  isContentVersion,
  isPreviewToken,
  isVersionComment,

  // Enum guards
  isContentType,
  isVersionType,

  // JSON guards
  isJsonValue,

  // Site context
  hasSiteContext,
  ensureSiteIsolation,

  // Validation helpers
  validateRequiredFields,
  validateStringLength,
  validateArray,

  // Sanitization
  sanitizeHtml,
  sanitizeFilePath,
  sanitizeSqlIdentifier,

  // Type narrowing
  isDraftVersion,
  isPublishedVersion,

  // Batch operations
  validateBatch
};