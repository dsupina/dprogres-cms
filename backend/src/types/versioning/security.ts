/**
 * Security and Privacy Types for Versioning System
 * Ticket: CV-002
 *
 * Critical security type definitions for authentication, authorization, and data protection
 */

import { DataClassification, ComplianceTag } from './enums';
import { JsonValue } from './core';

// ============================================
// Authentication & Session Management
// ============================================

/**
 * Secure session management with multi-site support
 */
export interface SecureSession {
  session_id: string;
  user_id: number;
  site_ids: number[]; // Allowed sites
  expires_at: Date;
  refresh_token_hash: string; // Never store plain refresh tokens
  ip_address: string;
  user_agent: string;
  mfa_verified: boolean;
  last_activity: Date;

  // Session security
  idle_timeout_minutes: number;
  absolute_timeout_minutes: number;
  security_flags: {
    requires_reauth_for_sensitive: boolean;
    ip_restricted: boolean;
    device_trusted: boolean;
  };
}

/**
 * API key management for service accounts
 */
export interface SecureApiKey {
  key_hash: string; // Never store plain API keys
  key_prefix: string; // First 8 chars for identification
  name: string;
  site_ids: number[];
  permissions: string[];
  rate_limit: RateLimitConfig;
  expires_at?: Date;
  last_used_at?: Date;
  created_by: number;

  // Security constraints
  ip_whitelist?: string[];
  allowed_origins?: string[];
  scope_restrictions?: ApiKeyScope[];
}

export interface ApiKeyScope {
  resource: string;
  actions: string[];
  conditions?: Record<string, JsonValue>;
}

// ============================================
// Authorization & Permissions
// ============================================

/**
 * Permission checking with site context
 */
export interface VersionPermission {
  action: 'read' | 'write' | 'publish' | 'delete' | 'approve' | 'comment';
  resource_type: 'version' | 'comment' | 'preview_token';
  resource_id: number;
  site_id: number; // REQUIRED for multi-site isolation
  user_id: number;
  granted: boolean;
  reason?: string;
  checked_at: Date;

  // Permission metadata
  inherited_from?: 'user' | 'role' | 'group';
  expires_at?: Date;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  type: 'time_based' | 'ip_based' | 'resource_state' | 'custom';
  condition: string;
  value: JsonValue;
}

/**
 * Role-based access with site scoping
 */
export interface SiteRole {
  user_id: number;
  site_id: number;
  role: 'viewer' | 'editor' | 'publisher' | 'admin' | 'owner';
  permissions: string[]; // Granular permissions
  granted_by: number;
  granted_at: Date;
  expires_at?: Date;

  // Role constraints
  restrictions?: {
    content_types?: string[];
    categories?: number[];
    max_versions?: number;
    can_delete?: boolean;
  };
}

/**
 * Permission result with detailed information
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  required_permissions?: string[];
  missing_permissions?: string[];
  suggestions?: string[]; // e.g., "Request access from admin"

  // Audit metadata
  decision_path?: string[];
  policies_evaluated?: string[];
  cache_key?: string;
}

/**
 * Permission guard function type
 */
export type PermissionGuard<T> = (
  user: SecureSession,
  resource: T,
  action: string
) => Promise<PermissionResult>;

// ============================================
// Site Isolation & Multi-Tenancy
// ============================================

/**
 * Site isolation context for data access
 */
export interface SiteIsolationContext {
  site_id: number;
  user_id: number;
  allowed_sites: number[];
  cross_site_permissions?: CrossSitePermission[];
  data_boundary: 'strict' | 'permissive'; // Strict = no cross-site access

  // Security settings
  enforce_row_level_security: boolean;
  audit_all_access: boolean;
  require_explicit_site_context: boolean;
}

export interface CrossSitePermission {
  from_site_id: number;
  to_site_id: number;
  permission_type: 'read' | 'write' | 'sync' | 'federate';
  resource_types: string[];
  granted_by: number;
  expires_at?: Date;
  audit_required: boolean;
}

/**
 * Site-scoped query enforcement
 */
export type SiteScopedQuery<T> = T & {
  site_id: number; // REQUIRED field for all queries
  __site_isolation_enforced: true; // Phantom type for compiler
};

/**
 * Site-isolated response wrapper
 */
export interface SiteIsolatedResponse<T> {
  site_id: number;
  data: T;
  isolation_verified: true;
  query_audit_id?: string;
  access_timestamp: Date;
}

// ============================================
// Data Privacy & PII Protection
// ============================================

/**
 * PII field definition and handling
 */
