import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware } from 'ai';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel } from '@mastra/core/llm';

import { forgeDebug } from '../debug';
import { CLAUDE_MAX_MODELS, OPENAI_CODEX_MODELS } from './model-ids';
import { resolveAnthropicCredential, resolveOpenAICodexCredential } from './auth';

const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const OAUTH_GATEWAY_ID = 'oauth-gateway';
const ANTHROPIC_BETA_HEADER = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
].join(',');

type OpenAICodexGatewayOptions = {
  cliAuthFilePath?: string;
  storePath?: string;
};

type ClaudeMaxGatewayOptions = {
  authFilePath?: string;
  setupTokenFilePath?: string;
  storePath?: string;
};

export type OAuthGatewayOptions = {
  openaiCodex?: OpenAICodexGatewayOptions;
  claudeMax?: ClaudeMaxGatewayOptions;
};

const codexStreamMiddleware: LanguageModelMiddleware = {
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
          if (!textPart) {
            throw new Error(`Missing text part for stream id "${part.id}"`);
          }
          textPart.text += part.delta;
          break;
        }
        case 'reasoning-delta': {
          const reasoningPart = reasoningParts.get(part.id);
          if (!reasoningPart) {
            throw new Error(`Missing reasoning part for stream id "${part.id}"`);
          }
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

const claudeCodeMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const systemMessage = {
      role: 'system' as const,
      content: CLAUDE_CODE_IDENTITY,
    };

    if (params.temperature) {
      delete params.topP;
    }

    return {
      ...params,
      prompt: [systemMessage, ...params.prompt],
    };
  },
};

const promptCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    type PromptRecord = Record<string, unknown> & {
      role?: unknown;
      content?: unknown;
      providerOptions?: Record<string, Record<string, unknown>>;
    };

    const prompt = [...params.prompt] as PromptRecord[];
    const cacheControl = { type: 'ephemeral' as const, ttl: '1h' as const };

    const addCacheToMessage = (message: PromptRecord): PromptRecord => {
      if (typeof message.content === 'string') {
        return {
          ...message,
          providerOptions: {
            ...message.providerOptions,
            anthropic: { ...message.providerOptions?.anthropic, cacheControl },
          },
        };
      }

      if (Array.isArray(message.content) && message.content.length > 0) {
        const content = [...message.content];
        const lastPart = content[content.length - 1];
        if (typeof lastPart === 'string') {
          return message;
        }

        content[content.length - 1] = {
          ...lastPart,
          providerOptions: {
            ...lastPart.providerOptions,
            anthropic: { ...lastPart.providerOptions?.anthropic, cacheControl },
          },
        };

        return { ...message, content: content as typeof message.content };
      }

      return message;
    };

    let lastSystemIndex = -1;
    for (let index = prompt.length - 1; index >= 0; index--) {
      if (prompt[index]?.role === 'system') {
        lastSystemIndex = index;
        break;
      }
    }

    if (lastSystemIndex >= 0) {
      prompt[lastSystemIndex] = addCacheToMessage(prompt[lastSystemIndex]);
    }

    const lastIndex = prompt.length - 1;
    if (lastIndex >= 0 && lastIndex !== lastSystemIndex) {
      prompt[lastIndex] = addCacheToMessage(prompt[lastIndex]);
    }

    return { ...params, prompt: prompt as typeof params.prompt };
  },
};

export class OAuthModelGateway extends MastraModelGateway {
  readonly id = OAUTH_GATEWAY_ID;
  readonly name = 'oauth-gateway';

  constructor(private readonly options: OAuthGatewayOptions = {}) {
    super();
  }

  async fetchProviders() {
    return {
      'openai-codex': {
        name: 'OpenAI Codex OAuth',
        models: [...OPENAI_CODEX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.name,
      },
      'claude-max': {
        name: 'Claude Max OAuth',
        models: [...CLAUDE_MAX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.name,
      },
    };
  }

  async buildUrl(routerId: string) {
    if (routerId.startsWith(`${this.id}/openai-codex/`)) {
      return 'https://chatgpt.com/backend-api/codex';
    }

    if (routerId.startsWith(`${this.id}/claude-max/`)) {
      return 'https://api.anthropic.com/v1';
    }

    return undefined;
  }

  async getApiKey() {
    return 'oauth-placeholder';
  }

  async resolveLanguageModel({
    modelId,
    providerId,
  }: {
    modelId: string;
    providerId: string;
    apiKey: string;
    headers?: Record<string, string>;
  }): Promise<GatewayLanguageModel> {
    if (providerId === 'openai-codex') {
      const openai = createOpenAI({
        apiKey: 'oauth-placeholder',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        fetch: async (url, init) => {
          const credential = await resolveOpenAICodexCredential(this.options.openaiCodex);
          const headers = new Headers(init?.headers);
          headers.delete('authorization');
          headers.set('Authorization', `Bearer ${credential.access}`);

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
        middleware: codexStreamMiddleware,
      });
    }

    if (providerId === 'claude-max') {
      const anthropic = createAnthropic({
        apiKey: 'oauth-placeholder',
        fetch: async (url, init) => {
          const credential = await resolveAnthropicCredential(this.options.claudeMax);
          const headers = new Headers(init?.headers);

          headers.delete('x-api-key');
          headers.delete('authorization');
          headers.set('Authorization', `Bearer ${credential.access}`);
          headers.set('anthropic-beta', ANTHROPIC_BETA_HEADER);
          headers.set('anthropic-version', '2023-06-01');

          forgeDebug('provider:claude-max', 'request', {
            url: String(url),
          });

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
        middleware: [claudeCodeMiddleware, promptCacheMiddleware],
      });
    }

    throw new Error(`Unsupported oauth gateway provider: ${providerId}`);
  }
}

export function buildOAuthRouterId(providerId: 'openai-codex' | 'claude-max', modelId: string) {
  return `${OAUTH_GATEWAY_ID}/${providerId}/${modelId}` as const;
}
