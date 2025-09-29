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
export declare const VersionStatus: {
    readonly DRAFT: "draft";
    readonly PUBLISHED: "published";
    readonly AUTO_SAVE: "auto_save";
    readonly ARCHIVED: "archived";
};
export type VersionStatusType = typeof VersionStatus[keyof typeof VersionStatus];
export declare enum VersionErrorCode {
    VERSION_NOT_FOUND = "VERSION_NOT_FOUND",
    VERSION_CONFLICT = "VERSION_CONFLICT",
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
    INVALID_CONTENT_TYPE = "INVALID_CONTENT_TYPE",
    VALIDATION_FAILED = "VALIDATION_FAILED",
    SITE_MISMATCH = "SITE_MISMATCH",
    LOCALE_NOT_SUPPORTED = "LOCALE_NOT_SUPPORTED",
    TOKEN_EXPIRED = "TOKEN_EXPIRED",
    TOKEN_INVALID = "TOKEN_INVALID",
    PUBLISHING_FAILED = "PUBLISHING_FAILED",
    PREVIEW_GENERATION_FAILED = "PREVIEW_GENERATION_FAILED"
}
export declare enum DataClassification {
    PUBLIC = "public",
    INTERNAL = "internal",
    CONFIDENTIAL = "confidential",
    RESTRICTED = "restricted",
    SECRET = "secret"
}
export declare enum VersioningIsolationLevel {
    READ_COMMITTED = "READ COMMITTED",
    REPEATABLE_READ = "REPEATABLE READ",
    SERIALIZABLE = "SERIALIZABLE"
}
export declare enum ComplianceTag {
    GDPR_ACCESS = "gdpr_access",
    GDPR_DELETION = "gdpr_deletion",
    GDPR_EXPORT = "gdpr_export",
    CCPA_ACCESS = "ccpa_access",
    CCPA_DELETION = "ccpa_deletion",
    HIPAA_ACCESS = "hipaa_access",
    PCI_ACCESS = "pci_access",
    SOC2_RELEVANT = "soc2_relevant"
}
//# sourceMappingURL=enums.d.ts.map