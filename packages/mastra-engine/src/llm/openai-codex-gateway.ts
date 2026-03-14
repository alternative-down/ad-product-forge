import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware } from 'ai';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel } from '@mastra/core/llm';

import { forgeDebug } from '../debug';
import { OPENAI_CODEX_MODELS } from './model-ids';
import { resolveOpenAICodexCredential } from './openai-codex-auth';

export type OpenAICodexGatewayOptions = {
  cliAuthFilePath?: string;
  storePath?: string;
};

export class OpenAICodexGateway extends MastraModelGateway {
  readonly id = 'oauth-gateway';
  readonly name = 'oauth-gateway';
  private readonly middleware: LanguageModelMiddleware = {
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

  constructor(private readonly options: OpenAICodexGatewayOptions = {}) {
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
    };
  }

  async buildUrl(routerId: string) {
    if (routerId.startsWith(`${this.id}/openai-codex/`)) {
      return 'https://chatgpt.com/backend-api/codex';
    }

    return undefined;
  }

  async getApiKey() {
    return 'oauth-placeholder';
  }

  async resolveLanguageModel({ modelId, providerId }: { modelId: string; providerId: string; apiKey: string; headers?: Record<string, string>; }): Promise<GatewayLanguageModel> {
    if (providerId !== 'openai-codex') {
      throw new Error(`Unsupported oauth gateway provider: ${providerId}`);
    }

    const openai = createOpenAI({
      apiKey: 'oauth-placeholder',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      fetch: async (url, init) => {
        const credential = await resolveOpenAICodexCredential(this.options);
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
      middleware: this.middleware,
    });
  }
}
