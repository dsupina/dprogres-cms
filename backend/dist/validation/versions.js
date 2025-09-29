"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionSchemas = void 0;
const joi_1 = __importDefault(require("joi"));
exports.versionSchemas = {
    listVersions: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        status: joi_1.default.string().valid('draft', 'published', 'auto_save').optional(),
        author: joi_1.default.number().integer().positive().optional(),
        include_auto_saves: joi_1.default.boolean().default(false)
    }),
    createVersion: joi_1.default.object({
        title: joi_1.default.string().min(1).max(255).required(),
        content: joi_1.default.string().allow('').max(10485760).required(),
        excerpt: joi_1.default.string().max(1000).allow('').optional(),
        slug: joi_1.default.string().max(200).optional(),
        meta_title: joi_1.default.string().max(255).optional(),
        meta_description: joi_1.default.string().max(500).optional(),
        og_image: joi_1.default.string().uri().optional(),
        data: joi_1.default.object().unknown(true).optional(),
        meta_data: joi_1.default.object().unknown(true).optional(),
        version_type: joi_1.default.string().valid('draft', 'auto_save').default('draft'),
        change_summary: joi_1.default.string().max(500).allow('').optional()
    }),
    updateVersion: joi_1.default.object({
        title: joi_1.default.string().min(1).max(255).optional(),
        content: joi_1.default.string().allow('').max(10485760).optional(),
        excerpt: joi_1.default.string().max(1000).allow('').optional(),
        slug: joi_1.default.string().max(200).optional(),
        meta_title: joi_1.default.string().max(255).optional(),
        meta_description: joi_1.default.string().max(500).optional(),
        og_image: joi_1.default.string().uri().optional(),
        data: joi_1.default.object().unknown(true).optional(),
        meta_data: joi_1.default.object().unknown(true).optional(),
        change_summary: joi_1.default.string().max(500).allow('').optional()
    }).min(1),
    contentParams: joi_1.default.object({
        contentType: joi_1.default.string().valid('post', 'page').required(),
        contentId: joi_1.default.number().integer().positive().required()
    }),
    versionIdParam: joi_1.default.object({
        versionId: joi_1.default.number().integer().positive().required()
    }),
    diffParams: joi_1.default.object({
        compareWith: joi_1.default.number().integer().positive().required()
    }),
    revertVersion: joi_1.default.object({
        change_summary: joi_1.default.string().max(500).optional()
    }),
    getLatest: joi_1.default.object({
        type: joi_1.default.string().valid('draft', 'published', 'auto_save').default('draft')
    })
};
//# sourceMappingURL=versions.js.map