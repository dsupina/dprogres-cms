interface AiContentContext {
    title: string;
    excerpt?: string | null;
    content?: string | null;
    tags?: Array<{
        name: string;
    } | string>;
}
export interface AiExcerptRequest {
    channel: string;
    maxLength?: number;
}
export interface AiHashtagRequest {
    channel: string;
    limit?: number;
}
export default class AiAuthorService {
    generateExcerpt(post: AiContentContext, request: AiExcerptRequest): Promise<string>;
    generateHashtags(post: AiContentContext, request: AiHashtagRequest): Promise<string[]>;
    private stripHtml;
    private truncate;
    private extractKeywords;
    private normalizeKeyword;
}
export {};
//# sourceMappingURL=AiAuthorService.d.ts.map