export interface PIIField {
  field_path: string; // JSON path to PII field
  classification: DataClassification;
  pii_type: 'email' | 'name' | 'phone' | 'ssn' | 'ip' | 'location' | 'credit_card' | 'custom';
  encryption_required: boolean;
  masking_pattern?: string; // e.g., "****@****.com"
  retention_days?: number;

  // Privacy settings
  redaction_rules?: RedactionRule[];
  anonymization_method?: 'hash' | 'tokenize' | 'generalize' | 'suppress';
}

export interface RedactionRule {
  condition: 'always' | 'export' | 'display' | 'audit';
  method: 'full' | 'partial' | 'hash';
  replacement?: string;
}

/**
 * Data retention policy enforcement
 */
export interface DataRetentionPolicy {
  version_id: number;
  retention_days: number;
  deletion_strategy: 'hard_delete' | 'soft_delete' | 'anonymize';
  legal_hold?: boolean;
  gdpr_deletion_requested?: Date;
  ccpa_deletion_requested?: Date;

  // Compliance metadata
  compliance_tags?: ComplianceTag[];
  exemptions?: RetentionExemption[];
}

export interface RetentionExemption {
  reason: 'legal_hold' | 'compliance' | 'business_critical' | 'audit';
  expires_at?: Date;
  approved_by: number;
  documentation?: string;
}

/**
 * Privacy-aware content version
 */
export interface PrivacyAwareContentVersion {
  id: number;
  site_id: number;
  pii_fields?: PIIField[];
  data_retention?: DataRetentionPolicy;
  consent_required?: ConsentRequirement[];
  anonymization_status?: AnonymizationStatus;

  // Privacy metadata
  last_privacy_review?: Date;
  privacy_risk_score?: number;
  data_subject_requests?: DataSubjectRequest[];
}

export interface ConsentRequirement {
  purpose: string;
  legal_basis: 'consent' | 'contract' | 'legal_obligation' | 'legitimate_interest';
  consent_obtained?: boolean;
  consent_timestamp?: Date;
  consent_version?: string;
}

export interface AnonymizationStatus {
  is_anonymized: boolean;
  anonymization_date?: Date;
  method: 'pseudonymization' | 'generalization' | 'suppression' | 'noise_addition';
  reversible: boolean;
}

export interface DataSubjectRequest {
  request_type: 'access' | 'deletion' | 'portability' | 'rectification';
  requested_date: Date;
  completed_date?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
}

// ============================================
// Audit Logging & Compliance
// ============================================

/**
 * Comprehensive audit log entry
 */
export interface AuditLogEntry {
  id: string; // UUID
  timestamp: Date;
  user_id?: number;
  service_account_id?: string;
  ip_address: string;
  user_agent?: string;
  site_id: number;
  action: AuditAction;
  resource_type: string;
  resource_id?: string | number;
  changes?: AuditChanges;
  result: 'success' | 'failure' | 'partial';
  error_message?: string;
  security_context?: SecurityContext;
  compliance_tags?: ComplianceTag[];

  // Forensic data
  request_id?: string;
  session_id?: string;
  correlation_id?: string;
  threat_indicators?: ThreatIndicator[];
}

export interface AuditAction {
  category: 'auth' | 'content' | 'admin' | 'system' | 'security';
  operation: string; // e.g., 'login', 'publish_version', 'delete_user'
  severity: 'low' | 'medium' | 'high' | 'critical';
  requires_review?: boolean;
  suspicious?: boolean;
}

export interface AuditChanges {
  before?: Record<string, JsonValue>; // Previous state (exclude secrets)
  after?: Record<string, JsonValue>; // New state (exclude secrets)
  fields_changed: string[];
  sensitive_fields_changed?: boolean; // Flag without exposing
}

export interface SecurityContext {
  mfa_used: boolean;
  session_age_minutes: number;
  permission_checks: PermissionCheck[];
  rate_limit_remaining?: number;
  threat_score?: number;
}

export interface PermissionCheck {
  permission: string;
  granted: boolean;
  reason?: string;
  policy_id?: string;
}

export interface ThreatIndicator {
  type: 'brute_force' | 'sql_injection' | 'xss' | 'csrf' | 'suspicious_pattern';
  confidence: 'low' | 'medium' | 'high';
  details?: string;
}

// ============================================
// Rate Limiting & DoS Protection
// ============================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  burst_size?: number;
  cooldown_minutes?: number;

  // Advanced settings
  sliding_window?: boolean;
  distributed?: boolean; // For multi-instance deployments
  bypass_tokens?: string[];
}

