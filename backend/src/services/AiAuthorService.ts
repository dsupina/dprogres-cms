import { ContentType, CreateVersionInput, VersionType } from '../types/versioning';
import { VersionService } from './VersionService';

type CreateVersionPayload = CreateVersionInput & {
  site_id: number;
  content_type: ContentType;
  content_id: number;
};

export type PromptPresetId =
  | 'improve_clarity'
  | 'expand_section'
  | 'summarize'
  | 'generate_headline';

export interface GenerateSuggestionInput {
  siteId: number;
  contentId: number;
  contentType: ContentType;
  locale?: string;
  preset?: PromptPresetId | string;
  customPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  context?: {
    title?: string;
    excerpt?: string;
    content?: string;
    keywords?: string[];
  };
  metadata?: Record<string, any>;
}

export interface GenerateSuggestionResult {
  suggestion: string;
  versionId: number;
  prompt: string;
  provenance: AiProvenance;
  warnings?: string[];
}

export interface AiProvenance {
  provider: string;
  model: string;
  preset?: string;
  prompt: string;
  created_at: string;
  temperature: number;
  max_tokens?: number;
  tokens_used?: number;
  safety_warnings?: string[];
}

export interface FeedbackInput {
  versionId: number;
  userId: number;
  signal: 'positive' | 'negative' | 'neutral';
  comment?: string;
  promptSnapshot?: string;
  suggestionSnapshot?: string;
  preset?: string;
}

interface ProviderResponse {
  content: string;
  tokensUsed?: number;
  warnings?: string[];
}

interface PromptTemplate {
  id: PromptPresetId;
  label: string;
  description: string;
  system: string;
  user: string;
}

export class AiAuthorService {
  private versionService: VersionService;
  private provider: string;
  private apiKey?: string;
  private baseUrl: string;
  private model: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private safetyFilters: RegExp[];
  private promptTemplates: Map<PromptPresetId, PromptTemplate>;

  constructor(versionService: VersionService) {
    this.versionService = versionService;
    this.provider = process.env.AI_PROVIDER || 'mock';
    this.apiKey = process.env.AI_API_KEY;
    this.baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    this.model = process.env.AI_MODEL || 'gpt-4o-mini';
    this.defaultTemperature = Number(process.env.AI_TEMPERATURE || 0.7);
    this.defaultMaxTokens = Number(process.env.AI_MAX_TOKENS || 800);

    this.promptTemplates = new Map([
      [
        'improve_clarity',
        {
          id: 'improve_clarity',
          label: 'Improve clarity',
          description: 'Tighten language, remove jargon, and make the passage easier to follow.',
          system:
            'You are an editorial assistant for a newsroom. Improve clarity without changing factual meaning. Maintain markdown formatting.',
          user:
            'Rewrite the provided draft so it is clearer and easier to read. Keep key facts, URLs, markdown headings, and lists intact. Content:\n{{content}}',
        },
      ],
      [
        'expand_section',
        {
          id: 'expand_section',
          label: 'Expand section',
          description: 'Elaborate on an idea with more supporting detail.',
          system:
            'You expand article sections with engaging, factual detail. Cite concrete examples and keep markdown formatting consistent.',
          user:
            'Expand on the highlighted ideas and offer supporting detail. Keep tone consistent with the existing draft. Content:\n{{content}}',
        },
      ],
      [
        'summarize',
        {
          id: 'summarize',
          label: 'Summarize',
          description: 'Produce a concise summary or excerpt.',
          system:
            'You produce concise, factual summaries for editorial teasers. Preserve attribution and important qualifiers.',
          user:
            'Summarize the draft in 3-4 bullet points suitable for an article teaser. Content:\n{{content}}',
        },
      ],
      [
        'generate_headline',
        {
          id: 'generate_headline',
          label: 'Generate headline',
          description: 'Produce headline options optimized for SEO and engagement.',
          system:
            'You craft concise, compelling headlines that remain factual. Avoid clickbait, keep length under 75 characters, and include high-value keywords when possible.',
          user:
            'Provide three headline options for this article. Include a short explanation for each choice. Content:\n{{content}}',
        },
      ],
    ]);

    this.safetyFilters = [
      /<script/gi,
      /<iframe/gi,
      /onerror=/gi,
      /onload=/gi,
      /javascript:/gi,
    ];
  }

