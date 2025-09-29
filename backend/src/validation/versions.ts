import Joi from 'joi';

// Version validation schemas
export const versionSchemas = {
  // List versions query parameters
  listVersions: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('draft', 'published', 'auto_save').optional(),
    author: Joi.number().integer().positive().optional(),
    include_auto_saves: Joi.boolean().default(false)
  }),

  // Create new version
  createVersion: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    content: Joi.string().allow('').max(10485760).required(), // 10MB limit
    excerpt: Joi.string().max(1000).allow('').optional(),
    slug: Joi.string().max(200).optional(),
    meta_title: Joi.string().max(255).optional(),
    meta_description: Joi.string().max(500).optional(),
    og_image: Joi.string().uri().optional(),
    data: Joi.object().unknown(true).optional(),
    meta_data: Joi.object().unknown(true).optional(),
    version_type: Joi.string().valid('draft', 'auto_save').default('draft'),
    change_summary: Joi.string().max(500).allow('').optional()
  }),

  // Update existing version
  updateVersion: Joi.object({
    title: Joi.string().min(1).max(255).optional(),
    content: Joi.string().allow('').max(10485760).optional(),
    excerpt: Joi.string().max(1000).allow('').optional(),
    slug: Joi.string().max(200).optional(),
    meta_title: Joi.string().max(255).optional(),
    meta_description: Joi.string().max(500).optional(),
    og_image: Joi.string().uri().optional(),
    data: Joi.object().unknown(true).optional(),
    meta_data: Joi.object().unknown(true).optional(),
    change_summary: Joi.string().max(500).allow('').optional()
  }).min(1), // At least one field must be present

  // URL parameters
  contentParams: Joi.object({
    contentType: Joi.string().valid('post', 'page').required(),
    contentId: Joi.number().integer().positive().required()
  }),

  versionIdParam: Joi.object({
    versionId: Joi.number().integer().positive().required()
  }),

  // Diff comparison query parameters
  diffParams: Joi.object({
    compareWith: Joi.number().integer().positive().required()
  }),

  // Revert operation body
  revertVersion: Joi.object({
    change_summary: Joi.string().max(500).optional()
  }),

  // Get latest version query parameters
  getLatest: Joi.object({
    type: Joi.string().valid('draft', 'published', 'auto_save').default('draft')
  })
};