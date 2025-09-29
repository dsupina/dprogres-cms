import { ContentVersion, PreviewToken, VersionComment, JsonValue } from './core';
import { ContentType, VersionType } from './enums';
export declare function isContentVersion(value: unknown): value is ContentVersion;
export declare function isPreviewToken(value: unknown): value is PreviewToken;
export declare function isVersionComment(value: unknown): value is VersionComment;
export declare function isContentType(value: unknown): value is ContentType;
export declare function isVersionType(value: unknown): value is VersionType;
export declare function isJsonValue(value: unknown): value is JsonValue;
export declare function hasSiteContext<T extends object>(query: T): query is T & {
    site_id: number;
};
export declare function ensureSiteIsolation<T extends object>(query: T, allowed_sites: number[]): T & {
    site_id: number;
};
export declare function validateRequiredFields<T extends object>(obj: T, requiredFields: (keyof T)[]): obj is T;
export declare function validateStringLength(value: string, min: number, max: number): boolean;
export declare function validateArray<T>(arr: T[], minLength: number, maxLength: number, itemValidator?: (item: T) => boolean): boolean;
export declare function sanitizeHtml(html: string): string;
export declare function sanitizeFilePath(path: string): string;
export declare function sanitizeSqlIdentifier(identifier: string): string;
export declare function isDraftVersion(version: ContentVersion): version is ContentVersion & {
    version_type: VersionType.DRAFT;
    is_current_draft: true;
    published_at: null;
};
export declare function isPublishedVersion(version: ContentVersion): version is ContentVersion & {
    version_type: VersionType.PUBLISHED;
    is_current_published: boolean;
    published_at: Date;
};
export declare function validateBatch<T>(items: T[], validator: (item: T) => boolean): {
    valid: T[];
    invalid: Array<{
        item: T;
        index: number;
    }>;
};
declare const _default: {
    isContentVersion: typeof isContentVersion;
    isPreviewToken: typeof isPreviewToken;
    isVersionComment: typeof isVersionComment;
    isContentType: typeof isContentType;
    isVersionType: typeof isVersionType;
    isJsonValue: typeof isJsonValue;
    hasSiteContext: typeof hasSiteContext;
    ensureSiteIsolation: typeof ensureSiteIsolation;
    validateRequiredFields: typeof validateRequiredFields;
    validateStringLength: typeof validateStringLength;
    validateArray: typeof validateArray;
    sanitizeHtml: typeof sanitizeHtml;
    sanitizeFilePath: typeof sanitizeFilePath;
    sanitizeSqlIdentifier: typeof sanitizeSqlIdentifier;
    isDraftVersion: typeof isDraftVersion;
    isPublishedVersion: typeof isPublishedVersion;
    validateBatch: typeof validateBatch;
};
export default _default;
//# sourceMappingURL=guards.d.ts.map