/**
 * Rate limit state tracking
 */
export interface RateLimitState {
  key: string; // User ID or IP
  window_start: Date;
  request_count: number;
  limit: number;
  remaining: number;
  reset_at: Date;
  blocked_until?: Date;
  violation_count?: number;

  // Rate limit metadata
  last_request?: Date;
  average_interval_ms?: number;
  suspicious_patterns?: string[];
}

/**
 * DoS protection patterns
 */
export interface DosProtection {
  max_request_size: number; // bytes
  max_json_depth: number;
  max_array_length: number;
  max_string_length: number;
  timeout_ms: number;
  circuit_breaker?: CircuitBreakerConfig;

  // Pattern detection
  suspicious_patterns?: RegExp[];
  blocked_user_agents?: string[];
  geo_blocking?: GeoBlockingConfig;
}

export interface CircuitBreakerConfig {
  failure_threshold: number;
  recovery_timeout_ms: number;
  monitoring_window_ms: number;
  half_open_requests: number;
}

export interface GeoBlockingConfig {
  allowed_countries?: string[];
  blocked_countries?: string[];
  require_verification_countries?: string[];
}

// ============================================
// Encryption & Secrets Management
// ============================================

/**
 * Field-level encryption metadata
 */
export interface EncryptedField {
  field_path: string;
  encryption_key_id: string;
  algorithm: 'AES-256-GCM' | 'AES-256-CBC' | 'ChaCha20-Poly1305';
  encrypted_at: Date;
  rotated_at?: Date;

  // Encryption metadata
  iv?: string; // Initialization vector
  auth_tag?: string; // For authenticated encryption
  key_derivation?: 'PBKDF2' | 'Argon2' | 'scrypt';
}

/**
 * Secret reference (never store actual secrets)
 */
export interface SecretReference {
  secret_id: string;
  secret_type: 'api_key' | 'password' | 'token' | 'certificate' | 'encryption_key';
  vault_path: string; // External secret manager path
  version?: number;
  expires_at?: Date;
  rotation_schedule?: string; // Cron expression

  // Access control
  allowed_services?: string[];
  require_mfa_for_access?: boolean;
}

// ============================================
// Security Validation
// ============================================

/**
 * Input validation rules
 */
export interface ValidationRule {
  field: string;
  rules: {
    required?: boolean;
    max_length?: number;
    min_length?: number;
    pattern?: string; // Regex pattern
    sanitize?: boolean;
    escape_html?: boolean;
    allowed_values?: JsonValue[];
    custom?: (value: JsonValue) => boolean;
  };

  // Security rules
  no_sql_keywords?: boolean;
  no_script_tags?: boolean;
  no_executable_content?: boolean;
}

/**
 * Validation error for security issues
 */
export interface SecurityValidationError {
  field: string;
  code: 'xss' | 'sql_injection' | 'path_traversal' | 'command_injection' | 'invalid_format';
  message: string;
  user_message: string;
  severity: 'error' | 'warning';
  blocked: boolean;
  sanitized_value?: JsonValue;
}

/**
 * Content Security Policy configuration
 */
export interface CSPConfig {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'connect-src': string[];
  'font-src': string[];
  'frame-src': string[];
  'report-uri'?: string;
  'report-to'?: string;

  // CSP directives
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
}

/**
 * Security headers configuration
 */
export interface SecurityHeaders {
  'Content-Security-Policy': string;
  'X-Frame-Options': 'DENY' | 'SAMEORIGIN';
  'X-Content-Type-Options': 'nosniff';
  'Strict-Transport-Security': string;
  'X-XSS-Protection': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
}

// ============================================
// Compliance & Regulatory
// ============================================

/**
 * GDPR compliance tracking
 */
export interface GDPRCompliance {
  user_id: number;
  consent_given: boolean;
  consent_timestamp?: Date;
  consent_version: string;
  purposes: string[];
  withdrawal_timestamp?: Date;
  deletion_requested?: Date;
  deletion_completed?: Date;
  export_requested?: Date;
  export_completed?: Date;

  // Lawful basis
  lawful_basis?: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  legitimate_interests_assessment?: string;
}

/**
 * CCPA compliance tracking
 */
export interface CCPACompliance {
  user_id: number;
  opted_out: boolean;
  opt_out_timestamp?: Date;
  deletion_requested?: Date;
  deletion_completed?: Date;
  categories_collected: string[];
  sale_opt_out?: boolean;

  // California-specific
  financial_incentive_opted_in?: boolean;
  authorized_agent?: string;
}

// Export types - no default export needed for interfaces