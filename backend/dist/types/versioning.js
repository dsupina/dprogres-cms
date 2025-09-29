"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentStatus = exports.CommentType = exports.TokenType = exports.VersionType = exports.ContentType = void 0;
exports.isContentVersion = isContentVersion;
exports.isPreviewToken = isPreviewToken;
exports.isVersionComment = isVersionComment;
var ContentType;
(function (ContentType) {
    ContentType["POST"] = "post";
    ContentType["PAGE"] = "page";
})(ContentType || (exports.ContentType = ContentType = {}));
var VersionType;
(function (VersionType) {
    VersionType["DRAFT"] = "draft";
    VersionType["PUBLISHED"] = "published";
    VersionType["AUTO_SAVE"] = "auto_save";
    VersionType["ARCHIVED"] = "archived";
})(VersionType || (exports.VersionType = VersionType = {}));
var TokenType;
(function (TokenType) {
    TokenType["PREVIEW"] = "preview";
    TokenType["SHARE"] = "share";
    TokenType["EMBED"] = "embed";
})(TokenType || (exports.TokenType = TokenType = {}));
var CommentType;
(function (CommentType) {
    CommentType["GENERAL"] = "general";
    CommentType["SUGGESTION"] = "suggestion";
    CommentType["ISSUE"] = "issue";
    CommentType["APPROVAL"] = "approval";
})(CommentType || (exports.CommentType = CommentType = {}));
var CommentStatus;
(function (CommentStatus) {
    CommentStatus["ACTIVE"] = "active";
    CommentStatus["RESOLVED"] = "resolved";
    CommentStatus["ARCHIVED"] = "archived";
})(CommentStatus || (exports.CommentStatus = CommentStatus = {}));
function isContentVersion(obj) {
    return obj &&
        typeof obj.id === 'number' &&
        ['post', 'page'].includes(obj.content_type) &&
        typeof obj.content_id === 'number' &&
        typeof obj.version_number === 'number';
}
function isPreviewToken(obj) {
    return obj &&
        typeof obj.id === 'number' &&
        typeof obj.token === 'string' &&
        typeof obj.version_id === 'number';
}
function isVersionComment(obj) {
    return obj &&
        typeof obj.id === 'number' &&
        typeof obj.version_id === 'number' &&
        typeof obj.comment_text === 'string';
}
//# sourceMappingURL=versioning.js.map