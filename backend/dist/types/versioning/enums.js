"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceTag = exports.VersioningIsolationLevel = exports.DataClassification = exports.VersionErrorCode = exports.VersionStatus = exports.VersionType = exports.ContentType = void 0;
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
exports.VersionStatus = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    AUTO_SAVE: 'auto_save',
    ARCHIVED: 'archived'
};
var VersionErrorCode;
(function (VersionErrorCode) {
    VersionErrorCode["VERSION_NOT_FOUND"] = "VERSION_NOT_FOUND";
    VersionErrorCode["VERSION_CONFLICT"] = "VERSION_CONFLICT";
    VersionErrorCode["INSUFFICIENT_PERMISSIONS"] = "INSUFFICIENT_PERMISSIONS";
    VersionErrorCode["INVALID_CONTENT_TYPE"] = "INVALID_CONTENT_TYPE";
    VersionErrorCode["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    VersionErrorCode["SITE_MISMATCH"] = "SITE_MISMATCH";
    VersionErrorCode["LOCALE_NOT_SUPPORTED"] = "LOCALE_NOT_SUPPORTED";
    VersionErrorCode["TOKEN_EXPIRED"] = "TOKEN_EXPIRED";
    VersionErrorCode["TOKEN_INVALID"] = "TOKEN_INVALID";
    VersionErrorCode["PUBLISHING_FAILED"] = "PUBLISHING_FAILED";
    VersionErrorCode["PREVIEW_GENERATION_FAILED"] = "PREVIEW_GENERATION_FAILED";
})(VersionErrorCode || (exports.VersionErrorCode = VersionErrorCode = {}));
var DataClassification;
(function (DataClassification) {
    DataClassification["PUBLIC"] = "public";
    DataClassification["INTERNAL"] = "internal";
    DataClassification["CONFIDENTIAL"] = "confidential";
    DataClassification["RESTRICTED"] = "restricted";
    DataClassification["SECRET"] = "secret";
})(DataClassification || (exports.DataClassification = DataClassification = {}));
var VersioningIsolationLevel;
(function (VersioningIsolationLevel) {
    VersioningIsolationLevel["READ_COMMITTED"] = "READ COMMITTED";
    VersioningIsolationLevel["REPEATABLE_READ"] = "REPEATABLE READ";
    VersioningIsolationLevel["SERIALIZABLE"] = "SERIALIZABLE";
})(VersioningIsolationLevel || (exports.VersioningIsolationLevel = VersioningIsolationLevel = {}));
var ComplianceTag;
(function (ComplianceTag) {
    ComplianceTag["GDPR_ACCESS"] = "gdpr_access";
    ComplianceTag["GDPR_DELETION"] = "gdpr_deletion";
    ComplianceTag["GDPR_EXPORT"] = "gdpr_export";
    ComplianceTag["CCPA_ACCESS"] = "ccpa_access";
    ComplianceTag["CCPA_DELETION"] = "ccpa_deletion";
    ComplianceTag["HIPAA_ACCESS"] = "hipaa_access";
    ComplianceTag["PCI_ACCESS"] = "pci_access";
    ComplianceTag["SOC2_RELEVANT"] = "soc2_relevant";
})(ComplianceTag || (exports.ComplianceTag = ComplianceTag = {}));
//# sourceMappingURL=enums.js.map