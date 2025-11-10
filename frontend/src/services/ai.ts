import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import api from '@/lib/api';

export interface AiSuggestionRequest {
  siteId: number;
  contentId: number;
  contentType: 'post' | 'page';
  locale?: string;
  preset?: string;
  customPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  context?: {
    title?: string | null;
    excerpt?: string | null;
    content?: string | null;
    keywords?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface AiSuggestionResponse {
  suggestion: string;
  versionId: number;
  prompt: string;
  provenance: {
    provider: string;
    model: string;
    preset?: string;
    prompt: string;
    created_at: string;
    temperature: number;
    max_tokens?: number;
    tokens_used?: number;
    safety_warnings?: string[];
  };
  warnings?: string[];
}

export interface AiFeedbackRequest {
  versionId: number;
  signal: 'positive' | 'negative' | 'neutral';
  comment?: string;
  promptSnapshot?: string;
  suggestionSnapshot?: string;
  preset?: string;
}

export interface PromptTemplate {
  id: string;
  label: string;
  description: string;
  system: string;
  user: string;
}

const aiApi = {
  async getPromptTemplates(): Promise<PromptTemplate[]> {
    const response = await api.get('/ai/prompts');
    return response.data?.data || [];
  },
  async generateSuggestion(payload: AiSuggestionRequest): Promise<AiSuggestionResponse> {
    const response = await api.post('/ai/suggest', payload);
    const data = response.data?.data;
    if (!data) {
      throw new Error('AI response missing suggestion payload');
    }
    return data;
  },
  async sendFeedback(payload: AiFeedbackRequest): Promise<void> {
    await api.post('/ai/feedback', payload);
  },
};

export const useGenerateAiSuggestion = (
  options?: UseMutationOptions<AiSuggestionResponse, Error, AiSuggestionRequest>
) => {
  return useMutation<AiSuggestionResponse, Error, AiSuggestionRequest>({
    mutationKey: ['ai-suggestion'],
    mutationFn: aiApi.generateSuggestion,
    ...options,
  });
};

export const useAiFeedback = (
  options?: UseMutationOptions<void, Error, AiFeedbackRequest>
) => {
  return useMutation<void, Error, AiFeedbackRequest>({
    mutationKey: ['ai-feedback'],
    mutationFn: aiApi.sendFeedback,
    ...options,
  });
};

export const aiService = {
  getPromptTemplates: aiApi.getPromptTemplates,
  generateSuggestion: aiApi.generateSuggestion,
  sendFeedback: aiApi.sendFeedback,
};

export default aiService;
