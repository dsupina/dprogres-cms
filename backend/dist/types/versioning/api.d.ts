import { ContentType, VersionType, VersionErrorCode } from './enums';
import { ContentVersion, PreviewToken, VersionComment, JsonValue } from './core';
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}
export interface CursorPaginatedResponse<T> {
    items: T[];
    page_info: {
        has_next_page: boolean;
        has_previous_page: boolean;
        start_cursor: string;
        end_cursor: string;
    };
    total_count?: number;
    query_time_ms: number;
    cache_hit: boolean;
}
export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
    meta?: {
        request_id: string;
        timestamp: string;
        version: string;
    };
}
export interface ApiErrorResponse {
    success: false;
    error: VersionError;
    request_id: string;
    timestamp: string;
    support_code?: string;
}
export interface VersionError {
    code: VersionErrorCode;
    message: string;
    userMessage: string;
    field?: string;
    severity: 'error' | 'warning' | 'info';
    metadata?: {
        conflicting_version?: ContentVersion;
        available_actions?: string[];
        retry_after?: number;
    };
}
export interface GetVersionsRequest {
    site_id: number;
    content_type?: ContentType;
    content_id?: number;
    locale?: string;
    version_type?: VersionType[];
    author_id?: number;
    created_after?: string;
    created_before?: string;
    page?: number;
    limit?: number;
    include_auto_saves?: boolean;
    include_archived?: boolean;
    sort_by?: 'created_at' | 'version_number' | 'published_at';
    sort_order?: 'asc' | 'desc';
}
export interface GetVersionsResponse {
    versions: PaginatedResponse<ContentVersion>;
    metadata: {
        total_drafts: number;
        total_published: number;
        last_auto_save: Date | null;
        storage_used_bytes: number;
    };
}
export interface GetVersionRequest {
    id: number;
    include_relations?: ('author' | 'comments' | 'preview_tokens' | 'activity_logs')[];
}
export interface GetVersionResponse {
    version: ContentVersion;
}
export interface CreateVersionRequest {
    site_id: number;
    content_type: ContentType;
    content_id: number;
    version_data: CreateVersionInput;
    options?: {
        auto_publish?: boolean;
        create_preview_token?: boolean;
        notify_collaborators?: boolean;
        schedule_publish?: string;
    };
}
export interface CreateVersionInput {
    locale?: string;
    title: string;
    slug?: string;
    content?: string;
    excerpt?: string;
    data?: Record<string, JsonValue>;
    meta_data?: Record<string, JsonValue>;
    version_type?: VersionType;
    change_summary?: string;
}
export interface CreateVersionResponse {
    version: ContentVersion;
    preview_token?: PreviewToken;
    notifications_sent?: string[];
}
export interface UpdateVersionRequest {
    id: number;
    updates: Partial<CreateVersionInput>;
    create_new_version?: boolean;
}
export interface UpdateVersionResponse {
    version: ContentVersion;
    created_new_version: boolean;
}
export interface PublishVersionRequest {
    id: number;
    force?: boolean;
    scheduled_for?: string;
    notification_settings?: {
        notify_subscribers: boolean;
        email_summary: boolean;
        webhook_notifications: boolean;
    };
    cache_strategy?: 'immediate' | 'lazy' | 'scheduled';
}
export interface PublishVersionResponse {
    published_version: ContentVersion;
    previous_version?: ContentVersion;
    cache_purge_urls: string[];
    sitemap_updated: boolean;
    webhooks_triggered: string[];
}
export interface RevertVersionRequest {
    id: number;
    create_as_draft?: boolean;
    change_summary?: string;
}
export interface RevertVersionResponse {
    new_version: ContentVersion;
    reverted_from: ContentVersion;
}
export interface DeleteVersionRequest {
    id: number;
    soft_delete?: boolean;
    cascade_delete_comments?: boolean;
}
export interface DeleteVersionResponse {
    deleted: boolean;
    archived?: boolean;
    affected_items: {
        comments_deleted?: number;
        preview_tokens_invalidated?: number;
    };
}
export interface CompareVersionsRequest {
    version_a_id: number;
    version_b_id: number;
    include_unchanged_fields?: boolean;
    diff_algorithm?: 'myers' | 'patience' | 'histogram';
}
export interface CompareVersionsResponse {
    version_a: ContentVersion;
    version_b: ContentVersion;
    comparison: VersionComparison;
}
export interface VersionComparison {
    total_changes: number;
    changes: VersionComparisonDiff[];
    similarity_score: number;
    estimated_review_time_minutes: number;
}
export interface VersionComparisonDiff {
    field: string;
    field_label?: string;
    change_type: 'added' | 'modified' | 'deleted';
    old_value?: JsonValue;
    new_value?: JsonValue;
    diff_html?: string;
}
export interface CreatePreviewTokenRequest {
    version_id: number;
    token_type?: 'preview' | 'share' | 'embed';
    expires_in_hours?: number;
    max_uses?: number;
    password?: string;
    allowed_ips?: string[];
    require_auth?: boolean;
    allowed_users?: number[];
    custom_settings?: Record<string, JsonValue>;
}
export interface CreatePreviewTokenResponse {
    token: PreviewToken;
    preview_url: string;
    qr_code?: string;
    share_instructions?: string;
}
export interface PreviewTokenValidationRequest {
    token: string;
    password?: string;
}
export interface PreviewTokenValidationResponse {
    valid: boolean;
    version: ContentVersion;
    site_context: {
        site_id: number;
        primary_domain: string;
        locale: string;
        theme_tokens: Record<string, JsonValue>;
    };
    render_context: {
        preview_mode: boolean;
        editing_enabled: boolean;
        user_permissions: string[];
        toolbar_config?: Record<string, JsonValue>;
    };
    error?: {
        code: string;
        message: string;
    };
}
export interface RevokePreviewTokenRequest {
    id: number;
    reason?: string;
}
export interface RevokePreviewTokenResponse {
    revoked: boolean;
    affected_shares: number;
}
export interface GetVersionCommentsRequest {
    version_id: number;
    status?: 'active' | 'resolved' | 'archived';
    include_replies?: boolean;
    sort_by?: 'created_at' | 'updated_at';
    sort_order?: 'asc' | 'desc';
}
export interface GetVersionCommentsResponse {
    comments: VersionComment[];
    total_comments: number;
    active_threads: number;
    resolved_threads: number;
}
export interface CreateCommentRequest {
    version_id: number;
    comment_text: string;
    comment_type?: 'general' | 'suggestion' | 'issue' | 'approval';
    parent_id?: number;
    line_number?: number;
    field_path?: string;
    mentions?: number[];
}
export interface CreateCommentResponse {
    comment: VersionComment;
    notifications_sent: number[];
}
export interface ResolveCommentRequest {
    id: number;
    resolution_note?: string;
}
export interface ResolveCommentResponse {
    comment: VersionComment;
    resolved_by: number;
    resolved_at: string;
}
export interface BulkVersionOperationRequest {
    operation: 'publish' | 'archive' | 'delete' | 'update_status';
    version_ids: number[];
    options?: {
        batch_size?: number;
        delay_between_batches?: number;
        rollback_on_error?: boolean;
    };
    operation_params?: Record<string, JsonValue>;
}
export interface BulkVersionOperationResponse {
    successful: number[];
    failed: Array<{
        id: number;
        error: VersionError;
    }>;
    total_processed: number;
    duration_ms: number;
    rolled_back?: boolean;
}
export interface AutoSaveRequest {
    site_id: number;
    content_type: ContentType;
    content_id: number;
    content: Partial<CreateVersionInput>;
    parent_version_id?: number;
}
export interface AutoSaveResponse {
    auto_save_id: number;
    saved_at: string;
    next_auto_save_in_seconds: number;
}
export interface GetContentVersionHistoryRequest {
    content_type: ContentType;
    content_id: number;
    site_id: number;
    include_auto_saves?: boolean;
    include_archived?: boolean;
    limit?: number;
    cursor?: string;
}
export interface GetContentVersionHistoryResponse {
    content_id: number;
    content_type: ContentType;
    current_version?: ContentVersion;
    draft_version?: ContentVersion;
    versions: CursorPaginatedResponse<ContentVersion>;
    version_count: {
        total: number;
        drafts: number;
        published: number;
        auto_saves: number;
        archived: number;
    };
}
export interface SearchVersionsRequest {
    site_id: number;
    query?: string;
    filters: {
        content_types?: ContentType[];
        version_types?: VersionType[];
        authors?: number[];
        date_range?: {
            start: string;
            end: string;
        };
        has_comments?: boolean;
        has_preview_tokens?: boolean;
        metadata_filters?: Record<string, JsonValue>;
    };
    pagination: {
        page: number;
        limit: number;
    };
}
export interface SearchVersionsResponse {
    results: PaginatedResponse<ContentVersion>;
    facets: {
        content_types: Array<{
            value: string;
            count: number;
        }>;
        version_types: Array<{
            value: string;
            count: number;
        }>;
        authors: Array<{
            id: number;
            name: string;
            count: number;
        }>;
    };
    search_time_ms: number;
}
//# sourceMappingURL=api.d.ts.map