/**
 * Core Content Versioning Type Definitions
 * Ticket: CV-002
 *
 * Enhanced core interfaces with multi-site support, security, and performance optimizations
 */

import { ContentType, VersionType } from './enums';
import type { RateLimitConfig } from './security';

// ============================================
// Core Version Types with Multi-Site Support
// ============================================

/**
 * Enhanced content version with full multi-site context and performance hints
 */
export interface ContentVersion {
  id: number;

  // Multi-site context (REQUIRED for data isolation)
  site_id: number;
  locale: string;
  domain_context?: {
    primary_domain: string;
    preview_domains: string[];
  };

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

  // Strongly-typed JSONB data
  data: ContentVersionData | null;
  meta_data: ContentMetaData | null;

  // Authorship and timing
  created_by: number;
  created_at: Date;
  published_at: Date | null;

  // Change tracking
  change_summary: string | null;
  diff_from_previous: VersionDiff | null;

  // Performance hints
  performance_hints?: {
    content_size: number;
    estimated_render_time: number;
    cache_tags: string[];
  };

  // Workflow integration
  workflow_state?: {
    current_stage: WorkflowStage;
    approvals_required: number;
    approvals_received: number;
    next_actions: WorkflowAction[];
  };

  // Relations (populated when needed)
  author?: UserReference;
  comments?: VersionComment[];
  preview_tokens?: PreviewToken[];
  activity_logs?: VersionActivityLog[];
}

/**
 * Discriminated unions for type-safe version states
 */
export type DraftVersion = ContentVersion & {
  version_type: VersionType.DRAFT;
  is_current_draft: true;
  published_at: null;
};

export type PublishedVersion = ContentVersion & {
  version_type: VersionType.PUBLISHED;
  is_current_published: boolean;
  published_at: Date;
};

export type AutoSaveVersion = ContentVersion & {
  version_type: VersionType.AUTO_SAVE;
  is_current_draft: false;
  is_current_published: false;
};

export type ArchivedVersion = ContentVersion & {
  version_type: VersionType.ARCHIVED;
  is_current_draft: false;
  is_current_published: false;
};

export type ContentVersionUnion = DraftVersion | PublishedVersion | AutoSaveVersion | ArchivedVersion;

/**
 * Strongly-typed JSONB content data
 */
export interface ContentVersionData {
  // Site-specific content data
  theme_overrides?: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    layouts?: string[];
  };

  // Custom fields per site/locale
  custom_fields?: Record<string, JsonValue>;

  // A/B testing data
  ab_test_data?: {
    variant_id?: string;
    test_id?: string;
    conversion_goals?: string[];
  };

  // Analytics tracking
  analytics?: {
    ga_tracking_id?: string;
    custom_events?: Array<{
      event_name: string;
      parameters: Record<string, string | number>;
    }>;
  };

  // Page/Post specific data
  components?: ComponentData[];
  blocks?: BlockData[];
  widgets?: WidgetData[];
}

/**
 * SEO and metadata
 */
export interface ContentMetaData {
  // SEO fields
  meta_title?: string;
  meta_description?: string;
  og_image?: string;
  og_title?: string;
  og_description?: string;
  twitter_card?: 'summary' | 'summary_large_image';
  canonical_url?: string;
  noindex?: boolean;
  nofollow?: boolean;

  // Content metadata
  featured_image?: string;
  category_id?: number;
  tags?: string[];
  featured?: boolean;
  view_count?: number;

  // Template and layout
  template?: string;
  layout?: string;
}

/**
 * Version difference tracking
 */
export interface VersionDiff {
  field: string;
  old_value: JsonValue;
  new_value: JsonValue;
  change_type: 'added' | 'modified' | 'deleted';
}

/**
 * User reference for relations
 */
export interface UserReference {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

/**
 * Site reference for multi-site context
 */
export interface SiteReference {
  id: number;
  domain_id: number;
  name: string;
  base_path: string;
  primary_domain: string;
}

// ============================================
// Preview Token Types
// ============================================

/**
 * Enhanced secure preview token with multi-site support
 */
export interface PreviewToken {
  id: number;

  // Multi-site context
  site_id: number;
  domain_id?: number;
  locale?: string;

  // Token details
  version_id: number;
  token: string; // Should be hashed in database
  token_type: TokenType;

  // Access control
  created_by: number;
  created_at: Date;
  expires_at: Date;
  max_uses?: number;
  use_count: number;

  // Security settings
  password_protected: boolean;
  ip_whitelist?: string[];
  require_auth: boolean;
  allowed_users?: number[];

