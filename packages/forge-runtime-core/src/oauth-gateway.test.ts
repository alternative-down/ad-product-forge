import { describe, expect, it, vi } from 'vitest';

import { createOAuthGateway, OAUTH_GATEWAY_ID } from './oauth-gateway.js';

vi.mock('./oauth-anthropic.js', () => ({
  resolveAnthropicCredential: vi.fn().mockResolvedValue({ access: 'test-api-key' }),
}));

vi.mock('./oauth-openai-codex.js', () => ({
  resolveOpenAICodexCredential: vi.fn().mockResolvedValue({ access: 'test-api-key' }),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(() => ({ provider: 'anthropic' })),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue(() => ({ provider: 'openai' })),
}));

vi.mock('./anthropic-prompt-cache.js', () => ({
  wrapAnthropicPromptCacheModel: vi.fn().mockImplementation((m) => m),
}));

describe('createOAuthGateway', () => {
  describe('getApiKey', () => {
    it('resolves api key for openai-codex provider key', async () => {
      const gateway = createOAuthGateway();
      const apiKey = await gateway.getApiKey(`${OAUTH_GATEWAY_ID}/openai-codex/some-account`);
      expect(apiKey).toBe('test-api-key');
    });

    it('resolves api key for claude-code provider key', async () => {
      const gateway = createOAuthGateway();
      const apiKey = await gateway.getApiKey(`${OAUTH_GATEWAY_ID}/claude-code/some-account`);
      expect(apiKey).toBe('test-api-key');
    });

    it('throws for unsupported provider prefix', async () => {
      const gateway = createOAuthGateway();
      await expect(gateway.getApiKey('other-provider/key')).rejects.toThrow(
        'Unsupported OAuth provider key: other-provider/key',
      );
    });

    it('throws for oauth-gateway without sub-provider', async () => {
      const gateway = createOAuthGateway();
      await expect(gateway.getApiKey(OAUTH_GATEWAY_ID)).rejects.toThrow(
        'Unsupported OAuth provider key',
      );
    });
  });

  describe('resolveLanguageModel', () => {
    it('resolves openai-codex model via createOpenAI', () => {
      const gateway = createOAuthGateway();
      const result = gateway.resolveLanguageModel({
        providerId: 'openai-codex',
        modelId: 'gpt-4',
        apiKey: 'test-key',
      });
      expect(result).toHaveProperty('provider', 'openai');
    });

    it('resolves claude-code model via createAnthropic with wrapped model', () => {
      const gateway = createOAuthGateway();
      const result = gateway.resolveLanguageModel({
        providerId: 'claude-code',
        modelId: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });
      expect(result).toHaveProperty('provider', 'anthropic');
    });

    it('uses custom openAICodexUrl when provided', () => {
      const gateway = createOAuthGateway({ openAICodexUrl: 'https://custom.openai.com/v1' });
      const result = gateway.resolveLanguageModel({
        providerId: 'openai-codex',
        modelId: 'gpt-4',
        apiKey: 'test-key',
      });
      expect(result).toBeDefined();
    });

    it('uses custom anthropicUrl when provided', () => {
      const gateway = createOAuthGateway({ anthropicUrl: 'https://custom.anthropic.com/v1' });
      const result = gateway.resolveLanguageModel({
        providerId: 'claude-code',
        modelId: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });
      expect(result).toBeDefined();
    });

    it('returns different model instances per call', () => {
      const gateway = createOAuthGateway();
      const model1 = gateway.resolveLanguageModel({
        providerId: 'openai-codex',
        modelId: 'gpt-4',
        apiKey: 'key1',
      });
      const model2 = gateway.resolveLanguageModel({
        providerId: 'openai-codex',
        modelId: 'gpt-4o',
        apiKey: 'key2',
      });
      expect(model1).not.toBe(model2);
    });
  });

  it('exposes OAUTH_GATEWAY_ID constant', () => {
    expect(OAUTH_GATEWAY_ID).toBe('account-oauth');
  });
});
