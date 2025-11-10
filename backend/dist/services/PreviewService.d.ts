import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { VersionService } from './VersionService';
import { ServiceResponse, ContentVersion } from '../types/versioning';
import { BlockNode, BlockRenderResult } from '../types/content';
export interface PreviewToken {
    id: number;
    token: string;
    token_hash: string;
    token_type: 'preview' | 'share' | 'embed';
    site_id: number;
    version_id: number;
    domain_id?: number;
    locale?: string;
    expires_at: Date;
    max_uses?: number;
    use_count: number;
    password_protected: boolean;
    allowed_ips?: string[];
    allowed_emails?: string[];
    settings: Record<string, any>;
    created_by: number;
    created_at: Date;
    last_used_at?: Date;
    revoked_at?: Date;
}
export interface TokenGenerationRequest {
    versionId: number;
    siteId: number;
    domainId?: number;
    locale?: string;
    expiresInHours?: number;
    maxUses?: number;
    password?: string;
    allowedIps?: string[];
    allowedEmails?: string[];
    tokenType?: 'preview' | 'share' | 'embed';
    settings?: {
        devicePreview?: 'desktop' | 'tablet' | 'mobile';
        trackAnalytics?: boolean;
        enableFeedback?: boolean;
        customBranding?: Record<string, any>;
    };
}
export interface TokenValidationResult {
    valid: boolean;
    token?: PreviewToken;
    version?: ContentVersion;
    error?: string;
    requiresPassword?: boolean;
    expired?: boolean;
    exceededUses?: boolean;
}
export interface PreviewAnalyticsEvent {
    tokenId: number;
    siteId: number;
    versionId: number;
    ipAddress: string;
    userAgent?: string;
    referer?: string;
    countryCode?: string;
    deviceType?: string;
    sessionId?: string;
    responseTimeMs?: number;
}
export declare class PreviewService extends EventEmitter {
    private pool;
    private versionService;
    private tokenCache;
    private readonly CACHE_TTL_MS;
    private readonly DEFAULT_EXPIRY_HOURS;
    private readonly MAX_TOKENS_PER_USER;
    private readonly JWT_SECRET;
    private readonly AES_KEY;
    constructor(pool: Pool, versionService: VersionService);
    generatePreviewToken(request: TokenGenerationRequest, userId: number): Promise<ServiceResponse<PreviewToken>>;
    validatePreviewToken(token: string, options?: {
        ipAddress?: string;
        password?: string;
        userEmail?: string;
    }): Promise<ServiceResponse<TokenValidationResult>>;
    assembleBlockPreview(blocks: BlockNode[], options?: {
        applyAI?: boolean;
        topic?: string;
    }): Promise<BlockRenderResult>;
    revokePreviewToken(tokenId: number, userId: number, reason?: string): Promise<ServiceResponse<void>>;
    getPreviewAnalytics(filters: {
        tokenId?: number;
        siteId?: number;
        startDate?: Date;
        endDate?: Date;
    }, userId: number): Promise<ServiceResponse<any[]>>;
    private hydrateBlocksWithAI;
    private renderBlockTree;
    private requestBlockCompletion;
    private buildFallbackSuggestion;
    private encryptToken;
    private generateShortUrl;
    private trackAnalytics;
    private auditTokenOperation;
    private getCacheKey;
    private isCacheValid;
    private clearCacheForToken;
    private startCleanupInterval;
}
//# sourceMappingURL=PreviewService.d.ts.map