/**
 * Content Versioning System Type Definitions
 * Ticket: CV-001
 *
 * This module defines all TypeScript types and interfaces for the
 * content versioning and draft preview system, aligned with the database schema.
 */

// ============================================
// Enums and Constants
// ============================================

export enum ContentType {
  POST = 'post',
  PAGE = 'page'
}

export enum VersionType {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  AUTO_SAVE = 'auto_save',
  ARCHIVED = 'archived'
}

export enum TokenType {
  PREVIEW = 'preview',
  SHARE = 'share',
  EMBED = 'embed'
}

export enum CommentType {
  GENERAL = 'general',
  SUGGESTION = 'suggestion',
  ISSUE = 'issue',
  APPROVAL = 'approval'
}

export enum CommentStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived'
}

// ============================================
// Core Version Types
// ============================================

/**
 * Represents a content version record (maps to content_versions table)
 */
export interface ContentVersion {
  id: number;

  // Site context (multi-site support)
  site_id: number;
  locale?: string;

  // Content reference
  content_type: ContentType;
  content_id: number;

  // Version metadata
  version_number: number;
  version_type: VersionType;
  is_current_draft: boolean;
  is_current_published: boolean;

  // Content snapshot
  title: string;
  slug: string | null;
  content: string | null;
  excerpt: string | null;
  data: Record<string, any> | null; // JSONB for flexible content
  meta_data: Record<string, any> | null; // JSONB for SEO, featured image, etc.

  // Authorship and timing
  created_by: number;
  created_at: Date;
  published_at: Date | null;

  // Change tracking
  change_summary: string | null;
  diff_from_previous: Record<string, any> | null;
  content_hash: string | null; // SHA-256 hash for auto-save change detection

  // Relations (populated when needed)
  author?: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  comments?: VersionComment[];
}

/**
 * Input for creating a new version
 */
export interface CreateVersionInput {
  site_id: number;
  locale?: string;
  content_type: ContentType;
  content_id: number;
  version_type?: VersionType;
  title: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  data?: Record<string, any>;
  meta_data?: Record<string, any>;
  change_summary?: string;
  is_current_draft?: boolean;
  is_current_published?: boolean;
}

/**
 * Input for updating a version
 */
export interface UpdateVersionInput {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  data?: Record<string, any>;
  meta_data?: Record<string, any>;
  change_summary?: string;
  version_type?: VersionType;
  is_current_draft?: boolean;
  is_current_published?: boolean;
}

/**
 * Options for querying version history
 */
export interface VersionHistoryOptions {
  site_id?: number;
  locale?: string;
  content_type?: ContentType;
  content_id?: number;
  version_type?: VersionType;
  created_by?: number;
  is_current?: boolean;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'version_number';
  order_direction?: 'ASC' | 'DESC';
  include_auto_saves?: boolean;
  include_drafts?: boolean;
  published_only?: boolean;
}

// ============================================
// Preview Token Types
// ============================================

/**
 * Represents a preview token record (maps to preview_tokens table)
 */
export interface PreviewToken {
  id: number;

  // Site and domain context
  site_id: number;
  domain_id?: number;
  locale?: string;

  // Token details
  token: string;
  token_type: TokenType;

  // Version reference
  version_id: number;

  // Access control
  created_by: number;
  expires_at: Date;
  max_uses: number | null;
  use_count: number;

  // Security
  password_protected: boolean;
  password_hash: string | null;
  allowed_ips: string[] | null;
  settings: Record<string, any> | null;

  // Tracking
  created_at: Date;
  last_used_at: Date | null;

  // Relations (populated when needed)
  version?: ContentVersion;
  creator?: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

/**
 * Input for generating a preview token
 */
export interface GeneratePreviewTokenInput {
  site_id: number;
  domain_id?: number;
  locale?: string;
  version_id: number;
  token_type?: TokenType;
  expires_in_hours?: number; // Default: 24
  max_uses?: number;
  password?: string;
  allowed_ips?: string[];
  settings?: Record<string, any>;
}

/**
 * Preview token validation result
 */
export interface PreviewTokenValidation {
  valid: boolean;
  requires_password: boolean;
  expired: boolean;
  exceeded_uses: boolean;
  ip_restricted: boolean;
  version?: ContentVersion;
  error?: string;
}

// ============================================
// Version Comment Types
// ============================================

/**
 * Represents a version comment (maps to version_comments table)
 */
export interface VersionComment {
  id: number;

  // Site context
  site_id: number;

  // Version reference
  version_id: number;

  // Comment hierarchy
  parent_comment_id: number | null;

  // Content
  comment_text: string;
  comment_type: CommentType;

  // Status
  status: CommentStatus;
  resolved_at: Date | null;
  resolved_by: number | null;

  // Authorship
  created_by: number;
  created_at: Date;
  updated_at: Date;

  // Position reference for inline comments
  position_data: Record<string, any> | null;

  // Relations (populated when needed)
  author?: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  resolver?: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  replies?: VersionComment[];
}

/**
 * Input for creating a comment
 */
export interface CreateCommentInput {
  version_id: number;
  parent_comment_id?: number;
  comment_text: string;
  comment_type?: CommentType;
  position_data?: Record<string, any>;
}

/**
 * Input for updating a comment
 */
export interface UpdateCommentInput {
  comment_text?: string;
  status?: CommentStatus;
  position_data?: Record<string, any>;
}

// ============================================
// Version Comparison Types
// ============================================

/**
 * Represents a diff between two versions
 */
export interface VersionComparison {
  version_a: ContentVersion;
  version_b: ContentVersion;
  diffs: VersionDiff[];
}

/**
 * Individual field change in a diff
 */
export interface VersionDiff {
  field: string;
  old_value: any;
  new_value: any;
  change_type: 'added' | 'modified' | 'deleted';
}

/**
 * Field change tracking (alias for VersionDiff)
 */
export type FieldChange = VersionDiff;

// ============================================
// Utility Types
// ============================================

/**
 * Type guards for runtime type checking
 */
export function isContentVersion(obj: any): obj is ContentVersion {
  return obj &&
    typeof obj.id === 'number' &&
    ['post', 'page'].includes(obj.content_type) &&
    typeof obj.content_id === 'number' &&
    typeof obj.version_number === 'number';
}

export function isPreviewToken(obj: any): obj is PreviewToken {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.token === 'string' &&
    typeof obj.version_id === 'number';
}

export function isVersionComment(obj: any): obj is VersionComment {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.version_id === 'number' &&
    typeof obj.comment_text === 'string';
}

// ============================================
// Service Response Types
// ============================================

/**
 * Error codes for service responses
 */
export enum ServiceErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',           // 400
  NOT_FOUND = 'NOT_FOUND',                         // 404
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',               // 403
  UNAUTHORIZED = 'UNAUTHORIZED',                   // 401
  FORBIDDEN = 'FORBIDDEN',                         // 403

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',               // 500
  DATABASE_ERROR = 'DATABASE_ERROR',               // 500
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',     // 503
}

/**
 * Standard service response wrapper
 */
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: ServiceErrorCode;
  metadata?: Record<string, any>;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ============================================
// Database Helper Functions (for use in backend services)
// ============================================

/**
 * Helper function names that will be available via PostgreSQL
 */
export interface DatabaseFunctions {
  get_next_version_number: (content_type: string, content_id: number) => number;
  generate_preview_token: () => string;
}