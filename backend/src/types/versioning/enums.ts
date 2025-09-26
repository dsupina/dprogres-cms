/**
 * Enums and Constants for Versioning System
 * Ticket: CV-002
 */

/**
 * Content types supported by the versioning system
 */
export enum ContentType {
  POST = 'post',
  PAGE = 'page'
}

/**
 * Version types for content lifecycle
 */
export enum VersionType {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  AUTO_SAVE = 'auto_save',
  ARCHIVED = 'archived'
}

/**
 * Tree-shakable constant alternatives to enums
 */
export const VersionStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  AUTO_SAVE: 'auto_save',
  ARCHIVED: 'archived'
} as const;

export type VersionStatusType = typeof VersionStatus[keyof typeof VersionStatus];

/**
 * Version error codes for standardized error handling
 */
export enum VersionErrorCode {
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SITE_MISMATCH = 'SITE_MISMATCH',
  LOCALE_NOT_SUPPORTED = 'LOCALE_NOT_SUPPORTED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  PUBLISHING_FAILED = 'PUBLISHING_FAILED',
  PREVIEW_GENERATION_FAILED = 'PREVIEW_GENERATION_FAILED'
}

/**
 * Data classification for security and privacy
 */
export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted', // PII, financial, health
  SECRET = 'secret' // Passwords, tokens, keys
}

/**
 * Isolation levels for database transactions
 */
export enum VersioningIsolationLevel {
  READ_COMMITTED = 'READ COMMITTED', // Default for most queries
  REPEATABLE_READ = 'REPEATABLE READ', // For consistent version snapshots
  SERIALIZABLE = 'SERIALIZABLE' // For critical version publishing
}

/**
 * Compliance tags for audit logging
 */
export enum ComplianceTag {
  GDPR_ACCESS = 'gdpr_access',
  GDPR_DELETION = 'gdpr_deletion',
  GDPR_EXPORT = 'gdpr_export',
  CCPA_ACCESS = 'ccpa_access',
  CCPA_DELETION = 'ccpa_deletion',
  HIPAA_ACCESS = 'hipaa_access',
  PCI_ACCESS = 'pci_access',
  SOC2_RELEVANT = 'soc2_relevant'
}