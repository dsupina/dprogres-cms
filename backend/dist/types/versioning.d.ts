export declare enum ContentType {
    POST = "post",
    PAGE = "page"
}
export declare enum VersionType {
    DRAFT = "draft",
    PUBLISHED = "published",
    AUTO_SAVE = "auto_save",
    ARCHIVED = "archived"
}
export declare enum TokenType {
    PREVIEW = "preview",
    SHARE = "share",
    EMBED = "embed"
}
export declare enum CommentType {
    GENERAL = "general",
    SUGGESTION = "suggestion",
    ISSUE = "issue",
    APPROVAL = "approval"
}
export declare enum CommentStatus {
    ACTIVE = "active",
    RESOLVED = "resolved",
    ARCHIVED = "archived"
}
export interface ContentVersion {
    id: number;
    site_id: number;
    locale?: string;
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
    data: Record<string, any> | null;
    meta_data: Record<string, any> | null;
    created_by: number;
    created_at: Date;
    published_at: Date | null;
    change_summary: string | null;
    diff_from_previous: Record<string, any> | null;
    content_hash: string | null;
    author?: {
        id: number;
        email: string;
        first_name?: string;
        last_name?: string;
    };
    comments?: VersionComment[];
}
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
export interface PreviewToken {
    id: number;
    site_id: number;
    domain_id?: number;
    locale?: string;
    token: string;
    token_type: TokenType;
    version_id: number;
    created_by: number;
    expires_at: Date;
    max_uses: number | null;
    use_count: number;
    password_protected: boolean;
    password_hash: string | null;
    allowed_ips: string[] | null;
    settings: Record<string, any> | null;
    created_at: Date;
    last_used_at: Date | null;
    version?: ContentVersion;
    creator?: {
        id: number;
        email: string;
        first_name?: string;
        last_name?: string;
    };
}
export interface GeneratePreviewTokenInput {
    site_id: number;
    domain_id?: number;
    locale?: string;
    version_id: number;
    token_type?: TokenType;
    expires_in_hours?: number;
    max_uses?: number;
    password?: string;
    allowed_ips?: string[];
    settings?: Record<string, any>;
}
export interface PreviewTokenValidation {
    valid: boolean;
    requires_password: boolean;
    expired: boolean;
    exceeded_uses: boolean;
    ip_restricted: boolean;
    version?: ContentVersion;
    error?: string;
}
export interface VersionComment {
    id: number;
    site_id: number;
    version_id: number;
    parent_comment_id: number | null;
    comment_text: string;
    comment_type: CommentType;
    status: CommentStatus;
    resolved_at: Date | null;
    resolved_by: number | null;
    created_by: number;
    created_at: Date;
    updated_at: Date;
    position_data: Record<string, any> | null;
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
export interface CreateCommentInput {
    version_id: number;
    parent_comment_id?: number;
    comment_text: string;
    comment_type?: CommentType;
    position_data?: Record<string, any>;
}
export interface UpdateCommentInput {
    comment_text?: string;
    status?: CommentStatus;
    position_data?: Record<string, any>;
}
export interface VersionComparison {
    version_a: ContentVersion;
    version_b: ContentVersion;
    diffs: VersionDiff[];
}
export interface VersionDiff {
    field: string;
    old_value: any;
    new_value: any;
    change_type: 'added' | 'modified' | 'deleted';
}
export type FieldChange = VersionDiff;
export declare function isContentVersion(obj: any): obj is ContentVersion;
export declare function isPreviewToken(obj: any): obj is PreviewToken;
export declare function isVersionComment(obj: any): obj is VersionComment;
export interface ServiceResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: Record<string, any>;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
}
export interface DatabaseFunctions {
    get_next_version_number: (content_type: string, content_id: number) => number;
    generate_preview_token: () => string;
}
//# sourceMappingURL=versioning.d.ts.map