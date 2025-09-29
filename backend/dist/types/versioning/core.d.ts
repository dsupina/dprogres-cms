import { ContentType, VersionType } from './enums';
import type { RateLimitConfig } from './security';
export interface ContentVersion {
    id: number;
    site_id: number;
    locale: string;
    domain_context?: {
        primary_domain: string;
        preview_domains: string[];
    };
    content_type: ContentType;
    content_id: number;
    version_number: number;
    version_type: VersionType;
    is_current_draft: boolean;
    is_current_published: boolean;
    title: string;
    slug: string | null;
    content: string | null;
    excerpt: string | null;
    data: ContentVersionData | null;
    meta_data: ContentMetaData | null;
    created_by: number;
    created_at: Date;
    published_at: Date | null;
    change_summary: string | null;
    diff_from_previous: VersionDiff | null;
    performance_hints?: {
        content_size: number;
        estimated_render_time: number;
        cache_tags: string[];
    };
    workflow_state?: {
        current_stage: WorkflowStage;
        approvals_required: number;
        approvals_received: number;
        next_actions: WorkflowAction[];
    };
    author?: UserReference;
    comments?: VersionComment[];
    preview_tokens?: PreviewToken[];
    activity_logs?: VersionActivityLog[];
}
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
export interface ContentVersionData {
    theme_overrides?: {
        colors?: Record<string, string>;
        fonts?: Record<string, string>;
        layouts?: string[];
    };
    custom_fields?: Record<string, JsonValue>;
    ab_test_data?: {
        variant_id?: string;
        test_id?: string;
        conversion_goals?: string[];
    };
    analytics?: {
        ga_tracking_id?: string;
        custom_events?: Array<{
            event_name: string;
            parameters: Record<string, string | number>;
        }>;
    };
    components?: ComponentData[];
    blocks?: BlockData[];
    widgets?: WidgetData[];
}
export interface ContentMetaData {
    meta_title?: string;
    meta_description?: string;
    og_image?: string;
    og_title?: string;
    og_description?: string;
    twitter_card?: 'summary' | 'summary_large_image';
    canonical_url?: string;
    noindex?: boolean;
    nofollow?: boolean;
    featured_image?: string;
    category_id?: number;
    tags?: string[];
    featured?: boolean;
    view_count?: number;
    template?: string;
    layout?: string;
}
export interface VersionDiff {
    field: string;
    old_value: JsonValue;
    new_value: JsonValue;
    change_type: 'added' | 'modified' | 'deleted';
}
export interface UserReference {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
}
export interface SiteReference {
    id: number;
    domain_id: number;
    name: string;
    base_path: string;
    primary_domain: string;
}
export interface PreviewToken {
    id: number;
    site_id: number;
    domain_id?: number;
    locale?: string;
    version_id: number;
    token: string;
    token_type: TokenType;
    created_by: number;
    created_at: Date;
    expires_at: Date;
    max_uses?: number;
    use_count: number;
    password_protected: boolean;
    ip_whitelist?: string[];
    require_auth: boolean;
    allowed_users?: number[];
    last_accessed_at?: Date;
    is_active: boolean;
    revoked?: boolean;
    revoked_by?: number;
    revoked_at?: Date;
    custom_settings?: {
        show_toolbar?: boolean;
        allow_comments?: boolean;
        watermark?: boolean;
        custom_css?: string;
    };
    metadata?: Record<string, JsonValue>;
    version?: ContentVersion;
    access_logs?: PreviewAccessLog[];
}
export interface SecurePreviewToken extends PreviewToken {
    token_hash: string;
    token_prefix: string;
    password_hash?: string;
    rate_limit?: RateLimitConfig;
    audit_log?: PreviewAccessLog[];
}
export interface VersionComment {
    id: number;
    site_id: number;
    version_id: number;
    parent_id?: number;
    comment_text: string;
    comment_type: CommentType;
    line_number?: number;
    field_path?: string;
    status: CommentStatus;
    resolved_by?: number;
    resolved_at?: Date;
    contains_pii?: boolean;
    pii_fields?: string[];
    created_by: number;
    created_at: Date;
    updated_at: Date;
    author?: UserReference;
    replies?: VersionComment[];
}
export interface VersionActivityLog {
    id: number;
    site_id: number;
    version_id: number;
    action: VersionAction;
    user_id: number;
    created_at: Date;
    details: Record<string, JsonValue>;
}
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
export declare enum WorkflowStage {
    DRAFT = "draft",
    REVIEW = "review",
    APPROVED = "approved",
    SCHEDULED = "scheduled",
    PUBLISHED = "published",
    ARCHIVED = "archived"
}
export declare enum WorkflowAction {
    EDIT = "edit",
    SUBMIT_FOR_REVIEW = "submit_for_review",
    APPROVE = "approve",
    REJECT = "reject",
    PUBLISH = "publish",
    UNPUBLISH = "unpublish",
    ARCHIVE = "archive"
}
export declare enum VersionAction {
    CREATED = "created",
    UPDATED = "updated",
    PUBLISHED = "published",
    UNPUBLISHED = "unpublished",
    ARCHIVED = "archived",
    RESTORED = "restored",
    DELETED = "deleted",
    COMMENT_ADDED = "comment_added",
    COMMENT_RESOLVED = "comment_resolved"
}
export declare enum CommentType {
    GENERAL = "general",
    SUGGESTION = "suggestion",
    ISSUE = "issue",
    APPROVAL = "approval",
    REJECTION = "rejection",
    CHANGE_REQUEST = "change_request"
}
export declare enum CommentStatus {
    ACTIVE = "active",
    RESOLVED = "resolved",
    ARCHIVED = "archived"
}
export declare enum TokenType {
    PREVIEW = "preview",
    SHARE = "share",
    EMBED = "embed"
}
export interface ComponentData {
    id: string;
    type: string;
    props: Record<string, JsonValue>;
    children?: ComponentData[];
}
export interface BlockData {
    id: string;
    type: string;
    data: Record<string, JsonValue>;
    position: number;
}
export interface WidgetData {
    id: string;
    type: string;
    zone: string;
    settings: Record<string, JsonValue>;
    position: number;
}
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface CompactContentVersion {
    id: number;
    site_id: number;
    title: string;
    version_type: VersionType;
    version_number: number;
    created_at: string;
    created_by: number;
    is_current: boolean;
}
export default ContentVersion;
//# sourceMappingURL=core.d.ts.map