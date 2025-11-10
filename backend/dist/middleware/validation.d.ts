import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
export declare const validate: (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const validateRequest: (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const loginSchema: Joi.ObjectSchema<any>;
export declare const registerSchema: Joi.ObjectSchema<any>;
export declare const blockSchema: Joi.ObjectSchema<any>;
export declare const createPostSchema: Joi.ObjectSchema<any>;
export declare const updatePostSchema: Joi.ObjectSchema<any>;
export declare const createCategorySchema: Joi.ObjectSchema<any>;
export declare const updateCategorySchema: Joi.ObjectSchema<any>;
export declare const createPageSchema: Joi.ObjectSchema<any>;
export declare const updatePageSchema: Joi.ObjectSchema<any>;
export declare const createTemplateSchema: Joi.ObjectSchema<any>;
export declare const updateTemplateSchema: Joi.ObjectSchema<any>;
//# sourceMappingURL=validation.d.ts.map