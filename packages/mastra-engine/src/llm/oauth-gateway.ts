import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel, ProviderConfig } from '@mastra/core/llm';
import { wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware } from 'ai';

import { forgeDebug } from '../debug';
import { resolveAnthropicCredential } from './anthropic-auth';
import { CLAUDE_MAX_MODELS, OPENAI_CODEX_MODELS } from './model-ids';
import { resolveOpenAICodexCredential } from './openai-codex-auth';

const OPENAI_CODEX_URL = 'https://chatgpt.com/backend-api/codex';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_BETA_HEADER = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
].join(',');
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

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
};

export class OAuthGateway extends MastraModelGateway {
  readonly id = OAUTH_GATEWAY_ID;
  readonly name = 'Account OAuth Gateway';
  private readonly openAIMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const openaiOptions = params.providerOptions?.openai ?? {};
      const instructions = params.prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

      return {
        ...params,
        providerOptions: {
          ...params.providerOptions,
          openai: {
            ...openaiOptions,
            store: openaiOptions.store ?? false,
            instructions: openaiOptions.instructions ?? (instructions || undefined),
          },
        },
      };
    },
    wrapGenerate: async ({ doGenerate, doStream }) => {
      const { request, response: initialResponse, stream } = await doStream();
      type GenerateResult = Awaited<ReturnType<typeof doGenerate>>;
      type StreamPart = Awaited<ReturnType<typeof doStream>>['stream'] extends ReadableStream<infer Part>
        ? Part
        : never;
      type FinishPart = Extract<StreamPart, { type: 'finish' }>;
      type StreamStartPart = Extract<StreamPart, { type: 'stream-start' }>;
      type ContentPart = GenerateResult['content'][number];
      type TextPart = Extract<ContentPart, { type: 'text' }>;
      type ReasoningPart = Extract<ContentPart, { type: 'reasoning' }>;

      let warnings: StreamStartPart['warnings'] = [];
      let finish: FinishPart | undefined;
      let response = initialResponse;
      const content: GenerateResult['content'] = [];
      const textParts = new Map<string, TextPart>();
      const reasoningParts = new Map<string, ReasoningPart>();

      for await (const part of stream) {
        switch (part.type) {
          case 'stream-start':
            warnings = part.warnings;
            break;
          case 'response-metadata':
            response = { ...response, ...part };
            break;
          case 'text-start': {
            const textPart: TextPart = {
              type: 'text',
              text: '',
              ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
            };
            textParts.set(part.id, textPart);
            content.push(textPart);
            break;
          }
          case 'reasoning-start': {
            const reasoningPart: ReasoningPart = {
              type: 'reasoning',
              text: '',
              ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
            };
            reasoningParts.set(part.id, reasoningPart);
            content.push(reasoningPart);
            break;
          }
          case 'text-delta': {
            const textPart = textParts.get(part.id);
            if (!textPart) throw new Error(`Missing text part for stream id "${part.id}"`);
            textPart.text += part.delta;
            break;
          }
          case 'reasoning-delta': {
            const reasoningPart = reasoningParts.get(part.id);
            if (!reasoningPart) throw new Error(`Missing reasoning part for stream id "${part.id}"`);
            reasoningPart.text += part.delta;
            break;
          }
          case 'tool-call':
          case 'tool-result':
          case 'source':
          case 'file':
            content.push(part);
            break;
          case 'error':
            throw part.error instanceof Error ? part.error : new Error(String(part.error));
          case 'finish':
            finish = part;
            break;
          case 'text-end':
          case 'reasoning-end':
          case 'tool-input-start':
          case 'tool-input-delta':
          case 'tool-input-end':
          case 'raw':
            break;
        }
      }

      if (!finish) {
        throw new Error('OpenAI Codex stream ended without a finish part');
      }

      return {
        request,
        response,
        warnings,
        finishReason: finish.finishReason,
        usage: finish.usage,
        providerMetadata: finish.providerMetadata,
        content,
      };
    },
  };
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

  constructor(private readonly options: OAuthGatewayOptions = {}) {
    super();
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      'openai-codex': {
        name: 'OpenAI Codex OAuth',
        models: [...OPENAI_CODEX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: OPENAI_CODEX_URL,
      },
      'claude-max': {
        name: 'Claude Max OAuth',
        models: [...CLAUDE_MAX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: ANTHROPIC_URL,
      },
    };
  }

  buildUrl(modelId: string) {
    if (modelId.startsWith(`${this.id}/openai-codex/`)) {
      return OPENAI_CODEX_URL;
    }

    if (modelId.startsWith(`${this.id}/claude-max/`)) {
      return ANTHROPIC_URL;
    }

    return undefined;
  }

  async getApiKey(modelId: string) {
    if (modelId.startsWith(`${this.id}/openai-codex/`)) {
      return (await resolveOpenAICodexCredential(this.options.openaiCodex)).access;
    }

    if (modelId.startsWith(`${this.id}/claude-max/`)) {
      return (await resolveAnthropicCredential(this.options.anthropic)).access;
    }

    throw new Error(`Unsupported gateway model: ${modelId}`);
  }

  async resolveLanguageModel(args: {
    modelId: string;
    providerId: string;
    apiKey: string;
    headers?: Record<string, string>;
  }): Promise<GatewayLanguageModel> {
    if (args.providerId === 'openai-codex') {
      const baseURL = this.buildUrl(`${this.id}/${args.providerId}/${args.modelId}`);

      if (!baseURL) {
        throw new Error(`Unsupported gateway model: ${args.providerId}/${args.modelId}`);
      }

      const openai = createOpenAI({
        apiKey: args.apiKey,
        baseURL,
        fetch: async (url, init) => {
          const credential = await resolveOpenAICodexCredential(this.options.openaiCodex);
          const headers = new Headers(init?.headers);
          headers.delete('authorization');
          headers.set('Authorization', `Bearer ${args.apiKey}`);

          if (credential.accountId) {
            headers.set('ChatGPT-Account-Id', credential.accountId);
          }

          forgeDebug('provider:openai-codex', 'request', {
            url: String(url),
            hasAccountId: Boolean(credential.accountId),
          });

          const response = await fetch(url, { ...init, headers });

          forgeDebug('provider:openai-codex', 'response', {
            url: String(url),
            status: response.status,
            ok: response.ok,
          });

          return response;
        },
      });

      return wrapLanguageModel({
        model: openai.responses(args.modelId),
        middleware: this.openAIMiddleware,
      });
    }

    if (args.providerId === 'claude-max') {
      const baseURL = this.buildUrl(`${this.id}/${args.providerId}/${args.modelId}`);

      if (!baseURL) {
        throw new Error(`Unsupported gateway model: ${args.providerId}/${args.modelId}`);
      }

      const anthropic = createAnthropic({
        apiKey: args.apiKey,
        baseURL,
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          headers.delete('x-api-key');
          headers.delete('authorization');
          headers.set('Authorization', `Bearer ${args.apiKey}`);
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
        model: anthropic(args.modelId),
        middleware: [this.claudeCodeMiddleware, this.promptCacheMiddleware],
      });
    }

    throw new Error(`Unsupported gateway provider: ${args.providerId}`);
  }
}

export function createOAuthGateway(options?: OAuthGatewayOptions) {
  return new OAuthGateway(options);
}
