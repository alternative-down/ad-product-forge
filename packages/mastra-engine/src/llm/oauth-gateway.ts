import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel, ProviderConfig } from '@mastra/core/llm';
import { wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware } from 'ai';

import { forgeDebug } from '../debug';
import { resolveAnthropicCredential } from './auth/anthropic';
import { CLAUDE_MAX_MODELS, OPENAI_CODEX_MODELS } from './model-ids';
import { resolveOpenAICodexCredential } from './auth/openai-codex';

const OPENAI_CODEX_URL = 'https://chatgpt.com/backend-api/codex';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_BETA_HEADER = [
  'oauth-2025-04-20',                    // OAuth 2.0 support
  'claude-code-20250219',                // Claude Code CLI integration
  'interleaved-thinking-2025-05-14',     // Extended thinking / reasoning
  'fine-grained-tool-streaming-2025-05-14', // Fine-grained tool call streaming
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
  openAICodexUrl?: string;
  anthropicUrl?: string;
};

export class OAuthGateway extends MastraModelGateway {
  readonly id = OAUTH_GATEWAY_ID;
  readonly name = 'Account OAuth Gateway';
  private readonly openAICodexUrl: string;
  private readonly anthropicUrl: string;

  // Middleware for OpenAI Codex provider. Handles store instructions and stream processing.
  // Applied to: 'openai-codex' models
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
            reasoningEffort: openaiOptions.reasoningEffort ?? 'medium',
          },
        },
      };
    },
    wrapGenerate: async ({ doGenerate: _doGenerate, doStream }) => {
      const { request, response: initialResponse, stream } = await doStream();
      type GenerateResult = Awaited<ReturnType<typeof _doGenerate>>;
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
  // Middleware for Claude Code provider. Adds Claude Code identity context.
  // Applied to: 'claude-code' models
  // Prepends a system message identifying the model as Claude Code, and removes topP if temperature is set.
  private readonly claudeCodeMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const anthropicOptions = params.providerOptions?.anthropic ?? {};
      const prompt = [{ role: 'system' as const, content: CLAUDE_CODE_IDENTITY }, ...params.prompt];

      if (params.temperature) {
        delete params.topP;
      }

      return {
        ...params,
        prompt,
        providerOptions: {
          ...params.providerOptions,
          anthropic: {
            ...anthropicOptions,
            effort: anthropicOptions.effort ?? 'medium',
          },
        },
      };
    },
  };
  // Middleware for Claude Code provider. Applies prompt caching to system and last message.
  // Applied to: 'claude-code' models (with claudeCodeMiddleware)
  // Ordering: claudeCodeMiddleware runs first to add identity, then promptCacheMiddleware adds cache control.
  // Caches the system message and the last user message with ephemeral cache control.
  private readonly promptCacheMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };
      const prompt = [...params.prompt] as Array<Record<string, unknown>>;
      const lastIndex = prompt.length - 1;

      // Find system message by searching from the end
      const systemIndex = [...prompt].reverse().findIndex((m) => m.role === 'system');

      // Build list of indices to cache: system message (if found) and last message
      const indicesToCache = systemIndex >= 0
        ? [lastIndex - systemIndex, lastIndex].filter((v, i, a) => a.indexOf(v) === i)
        : [lastIndex];

      const indices = indicesToCache;

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
    this.openAICodexUrl = options.openAICodexUrl ?? OPENAI_CODEX_URL;
    this.anthropicUrl = options.anthropicUrl ?? ANTHROPIC_URL;
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      'openai-codex': {
        name: 'OpenAI Codex OAuth',
        models: [...OPENAI_CODEX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: this.openAICodexUrl,
      },
      'claude-code': {
        name: 'Claude Code OAuth',
        models: [...CLAUDE_MAX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: this.anthropicUrl,
      },
    };
  }

  buildUrl(modelId: string) {
    if (modelId.startsWith(`${this.id}/openai-codex/`)) {
      return this.openAICodexUrl;
    }

    if (modelId.startsWith(`${this.id}/claude-code/`)) {
      return this.anthropicUrl;
    }

    return undefined;
  }

  async getApiKey(modelId: string) {
    if (modelId.startsWith(`${this.id}/openai-codex/`)) {
      return (await resolveOpenAICodexCredential(this.options.openaiCodex)).access;
    }

    if (modelId.startsWith(`${this.id}/claude-code/`)) {
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
    switch (args.providerId) {
      case 'openai-codex':
        return this.resolveOpenAICodexModel(args.modelId, args.apiKey);
      case 'claude-code':
        return this.resolveClaudeMaxModel(args.modelId, args.apiKey);
      default:
        throw new Error(`Unsupported gateway provider: ${args.providerId}`);
    }
  }

  private async resolveOpenAICodexModel(modelId: string, apiKey: string) {
    const baseURL = this.buildUrl(`${this.id}/openai-codex/${modelId}`);

    if (!baseURL) {
      throw new Error(`Unsupported gateway model: openai-codex/${modelId}`);
    }

    const openai = createOpenAI({
      apiKey,
      baseURL,
      fetch: async (url, init) => {
        const credential = await resolveOpenAICodexCredential(this.options.openaiCodex);
        const headers = new Headers(init?.headers);
        headers.delete('authorization');
        headers.set('Authorization', `Bearer ${apiKey}`);

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
      model: openai.responses(modelId),
      middleware: this.openAIMiddleware,
    });
  }

  private async resolveClaudeMaxModel(modelId: string, apiKey: string) {
    const baseURL = this.buildUrl(`${this.id}/claude-code/${modelId}`);

    if (!baseURL) {
      throw new Error(`Unsupported gateway model: claude-code/${modelId}`);
    }

    const anthropic = createAnthropic({
      apiKey,
      baseURL,
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.delete('x-api-key');
        headers.delete('authorization');
        headers.set('Authorization', `Bearer ${apiKey}`);
        headers.set('anthropic-beta', ANTHROPIC_BETA_HEADER);
        headers.set('anthropic-version', '2023-06-01');

        forgeDebug('provider:claude-code', 'request', { url: String(url) });
        const response = await fetch(url, { ...init, headers });
        forgeDebug('provider:claude-code', 'response', {
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

export function createOAuthGateway(options?: OAuthGatewayOptions) {
  return new OAuthGateway(options);
}