  getPromptTemplates(): PromptTemplate[] {
    return Array.from(this.promptTemplates.values());
  }

  async generateSuggestion(
    input: GenerateSuggestionInput,
    userId: number,
  ): Promise<GenerateSuggestionResult> {
    const preset = input.preset && this.promptTemplates.has(input.preset as PromptPresetId)
      ? (input.preset as PromptPresetId)
      : 'improve_clarity';

    const template = this.promptTemplates.get(preset)!;
    const prompt = this.buildPrompt(template, input.customPrompt, input.context);

    const providerResponse = await this.callProvider(prompt, {
      temperature: input.temperature ?? this.defaultTemperature,
      maxTokens: input.maxTokens ?? this.defaultMaxTokens,
    });

    const sanitizedContent = this.enforceSafety(providerResponse.content);

    const provenance: AiProvenance = {
      provider: this.provider,
      model: this.model,
      preset,
      prompt,
      created_at: new Date().toISOString(),
      temperature: input.temperature ?? this.defaultTemperature,
      max_tokens: input.maxTokens ?? this.defaultMaxTokens,
      tokens_used: providerResponse.tokensUsed,
      safety_warnings: providerResponse.warnings,
    };

    const draftInput: CreateVersionPayload = {
      site_id: input.siteId,
      content_type: input.contentType,
      content_id: input.contentId,
      locale: input.locale || 'en-US',
      title: input.context?.title || 'AI Suggestion',
      content: sanitizedContent,
      excerpt: input.context?.excerpt,
      data: input.metadata || {},
      version_type: VersionType.DRAFT,
      change_summary: `AI suggestion (${preset})`,
    };

    const versionResult = await this.versionService.createAiDraftVersion(
      draftInput,
      userId,
      provenance,
    );

    if (!versionResult.success || !versionResult.data) {
      throw new Error(versionResult.error || 'Unable to persist AI suggestion');
    }

    return {
      suggestion: sanitizedContent,
      versionId: versionResult.data.id,
      prompt,
      provenance,
      warnings: providerResponse.warnings,
    };
  }

  async recordFeedback(feedback: FeedbackInput): Promise<void> {
    await this.versionService.recordAiFeedback(feedback.versionId, feedback.userId, {
      signal: feedback.signal,
      comment: feedback.comment,
      prompt_snapshot: feedback.promptSnapshot,
      suggestion_snapshot: feedback.suggestionSnapshot,
      preset: feedback.preset,
    });
  }

  private buildPrompt(
    template: PromptTemplate,
    customPrompt?: string,
    context?: GenerateSuggestionInput['context'],
  ): string {
    const content = context?.content || context?.excerpt || context?.title || '';
    const templatedUser = template.user.replace('{{content}}', content);
    if (customPrompt && customPrompt.trim().length > 0) {
      return `${template.system}\n\nUser Instructions:\n${templatedUser}\n\nAdditional Guidance:\n${customPrompt.trim()}`;
    }
    return `${template.system}\n\nUser Instructions:\n${templatedUser}`;
  }

  private enforceSafety(text: string): string {
    let sanitized = text;
    for (const filter of this.safetyFilters) {
      sanitized = sanitized.replace(filter, '');
    }
    return sanitized.trim();
  }

  private async callProvider(
    prompt: string,
    options: { temperature: number; maxTokens: number },
  ): Promise<ProviderResponse> {
    if (!this.apiKey || this.provider === 'mock') {
      const mockContent = `Here is a refined take on your draft based on the prompt:\n\n${prompt.slice(0, 280)}...`;
      return {
        content: mockContent,
        tokensUsed: Math.ceil(mockContent.length / 4),
        warnings: this.apiKey ? undefined : ['Using mock AI provider because AI_API_KEY is not configured.'],
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000));

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          messages: [
            { role: 'system', content: 'You are an editorial assistant for a CMS.' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`AI provider returned ${response.status}: ${errorBody}`);
      }

      const body = await response.json();
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('AI provider response missing content');
      }

      return {
        content,
        tokensUsed: body.usage?.total_tokens,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('AI request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
