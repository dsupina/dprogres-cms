import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { validateRequest } from '../middleware/validation';
import pool from '../utils/database';
import { VersionService } from '../services/VersionService';
import { AiAuthorService } from '../services/AiAuthorService';
import { ContentType } from '../types/versioning';

interface SuggestionRequestBody {
  siteId: number;
  contentId: number;
  contentType: ContentType;
  locale?: string;
  preset?: string;
  customPrompt?: string | null;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, any>;
  context?: {
    title?: string | null;
    excerpt?: string | null;
    content?: string | null;
    keywords?: string[];
  };
}

interface FeedbackRequestBody {
  versionId: number;
  signal: 'positive' | 'negative' | 'neutral';
  comment?: string | null;
  promptSnapshot?: string | null;
  suggestionSnapshot?: string | null;
  preset?: string | null;
}

const router = Router();

const versionService = new VersionService(pool);
const aiAuthorService = new AiAuthorService(versionService);

const suggestionSchema = Joi.object({
  siteId: Joi.number().integer().positive().default(1),
  contentId: Joi.number().integer().positive().required(),
  contentType: Joi.string().valid(...Object.values(ContentType)).required(),
  locale: Joi.string().default('en-US'),
  preset: Joi.string().optional(),
  customPrompt: Joi.string().allow('', null).optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  maxTokens: Joi.number().integer().min(64).max(2048).optional(),
  metadata: Joi.object().optional(),
  context: Joi.object({
    title: Joi.string().allow('', null).optional(),
    excerpt: Joi.string().allow('', null).optional(),
    content: Joi.string().allow('', null).optional(),
    keywords: Joi.array().items(Joi.string()).optional(),
  })
    .default({})
    .optional(),
});

const feedbackSchema = Joi.object({
  versionId: Joi.number().integer().positive().required(),
  signal: Joi.string().valid('positive', 'negative', 'neutral').required(),
  comment: Joi.string().allow('', null).optional(),
  promptSnapshot: Joi.string().allow('', null).optional(),
  suggestionSnapshot: Joi.string().allow('', null).optional(),
  preset: Joi.string().allow('', null).optional(),
});

router.get('/prompts', (_req: Request, res: Response) => {
  const templates = aiAuthorService.getPromptTemplates();
  res.json({ success: true, data: templates });
});

router.post('/suggest', validateRequest(suggestionSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as SuggestionRequestBody;
    const user = (req as any).user;
    const userId = user?.userId || user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await aiAuthorService.generateSuggestion(
      {
        siteId: body.siteId,
        contentId: body.contentId,
        contentType: body.contentType as ContentType,
        locale: body.locale,
        preset: body.preset,
        customPrompt: body.customPrompt || undefined,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        context: {
          title: body.context?.title ?? undefined,
          excerpt: body.context?.excerpt ?? undefined,
          content: body.context?.content ?? undefined,
          keywords: body.context?.keywords,
        },
        metadata: body.metadata || {},
      },
      userId
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI suggestion error:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate AI suggestion' });
  }
});

router.post('/feedback', validateRequest(feedbackSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as FeedbackRequestBody;
    const user = (req as any).user;
    const userId = user?.userId || user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const feedbackPayload = {
      signal: body.signal,
      comment: body.comment || undefined,
      prompt_snapshot: body.promptSnapshot || undefined,
      suggestion_snapshot: body.suggestionSnapshot || undefined,
      preset: body.preset || undefined,
    } as const;

    const response = await versionService.recordAiFeedback(body.versionId, userId, feedbackPayload);

    if (!response.success) {
      return res.status(400).json({ success: false, error: response.error || 'Failed to record feedback' });
    }

    res.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error('AI feedback error:', error);
    res.status(500).json({ error: error?.message || 'Failed to record feedback' });
  }
});

export default router;
