import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    next();
  };
};

// Auth validation schemas
export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  first_name: Joi.string().max(100).optional(),
  last_name: Joi.string().max(100).optional()
});

// Post validation schemas
export const createPostSchema = Joi.object({
  title: Joi.string().max(255).required(),
  slug: Joi.string().max(255).optional(),
  excerpt: Joi.string().optional(),
  content: Joi.string().optional(),
  featured_image: Joi.string().optional(),
  status: Joi.string().valid('draft', 'published', 'scheduled').optional(),
  category_id: Joi.number().integer().optional(),
  meta_title: Joi.string().max(255).optional(),
  meta_description: Joi.string().optional(),
  seo_indexed: Joi.boolean().optional(),
  scheduled_at: Joi.date().optional(),
  featured: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

export const updatePostSchema = Joi.object({
  title: Joi.string().max(255).optional(),
  slug: Joi.string().max(255).optional(),
  excerpt: Joi.string().optional(),
  content: Joi.string().optional(),
  featured_image: Joi.string().optional(),
  status: Joi.string().valid('draft', 'published', 'scheduled').optional(),
  category_id: Joi.number().integer().optional(),
  meta_title: Joi.string().max(255).optional(),
  meta_description: Joi.string().optional(),
  seo_indexed: Joi.boolean().optional(),
  scheduled_at: Joi.date().optional(),
  featured: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

// Category validation schemas
export const createCategorySchema = Joi.object({
  name: Joi.string().max(100).required(),
  slug: Joi.string().max(100).optional(),
  description: Joi.string().optional(),
  seo_indexed: Joi.boolean().optional()
});

export const updateCategorySchema = Joi.object({
  name: Joi.string().max(100).optional(),
  slug: Joi.string().max(100).optional(),
  description: Joi.string().optional(),
  seo_indexed: Joi.boolean().optional()
});

// Page validation schemas
export const createPageSchema = Joi.object({
  title: Joi.string().max(255).required(),
  slug: Joi.string().max(255).optional(),
  content: Joi.string().optional(),
  template: Joi.string().max(100).optional(),
  meta_title: Joi.string().max(255).optional(),
  meta_description: Joi.string().optional(),
  seo_indexed: Joi.boolean().optional(),
  published: Joi.boolean().optional()
});

export const updatePageSchema = Joi.object({
  title: Joi.string().max(255).optional(),
  slug: Joi.string().max(255).optional(),
  content: Joi.string().optional(),
  template: Joi.string().max(100).optional(),
  meta_title: Joi.string().max(255).optional(),
  meta_description: Joi.string().optional(),
  seo_indexed: Joi.boolean().optional(),
  published: Joi.boolean().optional()
}); 