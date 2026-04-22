import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

import { resolveAnthropicCredential } from './oauth-anthropic.js';
import { resolveOpenAICodexCredential } from './oauth-openai-codex.js';

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

const promptCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
    const prompt = [...params.prompt] as Array<Record<string, unknown>>;
    const lastIndex = prompt.length - 1;
    const reversedSystemIndex = [...prompt].reverse().findIndex((message) => message.role === 'system');
    const indicesToCache =
      reversedSystemIndex >= 0
        ? [lastIndex - reversedSystemIndex, lastIndex].filter((value, index, list) => list.indexOf(value) === index)
        : [lastIndex];

    for (const index of indicesToCache) {
      if (index < 0) {
        continue;
      }

      const message = prompt[index] as {
        content?: unknown;
        providerOptions?: Record<string, Record<string, unknown>>;
      };

      if (typeof message.content === 'string') {
        prompt[index] = {
          ...message,
          providerOptions: {
            ...message.providerOptions,
            anthropic: { ...message.providerOptions?.anthropic, cacheControl },
          },
        };
        continue;
      }

      if (!Array.isArray(message.content) || message.content.length === 0) {
        continue;
      }

      const content = [...message.content];
      const lastPart = content[content.length - 1];

      if (typeof lastPart === 'string') {
        continue;
      }

      content[content.length - 1] = {
        ...lastPart,
        providerOptions: {
          ...lastPart.providerOptions,
          anthropic: { ...lastPart.providerOptions?.anthropic, cacheControl },
        },
      };

      prompt[index] = {
        ...message,
        content,
      };
    }

    return {
      ...params,
      prompt: prompt as typeof params.prompt,
    };
  },
};

export function wrapAnthropicPromptCacheModel(
  model: Parameters<typeof wrapLanguageModel>[0]['model'],
): ReturnType<typeof wrapLanguageModel> {
  return wrapLanguageModel({
    model,
    middleware: promptCacheMiddleware,
  });
}

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
