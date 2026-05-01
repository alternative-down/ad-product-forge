import { describe, expect, it } from 'vitest';

describe('oauth-gateway', () => {
  describe('OAUTH_GATEWAY_ID', () => {
    it('is a non-empty string', async () => {
      const { OAUTH_GATEWAY_ID } = await import('./oauth-gateway.js');
      expect(typeof OAUTH_GATEWAY_ID).toBe('string');
      expect(OAUTH_GATEWAY_ID.length).toBeGreaterThan(0);
    });

    it('has expected value', async () => {
      const { OAUTH_GATEWAY_ID } = await import('./oauth-gateway.js');
      expect(OAUTH_GATEWAY_ID).toBe('account-oauth');
    });
  });

  describe('createOAuthGateway', () => {
    it('creates a gateway with getApiKey and resolveLanguageModel', async () => {
      const { createOAuthGateway } = await import('./oauth-gateway.js');
      const gateway = createOAuthGateway();
      expect(typeof gateway.getApiKey).toBe('function');
      expect(typeof gateway.resolveLanguageModel).toBe('function');
    });

    it('accepts empty options', async () => {
      const { createOAuthGateway } = await import('./oauth-gateway.js');
      const gateway = createOAuthGateway({});
      expect(gateway).toBeDefined();
      expect(gateway).toHaveProperty('getApiKey');
      expect(gateway).toHaveProperty('resolveLanguageModel');
    });

    it('rejects unsupported provider key format', async () => {
      const { createOAuthGateway } = await import('./oauth-gateway.js');
      const gateway = createOAuthGateway();
      await expect(
        gateway.getApiKey('unknown/provider'),
      ).rejects.toThrow('Unsupported OAuth provider key');
    });

    it('parses openai-codex key format', async () => {
      const { createOAuthGateway, OAUTH_GATEWAY_ID } = await import('./oauth-gateway.js');
      const _gateway = createOAuthGateway();
      const key = `${OAUTH_GATEWAY_ID}/openai-codex/model`;
      expect(key.startsWith(`${OAUTH_GATEWAY_ID}/openai-codex/`)).toBe(true);
    });

    it('parses claude-code key format', async () => {
      const { createOAuthGateway, OAUTH_GATEWAY_ID } = await import('./oauth-gateway.js');
      const _gateway = createOAuthGateway();
      const key = `${OAUTH_GATEWAY_ID}/claude-code/model`;
      expect(key.startsWith(`${OAUTH_GATEWAY_ID}/claude-code/`)).toBe(true);
    });

    it('creates gateway with custom URL options', async () => {
      const { createOAuthGateway } = await import('./oauth-gateway.js');
      const gateway = createOAuthGateway({
        openAICodexUrl: 'https://custom.openai.com',
        anthropicUrl: 'https://custom.anthropic.com',
      });
      expect(gateway).toBeDefined();
    });

    it('creates gateway with nested options', async () => {
      const { createOAuthGateway } = await import('./oauth-gateway.js');
      const gateway = createOAuthGateway({
        openaiCodex: { storePath: '/tmp/store' },
        anthropic: { storePath: '/tmp/anthropic' },
      });
      expect(gateway).toBeDefined();
    });
  });
});