  // Activity tracking
  last_accessed_at?: Date;
  is_active: boolean;
  revoked?: boolean;
  revoked_by?: number;
  revoked_at?: Date;

  // Custom settings
  custom_settings?: {
    show_toolbar?: boolean;
    allow_comments?: boolean;
    watermark?: boolean;
    custom_css?: string;
  };

  // Metadata
  metadata?: Record<string, JsonValue>;

  // Relations
  version?: ContentVersion;
  access_logs?: PreviewAccessLog[];
}

/**
 * Secure preview token with additional security fields
 */
export interface SecurePreviewToken extends PreviewToken {
  token_hash: string; // Never store plain tokens
  token_prefix: string; // First 8 chars for identification
  password_hash?: string; // Optional password protection
  rate_limit?: RateLimitConfig;
  audit_log?: PreviewAccessLog[];
}

// ============================================
// Version Comment Types
// ============================================

/**
 * Version comment with threading support
 */
export interface VersionComment {
  id: number;

  // Multi-site context
  site_id: number;

  // Comment reference
  version_id: number;
  parent_id?: number;

  // Comment content
  comment_text: string;
  comment_type: CommentType;

  // Positioning (for inline comments)
  line_number?: number;
  field_path?: string; // JSON path for structured content

  // Status tracking
  status: CommentStatus;
  resolved_by?: number;
  resolved_at?: Date;

  // PII protection
  contains_pii?: boolean;
  pii_fields?: string[];

  // Authorship
  created_by: number;
  created_at: Date;
  updated_at: Date;

  // Relations
  author?: UserReference;
  replies?: VersionComment[];
}

// ============================================
// Activity and Audit Types
// ============================================

/**
 * Version activity log entry
 */
export interface VersionActivityLog {
  id: number;
  site_id: number;
  version_id: number;
  action: VersionAction;
  user_id: number;
  created_at: Date;
  details: Record<string, JsonValue>;
}

/**
 * Preview access log entry
 */
export interface PreviewAccessLog {
  id: number;
  token_id: number;
  accessed_at: Date;
  ip_address: string;
  user_agent: string;
  user_id?: number;
  success: boolean;
  failure_reason?: string;
}

// ============================================
// Helper Types
// ============================================

/**
 * Workflow stages for content lifecycle
 */
export enum WorkflowStage {
  DRAFT = 'draft',
  REVIEW = 'review',
  APPROVED = 'approved',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

/**
 * Workflow actions available
 */
export enum WorkflowAction {
  EDIT = 'edit',
  SUBMIT_FOR_REVIEW = 'submit_for_review',
  APPROVE = 'approve',
  REJECT = 'reject',
  PUBLISH = 'publish',
  UNPUBLISH = 'unpublish',
  ARCHIVE = 'archive'
}

/**
 * Version actions for audit logging
 */
export enum VersionAction {
  CREATED = 'created',
  UPDATED = 'updated',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
  ARCHIVED = 'archived',
  RESTORED = 'restored',
  DELETED = 'deleted',
  COMMENT_ADDED = 'comment_added',
  COMMENT_RESOLVED = 'comment_resolved'
}

/**
 * Comment types enum
 */
export enum CommentType {
  GENERAL = 'general',
  SUGGESTION = 'suggestion',
  ISSUE = 'issue',
  APPROVAL = 'approval',
  REJECTION = 'rejection',
  CHANGE_REQUEST = 'change_request'
}

/**
 * Comment status enum
 */
export enum CommentStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived'
}

/**
 * Token types enum
 */
export enum TokenType {
  PREVIEW = 'preview',
  SHARE = 'share',
  EMBED = 'embed'
}

/**
 * Component data for structured content
 */
export interface ComponentData {
  id: string;
  type: string;
  props: Record<string, JsonValue>;
  children?: ComponentData[];
}

/**
 * Block data for block-based content
 */
export interface BlockData {
  id: string;
  type: string;
  data: Record<string, JsonValue>;
  position: number;
}

/**
 * Widget data for sidebar/footer widgets
 */
export interface WidgetData {
  id: string;
  type: string;
  zone: string;
  settings: Record<string, JsonValue>;
  position: number;
}

// RateLimitConfig moved to security.ts to avoid duplication

/**
 * JSON value types for JSONB fields
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Compact version for list views
 */
export interface CompactContentVersion {
  id: number;
  site_id: number;
  title: string;
  version_type: VersionType;
  version_number: number;
  created_at: string; // ISO string for smaller payload
  created_by: number;
  is_current: boolean;
}

export default ContentVersion;