import { DataClassification, ComplianceTag } from './enums';
import { JsonValue } from './core';
export interface SecureSession {
    session_id: string;
    user_id: number;
    site_ids: number[];
    expires_at: Date;
    refresh_token_hash: string;
    ip_address: string;
    user_agent: string;
    mfa_verified: boolean;
    last_activity: Date;
    idle_timeout_minutes: number;
    absolute_timeout_minutes: number;
    security_flags: {
        requires_reauth_for_sensitive: boolean;
        ip_restricted: boolean;
        device_trusted: boolean;
    };
}
export interface SecureApiKey {
    key_hash: string;
    key_prefix: string;
    name: string;
    site_ids: number[];
    permissions: string[];
    rate_limit: RateLimitConfig;
    expires_at?: Date;
    last_used_at?: Date;
    created_by: number;
    ip_whitelist?: string[];
    allowed_origins?: string[];
    scope_restrictions?: ApiKeyScope[];
}
export interface ApiKeyScope {
    resource: string;
    actions: string[];
    conditions?: Record<string, JsonValue>;
}
export interface VersionPermission {
    action: 'read' | 'write' | 'publish' | 'delete' | 'approve' | 'comment';
    resource_type: 'version' | 'comment' | 'preview_token';
    resource_id: number;
    site_id: number;
    user_id: number;
    granted: boolean;
    reason?: string;
    checked_at: Date;
    inherited_from?: 'user' | 'role' | 'group';
    expires_at?: Date;
    conditions?: PermissionCondition[];
}
export interface PermissionCondition {
    type: 'time_based' | 'ip_based' | 'resource_state' | 'custom';
    condition: string;
    value: JsonValue;
}
export interface SiteRole {
    user_id: number;
    site_id: number;
    role: 'viewer' | 'editor' | 'publisher' | 'admin' | 'owner';
    permissions: string[];
    granted_by: number;
    granted_at: Date;
    expires_at?: Date;
    restrictions?: {
        content_types?: string[];
        categories?: number[];
        max_versions?: number;
        can_delete?: boolean;
    };
}
export interface PermissionResult {
    allowed: boolean;
    reason?: string;
    required_permissions?: string[];
    missing_permissions?: string[];
    suggestions?: string[];
    decision_path?: string[];
    policies_evaluated?: string[];
    cache_key?: string;
}
export type PermissionGuard<T> = (user: SecureSession, resource: T, action: string) => Promise<PermissionResult>;
export interface SiteIsolationContext {
    site_id: number;
    user_id: number;
    allowed_sites: number[];
    cross_site_permissions?: CrossSitePermission[];
    data_boundary: 'strict' | 'permissive';
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
export type SiteScopedQuery<T> = T & {
    site_id: number;
    __site_isolation_enforced: true;
};
export interface SiteIsolatedResponse<T> {
    site_id: number;
    data: T;
    isolation_verified: true;
    query_audit_id?: string;
    access_timestamp: Date;
}
export interface PIIField {
    field_path: string;
    classification: DataClassification;
    pii_type: 'email' | 'name' | 'phone' | 'ssn' | 'ip' | 'location' | 'credit_card' | 'custom';
    encryption_required: boolean;
    masking_pattern?: string;
    retention_days?: number;
    redaction_rules?: RedactionRule[];
    anonymization_method?: 'hash' | 'tokenize' | 'generalize' | 'suppress';
}
export interface RedactionRule {
    condition: 'always' | 'export' | 'display' | 'audit';
    method: 'full' | 'partial' | 'hash';
    replacement?: string;
}
export interface DataRetentionPolicy {
    version_id: number;
    retention_days: number;
    deletion_strategy: 'hard_delete' | 'soft_delete' | 'anonymize';
    legal_hold?: boolean;
    gdpr_deletion_requested?: Date;
    ccpa_deletion_requested?: Date;
    compliance_tags?: ComplianceTag[];
    exemptions?: RetentionExemption[];
}
export interface RetentionExemption {
    reason: 'legal_hold' | 'compliance' | 'business_critical' | 'audit';
    expires_at?: Date;
    approved_by: number;
    documentation?: string;
}
export interface PrivacyAwareContentVersion {
    id: number;
    site_id: number;
    pii_fields?: PIIField[];
    data_retention?: DataRetentionPolicy;
    consent_required?: ConsentRequirement[];
    anonymization_status?: AnonymizationStatus;
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
export interface AuditLogEntry {
    id: string;
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
    request_id?: string;
    session_id?: string;
    correlation_id?: string;
    threat_indicators?: ThreatIndicator[];
}
export interface AuditAction {
    category: 'auth' | 'content' | 'admin' | 'system' | 'security';
    operation: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    requires_review?: boolean;
    suspicious?: boolean;
}
export interface AuditChanges {
    before?: Record<string, JsonValue>;
    after?: Record<string, JsonValue>;
    fields_changed: string[];
    sensitive_fields_changed?: boolean;
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
export interface RateLimitConfig {
    requests_per_minute?: number;
    requests_per_hour?: number;
    requests_per_day?: number;
    burst_size?: number;
    cooldown_minutes?: number;
    sliding_window?: boolean;
    distributed?: boolean;
    bypass_tokens?: string[];
}
export interface RateLimitState {
    key: string;
    window_start: Date;
    request_count: number;
    limit: number;
    remaining: number;
    reset_at: Date;
    blocked_until?: Date;
    violation_count?: number;
    last_request?: Date;
    average_interval_ms?: number;
    suspicious_patterns?: string[];
}
export interface DosProtection {
    max_request_size: number;
    max_json_depth: number;
    max_array_length: number;
    max_string_length: number;
    timeout_ms: number;
    circuit_breaker?: CircuitBreakerConfig;
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
export interface EncryptedField {
    field_path: string;
    encryption_key_id: string;
    algorithm: 'AES-256-GCM' | 'AES-256-CBC' | 'ChaCha20-Poly1305';
    encrypted_at: Date;
    rotated_at?: Date;
    iv?: string;
    auth_tag?: string;
    key_derivation?: 'PBKDF2' | 'Argon2' | 'scrypt';
}
export interface SecretReference {
    secret_id: string;
    secret_type: 'api_key' | 'password' | 'token' | 'certificate' | 'encryption_key';
    vault_path: string;
    version?: number;
    expires_at?: Date;
    rotation_schedule?: string;
    allowed_services?: string[];
    require_mfa_for_access?: boolean;
}
export interface ValidationRule {
    field: string;
    rules: {
        required?: boolean;
        max_length?: number;
        min_length?: number;
        pattern?: string;
        sanitize?: boolean;
        escape_html?: boolean;
        allowed_values?: JsonValue[];
        custom?: (value: JsonValue) => boolean;
    };
    no_sql_keywords?: boolean;
    no_script_tags?: boolean;
    no_executable_content?: boolean;
}
export interface SecurityValidationError {
    field: string;
    code: 'xss' | 'sql_injection' | 'path_traversal' | 'command_injection' | 'invalid_format';
    message: string;
    user_message: string;
    severity: 'error' | 'warning';
    blocked: boolean;
    sanitized_value?: JsonValue;
}
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
    'upgrade-insecure-requests'?: boolean;
    'block-all-mixed-content'?: boolean;
}
export interface SecurityHeaders {
    'Content-Security-Policy': string;
    'X-Frame-Options': 'DENY' | 'SAMEORIGIN';
    'X-Content-Type-Options': 'nosniff';
    'Strict-Transport-Security': string;
    'X-XSS-Protection': string;
    'Referrer-Policy': string;
    'Permissions-Policy': string;
}
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
    lawful_basis?: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
    legitimate_interests_assessment?: string;
}
export interface CCPACompliance {
    user_id: number;
    opted_out: boolean;
    opt_out_timestamp?: Date;
    deletion_requested?: Date;
    deletion_completed?: Date;
    categories_collected: string[];
    sale_opt_out?: boolean;
    financial_incentive_opted_in?: boolean;
    authorized_agent?: string;
}
//# sourceMappingURL=security.d.ts.map