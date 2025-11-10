import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Input from '@/components/ui/Input';
import {
  AiFeedbackRequest,
  AiSuggestionRequest,
  AiSuggestionResponse,
  PromptTemplate,
  aiService,
  useAiFeedback,
  useGenerateAiSuggestion,
} from '@/services/ai';

const FALLBACK_TEMPLATES: PromptTemplate[] = [
  {
    id: 'improve_clarity',
    label: 'Improve clarity',
    description: 'Tighten language and make the passage easier to follow.',
    system: '',
    user: '',
  },
  {
    id: 'expand_section',
    label: 'Expand section',
    description: 'Add supporting detail to elaborate on an idea.',
    system: '',
    user: '',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Produce a concise summary for intros and teasers.',
    system: '',
    user: '',
  },
  {
    id: 'generate_headline',
    label: 'Generate headline',
    description: 'Craft a headline optimized for SEO and engagement.',
    system: '',
    user: '',
  },
];

export interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (suggestion: string, mode?: 'append' | 'replace') => void;
  siteId: number;
  contentId: number;
  contentType: 'post' | 'page';
  currentTitle?: string;
  currentExcerpt?: string;
  currentContent?: string;
}

interface ActiveSuggestion extends AiSuggestionResponse {
  presetUsed?: string;
}

export function AiAssistantPanel({
  isOpen,
  onClose,
  onInsert,
  siteId,
  contentId,
  contentType,
  currentTitle,
  currentExcerpt,
  currentContent,
}: AiAssistantPanelProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>(FALLBACK_TEMPLATES);
  const [selectedPreset, setSelectedPreset] = useState<string>(FALLBACK_TEMPLATES[0]?.id || 'improve_clarity');
  const [customInstructions, setCustomInstructions] = useState('');
  const [draftSuggestion, setDraftSuggestion] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [activeSuggestion, setActiveSuggestion] = useState<ActiveSuggestion | null>(null);

  const suggestionMutation = useGenerateAiSuggestion({
    onSuccess: (data, variables) => {
      setDraftSuggestion(data.suggestion);
      setActiveSuggestion({ ...data, presetUsed: variables.preset });
      toast.success('AI suggestion ready');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate suggestion');
    },
  });

  const feedbackMutation = useAiFeedback({
    onSuccess: () => {
      toast.success('Feedback saved');
      setFeedbackNote('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to record feedback');
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    aiService
      .getPromptTemplates()
      .then((items) => {
        if (cancelled) return;
        if (Array.isArray(items) && items.length > 0) {
          setTemplates(items);
          setSelectedPreset(items[0].id);
        }
      })
      .catch(() => {
        // Keep fallback templates
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDraftSuggestion('');
      setActiveSuggestion(null);
      setFeedbackNote('');
    }
  }, [isOpen]);

  const presetDescription = useMemo(() => {
    return templates.find((template) => template.id === selectedPreset)?.description;
  }, [templates, selectedPreset]);

  const handleGenerate = () => {
    if (suggestionMutation.isPending) return;
    if (!contentId || contentId <= 0) {
      toast.error('Save the post before requesting AI help.');
      return;
    }

    const payload: AiSuggestionRequest = {
      siteId,
      contentId,
      contentType,
      locale: 'en-US',
      preset: selectedPreset,
      customPrompt: customInstructions.trim() || undefined,
      context: {
        title: currentTitle || '',
        excerpt: currentExcerpt || '',
        content: currentContent || '',
      },
      metadata: {
        source: 'post-edit-panel',
      },
    };

    suggestionMutation.mutate(payload);
  };

  const handleInsert = (mode: 'append' | 'replace' = 'append') => {
    if (!draftSuggestion) {
      toast.error('Generate a suggestion first');
      return;
    }
    onInsert(draftSuggestion, mode);
    if (mode === 'replace') {
      toast.success('Replaced editor content with AI suggestion');
    } else {
      toast.success('Inserted suggestion into editor');
    }
  };

  const handleFeedback = (signal: AiFeedbackRequest['signal']) => {
    if (!activeSuggestion) {
      toast.error('Generate a suggestion before leaving feedback');
      return;
    }

    const payload: AiFeedbackRequest = {
      versionId: activeSuggestion.versionId,
      signal,
      comment: feedbackNote.trim() || undefined,
      promptSnapshot: activeSuggestion.prompt,
      suggestionSnapshot: draftSuggestion,
      preset: activeSuggestion.presetUsed,
    };

    feedbackMutation.mutate(payload);
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-40 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
            <p className="text-sm text-gray-500">Generate, edit, and insert AI-powered suggestions.</p>
          </div>
          <Button variant="secondary" onClick={onClose} size="sm">
            Close
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Prompt preset</h3>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedPreset(template.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedPreset === template.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="block text-sm font-medium">{template.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{template.description}</span>
                </button>
              ))}
            </div>
            {presetDescription && (
              <p className="text-xs text-gray-500">{presetDescription}</p>
            )}
          </section>

          <section className="space-y-2">
            <Textarea
              label="Additional instructions"
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Add tone, audience, or structural guidance"
              rows={3}
            />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">Suggestion preview</h3>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleInsert('replace')}
                  disabled={!draftSuggestion}
                >
                  Replace content
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleInsert('append')}
                  disabled={!draftSuggestion}
                >
                  Insert into editor
                </Button>
              </div>
            </div>
            <Textarea
              value={draftSuggestion}
              onChange={(event) => setDraftSuggestion(event.target.value)}
              placeholder="Generated suggestions will appear here for review and editing"
              rows={12}
            />
            {activeSuggestion?.warnings?.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <strong className="block font-medium">Safety checks</strong>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {activeSuggestion.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700">Feedback (optional)</h3>
            <Input
              label="Notes for the prompt team"
              value={feedbackNote}
              onChange={(event) => setFeedbackNote(event.target.value)}
              placeholder="What worked? What should change next time?"
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleFeedback('negative')}
                disabled={feedbackMutation.isPending || !activeSuggestion}
              >
                Needs work
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleFeedback('positive')}
                disabled={feedbackMutation.isPending || !activeSuggestion}
              >
                Use more like this
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleFeedback('neutral')}
                disabled={feedbackMutation.isPending || !activeSuggestion}
              >
                Neutral
              </Button>
            </div>
          </section>
        </div>

        <footer className="border-t border-gray-200 px-6 py-4">
          <Button
            type="button"
            className="w-full"
            onClick={handleGenerate}
            disabled={suggestionMutation.isPending}
          >
            {suggestionMutation.isPending ? 'Generating…' : 'Generate suggestion'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

export default AiAssistantPanel;
