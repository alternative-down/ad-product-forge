import { afterEach, describe, expect, test, vi } from 'vitest';

const mockModel = vi.fn();

const mocks = vi.hoisted(() => ({
  createAnthropic: vi.fn().mockReturnValue(() => mockModel),
  createOAuthGateway: vi.fn().mockImplementation(() => ({
    getApiKey: vi.fn().mockResolvedValue('oauth-key-123'),
    resolveLanguageModel: vi
      .fn()
      .mockResolvedValue({ id: 'claude-sonnet-4-20250514', apiKey: 'oauth-key-123' }),
  })),
  wrapAnthropicPromptCacheModel: vi.fn().mockImplementation((m: any) => ({ ...m, cached: true })),
  OAUTH_GATEWAY_ID: 'oauth-gateway',
}));

vi.mock('@forge-runtime/core', () => ({
  createOAuthGateway: mocks.createOAuthGateway,
  OAUTH_GATEWAY_ID: mocks.OAUTH_GATEWAY_ID,
  wrapAnthropicPromptCacheModel: mocks.wrapAnthropicPromptCacheModel,
  AgentConfig: {} as any, // type import,
  forgeDebug: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mocks.createAnthropic,
}));

import { resolveProfileRuntimeModel } from './runtime-model';

describe('resolveProfileRuntimeModel', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockModel.mockReset();
  });

  // ── OAuth gateway paths ──────────────────────────────────────────────────

  test('resolves oauth-gateway providerId=claude-code', async () => {
    const result = await resolveProfileRuntimeModel({
      modelKey: 'oauth-gateway/claude-code/claude-sonnet-4-20250514',
      baseUrl: null,
      apiKey: 'user-key',
    });

    const gateway = mocks.createOAuthGateway.mock.results[0].value;
    expect(gateway.getApiKey).toHaveBeenCalledWith(
      'oauth-gateway/claude-code/claude-sonnet-4-20250514',
    );
    expect(gateway.resolveLanguageModel).toHaveBeenCalledWith({
      modelId: 'claude-sonnet-4-20250514',
      providerId: 'claude-code',
      apiKey: 'oauth-key-123',
    });
    expect(result).toMatchObject({ id: 'claude-sonnet-4-20250514', apiKey: 'oauth-key-123' });
  });

  test('resolves oauth-gateway providerId=openai-codex', async () => {
    const result = await resolveProfileRuntimeModel({
      modelKey: 'oauth-gateway/openai-codex/gpt-4o',
      baseUrl: null,
      apiKey: 'user-key',
    });

    const gateway = mocks.createOAuthGateway.mock.results[0].value;
    expect(gateway.resolveLanguageModel).toHaveBeenCalledWith({
      modelId: 'gpt-4o',
      providerId: 'openai-codex',
      apiKey: 'oauth-key-123',
    });
    expect(result).toMatchObject({ id: 'claude-sonnet-4-20250514', apiKey: 'oauth-key-123' });
  });

  test('throws when oauth-gateway modelKey has missing providerId', async () => {
    await expect(
      resolveProfileRuntimeModel({
        modelKey: 'oauth-gateway/',
        baseUrl: null,
        apiKey: 'user-key',
      }),
    ).rejects.toThrow('Invalid account OAuth model key: oauth-gateway/');
  });

  test('throws when oauth-gateway modelKey has missing modelId', async () => {
    await expect(
      resolveProfileRuntimeModel({
        modelKey: 'oauth-gateway/claude-code/',
        baseUrl: null,
        apiKey: 'user-key',
      }),
    ).rejects.toThrow('Invalid account OAuth model key: oauth-gateway/claude-code/');
  });

  // ── MiniMax paths ───────────────────────────────────────────────────────

  test('resolves minimax-coding-plan with api.minimax.io', async () => {
    mockModel.mockReturnValue({ id: 'minimax-model', apiKey: 'minimax-key' });
    mocks.createAnthropic.mockReturnValue(() => mockModel);

    const result = await resolveProfileRuntimeModel({
      modelKey: 'minimax-coding-plan/abchat6',
      baseUrl: 'https://api.minimax.io',
      apiKey: 'minimax-key',
    });

    expect(mocks.createAnthropic).toHaveBeenCalledWith({
      authToken: 'minimax-key',
      baseURL: 'https://api.minimax.io/anthropic/v1',
    });
    expect(result).toMatchObject({ cached: true });
  });

  test('resolves minimax-coding-plan with custom baseUrl', async () => {
    mockModel.mockReturnValue({ id: 'minimax-model', apiKey: 'minimax-key' });
    mocks.createAnthropic.mockReturnValue(() => mockModel);

    await resolveProfileRuntimeModel({
      modelKey: 'minimax-coding-plan/abchat6',
      baseUrl: 'https://custom.minimax.io',
      apiKey: 'minimax-key',
    });

    expect(mocks.createAnthropic).toHaveBeenCalledWith({
      authToken: 'minimax-key',
      baseURL: 'https://custom.minimax.io',
    });
  });

  test('resolves minimax-coding-plan with null baseUrl', async () => {
    mockModel.mockReturnValue({ id: 'minimax-model', apiKey: 'minimax-key' });
    mocks.createAnthropic.mockReturnValue(() => mockModel);

    await resolveProfileRuntimeModel({
      modelKey: 'minimax-coding-plan/abchat6',
      baseUrl: null,
      apiKey: 'minimax-key',
    });

    expect(mocks.createAnthropic).toHaveBeenCalledWith({
      authToken: 'minimax-key',
      baseURL: 'https://api.minimax.io/anthropic/v1',
    });
  });

  test('throws when minimax modelKey has empty modelId', async () => {
    await expect(
      resolveProfileRuntimeModel({
        modelKey: 'minimax-coding-plan/',
        baseUrl: null,
        apiKey: 'key',
      }),
    ).rejects.toThrow('Invalid MiniMax coding model key: minimax-coding-plan/');
  });

  // ── Generic model path ───────────────────────────────────────────────────

  test('returns generic model with apiKey and optional url', async () => {
    const result = await resolveProfileRuntimeModel({
      modelKey: 'openai/gpt-4-turbo',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-abc',
    });

    expect(result).toMatchObject({
      id: 'openai/gpt-4-turbo',
      apiKey: 'sk-abc',
      url: 'https://api.openai.com/v1',
    });
    expect(mocks.createOAuthGateway).not.toHaveBeenCalled();
    expect(mocks.createAnthropic).not.toHaveBeenCalled();
  });

  test('returns generic model without url when baseUrl is null', async () => {
    const result = await resolveProfileRuntimeModel({
      modelKey: 'openai/gpt-4-turbo',
      baseUrl: null,
      apiKey: 'sk-abc',
    });

    expect(result).toMatchObject({
      id: 'openai/gpt-4-turbo',
      apiKey: 'sk-abc',
    });
    expect(result).not.toHaveProperty('url');
  });
});
