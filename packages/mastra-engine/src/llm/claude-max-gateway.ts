import { createAnthropic } from '@ai-sdk/anthropic';
import { wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware } from 'ai';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel } from '@mastra/core/llm';

import { forgeDebug } from '../debug';
import { resolveAnthropicCredential } from './anthropic-auth';
import { CLAUDE_MAX_MODELS } from './model-ids';

const ANTHROPIC_BETA_HEADER = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
].join(',');
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

export type ClaudeMaxGatewayOptions = {
  authFilePath?: string;
  setupTokenFilePath?: string;
  storePath?: string;
};

export class ClaudeMaxGateway extends MastraModelGateway {
  readonly id = 'oauth-gateway';
  readonly name = 'oauth-gateway';
  private readonly claudeCodeMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const prompt = [{ role: 'system' as const, content: CLAUDE_CODE_IDENTITY }, ...params.prompt];

      if (params.temperature) {
        delete params.topP;
      }

      return {
        ...params,
        prompt,
      };
    },
  };
  private readonly promptCacheMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
      const prompt = [...params.prompt] as Array<Record<string, unknown>>;
      const indices = [prompt.length - 1];

      for (let index = prompt.length - 1; index >= 0; index -= 1) {
        if (prompt[index]?.role === 'system') {
          indices.unshift(index);
          break;
        }
      }

      for (const index of indices) {
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

        prompt[index] = { ...message, content };
      }

      return { ...params, prompt: prompt as typeof params.prompt };
    },
  };

  constructor(private readonly options: ClaudeMaxGatewayOptions = {}) {
    super();
  }

  async fetchProviders() {
    return {
      'claude-max': {
        name: 'Claude Max OAuth',
        models: [...CLAUDE_MAX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.name,
      },
    };
  }

  async buildUrl(routerId: string) {
    if (routerId.startsWith(`${this.id}/claude-max/`)) {
      return 'https://api.anthropic.com/v1';
    }

    return undefined;
  }

  async getApiKey() {
    return 'oauth-placeholder';
  }

  async resolveLanguageModel({ modelId, providerId }: { modelId: string; providerId: string; apiKey: string; headers?: Record<string, string>; }): Promise<GatewayLanguageModel> {
    if (providerId !== 'claude-max') {
      throw new Error(`Unsupported oauth gateway provider: ${providerId}`);
    }

    const anthropic = createAnthropic({
      apiKey: 'oauth-placeholder',
      fetch: async (url, init) => {
        const credential = await resolveAnthropicCredential(this.options);
        const headers = new Headers(init?.headers);
        headers.delete('x-api-key');
        headers.delete('authorization');
        headers.set('Authorization', `Bearer ${credential.access}`);
        headers.set('anthropic-beta', ANTHROPIC_BETA_HEADER);
        headers.set('anthropic-version', '2023-06-01');

        forgeDebug('provider:claude-max', 'request', { url: String(url) });
        const response = await fetch(url, { ...init, headers });
        forgeDebug('provider:claude-max', 'response', {
          url: String(url),
          status: response.status,
          ok: response.ok,
        });
        return response;
      },
    });

    return wrapLanguageModel({
      model: anthropic(modelId),
      middleware: [this.claudeCodeMiddleware, this.promptCacheMiddleware],
    });
  }
}
