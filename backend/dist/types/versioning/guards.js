"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isContentVersion = isContentVersion;
exports.isPreviewToken = isPreviewToken;
exports.isVersionComment = isVersionComment;
exports.isContentType = isContentType;
exports.isVersionType = isVersionType;
exports.isJsonValue = isJsonValue;
exports.hasSiteContext = hasSiteContext;
exports.ensureSiteIsolation = ensureSiteIsolation;
exports.validateRequiredFields = validateRequiredFields;
exports.validateStringLength = validateStringLength;
exports.validateArray = validateArray;
exports.sanitizeHtml = sanitizeHtml;
exports.sanitizeFilePath = sanitizeFilePath;
exports.sanitizeSqlIdentifier = sanitizeSqlIdentifier;
exports.isDraftVersion = isDraftVersion;
exports.isPublishedVersion = isPublishedVersion;
exports.validateBatch = validateBatch;
const enums_1 = require("./enums");
function isContentVersion(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.id === 'number' &&
        typeof v.site_id === 'number' &&
        isContentType(v.content_type) &&
        typeof v.content_id === 'number' &&
        typeof v.version_number === 'number' &&
        isVersionType(v.version_type) &&
        typeof v.is_current_draft === 'boolean' &&
        typeof v.is_current_published === 'boolean' &&
        typeof v.title === 'string' &&
        typeof v.created_by === 'number' &&
        v.created_at instanceof Date);
}
function isPreviewToken(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.id === 'number' &&
        typeof v.site_id === 'number' &&
        typeof v.version_id === 'number' &&
        typeof v.token === 'string' &&
        typeof v.created_by === 'number' &&
        v.created_at instanceof Date &&
        v.expires_at instanceof Date &&
        typeof v.use_count === 'number' &&
        typeof v.is_active === 'boolean');
}
function isVersionComment(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.id === 'number' &&
        typeof v.site_id === 'number' &&
        typeof v.version_id === 'number' &&
        typeof v.comment_text === 'string' &&
        typeof v.created_by === 'number' &&
        v.created_at instanceof Date &&
        v.updated_at instanceof Date);
}
function isContentType(value) {
    return value === enums_1.ContentType.POST || value === enums_1.ContentType.PAGE;
}
function isVersionType(value) {
    return (value === enums_1.VersionType.DRAFT ||
        value === enums_1.VersionType.PUBLISHED ||
        value === enums_1.VersionType.AUTO_SAVE ||
        value === enums_1.VersionType.ARCHIVED);
}
function isJsonValue(value) {
    if (value === null)
        return true;
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJsonValue);
    }
    if (type === 'object') {
        if (value instanceof Date || value instanceof RegExp) {
            return false;
        }
        if (Object.prototype.toString.call(value) !== '[object Object]') {
            return false;
        }
        const obj = value;
        return Object.values(obj).every(isJsonValue);
    }
    return false;
}
function hasSiteContext(query) {
    return 'site_id' in query && typeof query.site_id === 'number';
}
function ensureSiteIsolation(query, allowed_sites) {
    if (!hasSiteContext(query)) {
        throw new Error('Site context is required for all queries');
    }
    const siteQuery = query;
    if (!allowed_sites.includes(siteQuery.site_id)) {
        throw new Error(`Access denied to site ${siteQuery.site_id}`);
    }
    return siteQuery;
}
function validateRequiredFields(obj, requiredFields) {
    return requiredFields.every(field => field in obj && obj[field] != null);
}
function validateStringLength(value, min, max) {
    return value.length >= min && value.length <= max;
}
function validateArray(arr, minLength, maxLength, itemValidator) {
    if (arr.length < minLength || arr.length > maxLength) {
        return false;
    }
    if (itemValidator) {
        return arr.every(itemValidator);
    }
    return true;
}
function sanitizeHtml(html) {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
}
function sanitizeFilePath(path) {
    return path
        .replace(/\.\./g, '')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .replace(/[^a-zA-Z0-9_\-./]/g, '');
}
function sanitizeSqlIdentifier(identifier) {
    return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}
function isDraftVersion(version) {
    return (version.version_type === enums_1.VersionType.DRAFT &&
        version.is_current_draft === true &&
        version.published_at === null);
}
function isPublishedVersion(version) {
    return (version.version_type === enums_1.VersionType.PUBLISHED &&
        version.published_at !== null);
}
function validateBatch(items, validator) {
    const valid = [];
    const invalid = [];
    items.forEach((item, index) => {
        if (validator(item)) {
            valid.push(item);
        }
        else {
            invalid.push({ item, index });
        }
    });
    return { valid, invalid };
}
exports.default = {
    isContentVersion,
    isPreviewToken,
    isVersionComment,
    isContentType,
    isVersionType,
    isJsonValue,
    hasSiteContext,
    ensureSiteIsolation,
    validateRequiredFields,
    validateStringLength,
    validateArray,
    sanitizeHtml,
    sanitizeFilePath,
    sanitizeSqlIdentifier,
    isDraftVersion,
    isPublishedVersion,
    validateBatch
};
//# sourceMappingURL=guards.js.map