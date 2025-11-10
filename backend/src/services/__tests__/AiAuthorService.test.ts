import { AiAuthorService, GenerateSuggestionInput } from '../AiAuthorService';
import { ContentType, VersionType } from '../../types/versioning';
import { VersionService } from '../VersionService';

describe('AiAuthorService', () => {
  const ORIGINAL_ENV = process.env;
  let versionServiceMock: jest.Mocked<VersionService>;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    versionServiceMock = {
      createAiDraftVersion: jest.fn(),
      recordAiFeedback: jest.fn(),
    } as unknown as jest.Mocked<VersionService>;

    process.env.AI_PROVIDER = 'mock';
    delete process.env.AI_API_KEY;

    versionServiceMock.createAiDraftVersion.mockResolvedValue({
      success: true,
      data: {
        id: 42,
        meta_data: {},
      },
    } as any);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  const buildInput = (overrides: Partial<GenerateSuggestionInput> = {}): GenerateSuggestionInput => ({
    siteId: 1,
    contentId: 99,
    contentType: ContentType.POST,
    locale: 'en-US',
    context: {
      title: 'Example title',
      excerpt: 'Short excerpt',
      content: 'Main content <script>alert(1)</script>',
    },
    ...overrides,
  });

  it('generates a sanitized suggestion and persists an AI draft version', async () => {
    const service = new AiAuthorService(versionServiceMock);

    const result = await service.generateSuggestion(buildInput(), 7);

    expect(result.suggestion).not.toContain('<script');
    expect(result.versionId).toBe(42);
    expect(result.provenance.preset).toBe('improve_clarity');

    expect(versionServiceMock.createAiDraftVersion).toHaveBeenCalledTimes(1);
    const [payload, userId, provenance] = versionServiceMock.createAiDraftVersion.mock.calls[0];

    expect(userId).toBe(7);
    expect(payload.content).toBe(result.suggestion);
    expect(payload.version_type).toBe(VersionType.DRAFT);
    expect(provenance.provider).toBeDefined();
    expect(provenance.prompt).toContain('Rewrite the provided draft');
  });

  it('records feedback via the VersionService', async () => {
    const service = new AiAuthorService(versionServiceMock);

    await service.recordFeedback({
      versionId: 42,
      userId: 7,
      signal: 'positive',
      comment: 'Great output',
      promptSnapshot: 'prompt text',
      suggestionSnapshot: 'suggestion',
      preset: 'improve_clarity',
    });

    expect(versionServiceMock.recordAiFeedback).toHaveBeenCalledWith(42, 7, {
      signal: 'positive',
      comment: 'Great output',
      prompt_snapshot: 'prompt text',
      suggestion_snapshot: 'suggestion',
      preset: 'improve_clarity',
    });
  });
});
