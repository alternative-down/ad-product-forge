import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

import { wrapAnthropicPromptCacheModel } from './anthropic-prompt-cache.js';
import { resolveAnthropicCredential } from './oauth-anthropic.js';
import { resolveOpenAICodexCredential } from './oauth-openai-codex.js';

export { wrapAnthropicPromptCacheModel } from './anthropic-prompt-cache.js';

export const OAUTH_GATEWAY_ID = 'account-oauth';

export type OAuthGatewayOptions = {
  openaiCodex?: {
    cliAuthFilePath?: string;
    storePath?: string;
  };
  anthropic?: {
    authFilePath?: string;
    setupTokenFilePath?: string;
    storePath?: string;
  };
  openAICodexUrl?: string;
  anthropicUrl?: string;
};

export type OAuthGateway = {
  getApiKey(providerKey: string): Promise<string>;
  resolveLanguageModel(input: {
    providerId: 'openai-codex' | 'claude-code';
    modelId: string;
    apiKey: string;
  }): unknown;
};

const OPENAI_CODEX_URL = 'https://chatgpt.com/backend-api/codex';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_BETA_HEADER = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
].join(',');

export function createOAuthGateway(options: OAuthGatewayOptions = {}): OAuthGateway {
  return {
    async getApiKey(providerKey: string) {
      if (providerKey.startsWith(`${OAUTH_GATEWAY_ID}/openai-codex/`)) {
        return (await resolveOpenAICodexCredential(options.openaiCodex)).access;
      }

      if (providerKey.startsWith(`${OAUTH_GATEWAY_ID}/claude-code/`)) {
        return (await resolveAnthropicCredential(options.anthropic)).access;
      }

      throw new Error(`Unsupported OAuth provider key: ${providerKey}`);
    },
    resolveLanguageModel(input: {
      providerId: 'openai-codex' | 'claude-code';
      modelId: string;
      apiKey: string;
    }) {
      if (input.providerId === 'openai-codex') {
        return createOpenAI({
          apiKey: input.apiKey,
          baseURL: options.openAICodexUrl ?? OPENAI_CODEX_URL,
        })(input.modelId);
      }

      return wrapAnthropicPromptCacheModel(
        createAnthropic({
          authToken: input.apiKey,
          baseURL: options.anthropicUrl ?? ANTHROPIC_URL,
          headers: {
            'anthropic-beta': ANTHROPIC_BETA_HEADER,
          },
        })(input.modelId),
      );
    },
  };
}
