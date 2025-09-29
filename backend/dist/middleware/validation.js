"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
<<<<<<< HEAD
exports.updateTemplateSchema = exports.createTemplateSchema = exports.updatePageSchema = exports.createPageSchema = exports.updateCategorySchema = exports.createCategorySchema = exports.updatePostSchema = exports.createPostSchema = exports.registerSchema = exports.loginSchema = exports.validateRequest = exports.validate = void 0;
=======
exports.updateTemplateSchema = exports.createTemplateSchema = exports.updatePageSchema = exports.createPageSchema = exports.updateCategorySchema = exports.createCategorySchema = exports.updatePostSchema = exports.createPostSchema = exports.registerSchema = exports.loginSchema = exports.validate = void 0;
>>>>>>> chore/preflight-stabilize
const joi_1 = __importDefault(require("joi"));
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.details.map((detail) => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                })),
            });
        }
        req.body = value;
        next();
    };
};
exports.validate = validate;
exports.validateRequest = exports.validate;
exports.loginSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).required()
});
exports.registerSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).required(),
    first_name: joi_1.default.string().max(100).optional(),
    last_name: joi_1.default.string().max(100).optional()
});
exports.createPostSchema = joi_1.default.object({
    title: joi_1.default.string().max(255).required(),
    slug: joi_1.default.string().max(255).optional(),
    excerpt: joi_1.default.string().optional(),
    content: joi_1.default.string().optional(),
    status: joi_1.default.string().valid('draft', 'published', 'scheduled').optional(),
    category_id: joi_1.default.number().integer().optional(),
    meta_title: joi_1.default.string().max(255).optional(),
    meta_description: joi_1.default.string().optional(),
    seo_indexed: joi_1.default.boolean().optional(),
    scheduled_at: joi_1.default.alternatives()
        .try(joi_1.default.date(), joi_1.default.string().allow('', null))
        .optional(),
    featured: joi_1.default.boolean().optional(),
    tags: joi_1.default.array().items(joi_1.default.string()).optional()
});
exports.updatePostSchema = joi_1.default.object({
    title: joi_1.default.string().max(255).optional(),
    slug: joi_1.default.string().max(255).optional(),
    excerpt: joi_1.default.string().optional(),
    content: joi_1.default.string().optional(),
    status: joi_1.default.string().valid('draft', 'published', 'scheduled').optional(),
    category_id: joi_1.default.number().integer().optional(),
    meta_title: joi_1.default.string().max(255).optional(),
    meta_description: joi_1.default.string().optional(),
    seo_indexed: joi_1.default.boolean().optional(),
    scheduled_at: joi_1.default.alternatives()
        .try(joi_1.default.date(), joi_1.default.string().allow('', null))
        .optional(),
    featured: joi_1.default.boolean().optional(),
    tags: joi_1.default.array().items(joi_1.default.string()).optional()
});
exports.createCategorySchema = joi_1.default.object({
    name: joi_1.default.string().max(100).required(),
    slug: joi_1.default.string().max(100).optional(),
    description: joi_1.default.string().optional(),
    seo_indexed: joi_1.default.boolean().optional()
});
exports.updateCategorySchema = joi_1.default.object({
    name: joi_1.default.string().max(100).optional(),
    slug: joi_1.default.string().max(100).optional(),
    description: joi_1.default.string().optional(),
    seo_indexed: joi_1.default.boolean().optional()
});
exports.createPageSchema = joi_1.default.object({
    title: joi_1.default.string().max(255).required(),
    slug: joi_1.default.string().max(255).optional(),
    content: joi_1.default.string().optional(),
    template: joi_1.default.string().max(100).optional(),
    meta_title: joi_1.default.string().max(255).optional(),
    meta_description: joi_1.default.string().optional(),
    seo_indexed: joi_1.default.boolean().optional(),
    published: joi_1.default.boolean().optional(),
<<<<<<< HEAD
    domain_id: joi_1.default.number().integer().optional()
=======
    data: joi_1.default.object().unknown(true).optional(),
>>>>>>> chore/preflight-stabilize
});
exports.updatePageSchema = joi_1.default.object({
    title: joi_1.default.string().max(255).optional(),
    slug: joi_1.default.string().max(255).optional(),
    content: joi_1.default.string().optional(),
    template: joi_1.default.string().max(100).optional(),
    meta_title: joi_1.default.string().max(255).optional(),
    meta_description: joi_1.default.string().optional(),
    seo_indexed: joi_1.default.boolean().optional(),
    published: joi_1.default.boolean().optional(),
    data: joi_1.default.object().unknown(true).optional(),
});
exports.createTemplateSchema = joi_1.default.object({
    key: joi_1.default.string().max(100).regex(/^[a-z0-9-]+$/).required(),
    name: joi_1.default.string().max(150).required(),
    description: joi_1.default.string().allow('', null).optional(),
    enabled: joi_1.default.boolean().optional(),
    schema: joi_1.default.object().unknown(true).optional(),
    default_data: joi_1.default.object().unknown(true).optional(),
});
exports.updateTemplateSchema = joi_1.default.object({
    key: joi_1.default.string().max(100).regex(/^[a-z0-9-]+$/).optional(),
    name: joi_1.default.string().max(150).optional(),
    description: joi_1.default.string().allow('', null).optional(),
    enabled: joi_1.default.boolean().optional(),
    schema: joi_1.default.object().unknown(true).optional(),
    default_data: joi_1.default.object().unknown(true).optional(),
});
//# sourceMappingURL=validation.js.map