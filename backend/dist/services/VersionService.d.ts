import { Pool, PoolClient } from 'pg';
import { ContentVersion, CreateVersionInput, VersionHistoryOptions, ServiceResponse, PaginatedResponse, ContentType, VersionComparison } from '../types/versioning';
import { DataClassification } from '../types/versioning/enums';
import { VersionAction } from '../types/versioning/core';
import { EventEmitter } from 'events';
interface VersionEventPayload {
    action: VersionAction;
    version: ContentVersion;
    userId: number;
    siteId: number;
    metadata?: Record<string, any>;
}
interface VersionMetrics {
    total_versions: number;
    draft_count: number;
    published_count: number;
    auto_save_count: number;
    last_activity: Date | null;
    storage_size_bytes: number;
}
interface AuditLogEntry {
    action: VersionAction;
    version_id: number;
    user_id: number;
    site_id: number;
    ip_address?: string;
    user_agent?: string;
    details: Record<string, any>;
    data_classification: DataClassification;
}
export declare class VersionService extends EventEmitter {
    private pool;
    private versionCache;
    private metricsCache;
    private readonly CACHE_TTL;
    private readonly AUTO_SAVE_RETENTION_DAYS;
    private readonly MAX_VERSIONS_PER_CONTENT;
    constructor(pool: Pool);
    createVersion(input: CreateVersionInput, userId: number, options?: {
        ip_address?: string;
        user_agent?: string;
    }): Promise<ServiceResponse<ContentVersion>>;
    getVersion(versionId: number): Promise<ServiceResponse<ContentVersion>>;
    getVersionHistory(contentType: ContentType, contentId: number, options?: VersionHistoryOptions): Promise<ServiceResponse<PaginatedResponse<ContentVersion>>>;
    publishVersion(versionId: number, userId: number, options?: {
        ip_address?: string;
        user_agent?: string;
    }): Promise<ServiceResponse<ContentVersion>>;
    revertToVersion(versionId: number, userId: number): Promise<ServiceResponse<ContentVersion>>;
    deleteVersion(versionId: number): Promise<ServiceResponse<void>>;
    compareVersions(versionId1: number, versionId2: number): Promise<ServiceResponse<VersionComparison>>;
    getLatestDraft(siteId: number, contentType: ContentType, contentId: number): Promise<ServiceResponse<ContentVersion | null>>;
    getPublishedVersion(siteId: number, contentType: ContentType, contentId: number): Promise<ServiceResponse<ContentVersion | null>>;
    validateSiteAccess(siteId: number, userId: number): Promise<ServiceResponse<boolean>>;
    sanitizeVersionInput(input: CreateVersionInput): Promise<ServiceResponse<CreateVersionInput>>;
    getVersionCount(siteId: number, contentType: ContentType, contentId: number): Promise<number>;
    auditVersionOperation(auditData: AuditLogEntry, client?: PoolClient): Promise<void>;
    classifyVersionData(input: CreateVersionInput): DataClassification;
    emitVersionEvent(payload: VersionEventPayload): void;
    invalidateVersionCaches(siteId: number, contentType: ContentType, contentId: number): void;
    cleanupExpiredCache(): void;
    createDraft(input: CreateVersionInput, userId: number, options?: {
        ip_address?: string;
        user_agent?: string;
    }): Promise<ServiceResponse<ContentVersion>>;
    autoSave(input: CreateVersionInput, userId: number, options?: {
        ip_address?: string;
        user_agent?: string;
    }): Promise<ServiceResponse<ContentVersion>>;
    getVersionsByUser(siteId: number, userId: number, options?: VersionHistoryOptions): Promise<ServiceResponse<PaginatedResponse<ContentVersion>>>;
    getVersionMetrics(siteId: number, contentType?: ContentType, contentId?: number): Promise<ServiceResponse<VersionMetrics>>;
    pruneOldAutoSaves(siteId: number, contentType: ContentType, contentId: number): Promise<ServiceResponse<{
        deleted_count: number;
    }>>;
    createAutoSave(input: CreateVersionInput & {
        content_hash?: string;
    }, userId: number, siteId: number): Promise<ServiceResponse<ContentVersion>>;
    getLatestAutoSave(contentType: ContentType, contentId: number, siteId: number): Promise<ServiceResponse<ContentVersion | null>>;
    hasUnsavedChanges(contentHash: string, contentType: ContentType, contentId: number, siteId: number): Promise<ServiceResponse<boolean>>;
    private getLatestContentHash;
    private cleanupOldAutoSaves;
    onVersionCreated(handler: (payload: VersionEventPayload) => void): void;
    onVersionPublished(handler: (payload: VersionEventPayload) => void): void;
    onVersionArchived(handler: (payload: VersionEventPayload) => void): void;
    onAnyVersionEvent(handler: (payload: VersionEventPayload) => void): void;
    private detectChangedFields;
    private syncToMainTable;
    private calculateDiff;
    private calculateDiffStats;
}
export {};
//# sourceMappingURL=VersionService.d.ts.map