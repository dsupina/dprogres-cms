"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenType = exports.CommentStatus = exports.CommentType = exports.VersionAction = exports.WorkflowAction = exports.WorkflowStage = void 0;
var WorkflowStage;
(function (WorkflowStage) {
    WorkflowStage["DRAFT"] = "draft";
    WorkflowStage["REVIEW"] = "review";
    WorkflowStage["APPROVED"] = "approved";
    WorkflowStage["SCHEDULED"] = "scheduled";
    WorkflowStage["PUBLISHED"] = "published";
    WorkflowStage["ARCHIVED"] = "archived";
})(WorkflowStage || (exports.WorkflowStage = WorkflowStage = {}));
var WorkflowAction;
(function (WorkflowAction) {
    WorkflowAction["EDIT"] = "edit";
    WorkflowAction["SUBMIT_FOR_REVIEW"] = "submit_for_review";
    WorkflowAction["APPROVE"] = "approve";
    WorkflowAction["REJECT"] = "reject";
    WorkflowAction["PUBLISH"] = "publish";
    WorkflowAction["UNPUBLISH"] = "unpublish";
    WorkflowAction["ARCHIVE"] = "archive";
})(WorkflowAction || (exports.WorkflowAction = WorkflowAction = {}));
var VersionAction;
(function (VersionAction) {
    VersionAction["CREATED"] = "created";
    VersionAction["UPDATED"] = "updated";
    VersionAction["PUBLISHED"] = "published";
    VersionAction["UNPUBLISHED"] = "unpublished";
    VersionAction["ARCHIVED"] = "archived";
    VersionAction["RESTORED"] = "restored";
    VersionAction["DELETED"] = "deleted";
    VersionAction["COMMENT_ADDED"] = "comment_added";
    VersionAction["COMMENT_RESOLVED"] = "comment_resolved";
})(VersionAction || (exports.VersionAction = VersionAction = {}));
var CommentType;
(function (CommentType) {
    CommentType["GENERAL"] = "general";
    CommentType["SUGGESTION"] = "suggestion";
    CommentType["ISSUE"] = "issue";
    CommentType["APPROVAL"] = "approval";
    CommentType["REJECTION"] = "rejection";
    CommentType["CHANGE_REQUEST"] = "change_request";
})(CommentType || (exports.CommentType = CommentType = {}));
var CommentStatus;
(function (CommentStatus) {
    CommentStatus["ACTIVE"] = "active";
    CommentStatus["RESOLVED"] = "resolved";
    CommentStatus["ARCHIVED"] = "archived";
})(CommentStatus || (exports.CommentStatus = CommentStatus = {}));
var TokenType;
(function (TokenType) {
    TokenType["PREVIEW"] = "preview";
    TokenType["SHARE"] = "share";
    TokenType["EMBED"] = "embed";
})(TokenType || (exports.TokenType = TokenType = {}));
//# sourceMappingURL=core.js.map