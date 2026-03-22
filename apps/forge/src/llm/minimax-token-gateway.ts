import { createAnthropic } from '@ai-sdk/anthropic';
import { MINIMAX_MODELS } from '@mastra-engine/core';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel, ProviderConfig } from '@mastra/core/llm';
import { wrapLanguageModel } from 'ai';

import type { createSystemIntegrationStore } from '../system-integrations/store.js';

const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';
const MINIMAX_PROVIDER_ID = 'minimax';
export const TOKEN_PLAN_GATEWAY_ID = 'token-plan';

export class MiniMaxTokenGateway extends MastraModelGateway {
  readonly id = TOKEN_PLAN_GATEWAY_ID;
  readonly name = 'Token Plan Gateway';

  constructor(private readonly options: {
    integrations: ReturnType<typeof createSystemIntegrationStore>;
  }) {
    super();
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    const baseUrl = await this.getBaseUrl();

    return {
      [MINIMAX_PROVIDER_ID]: {
        name: 'MiniMax Token Plan',
        models: [...MINIMAX_MODELS],
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: baseUrl,
      },
    };
  }

  async buildUrl(modelId: string) {
    if (!modelId.startsWith(`${this.id}/${MINIMAX_PROVIDER_ID}/`)) {
      return undefined;
    }

    return this.getBaseUrl();
  }

  async getApiKey(modelId: string) {
    if (!modelId.startsWith(`${this.id}/${MINIMAX_PROVIDER_ID}/`)) {
      throw new Error(`Unsupported gateway model: ${modelId}`);
    }

    const integration = await this.options.integrations.getMiniMaxConfig();

    if (!integration) {
      throw new Error('MiniMax token plan is not configured');
    }

    return integration.apiKey;
  }

  async resolveLanguageModel(args: {
    modelId: string;
    providerId: string;
    apiKey: string;
    headers?: Record<string, string>;
  }): Promise<GatewayLanguageModel> {
    if (args.providerId !== MINIMAX_PROVIDER_ID) {
      throw new Error(`Unsupported gateway provider: ${args.providerId}`);
    }

    return this.resolveMiniMaxModel(args.modelId, args.apiKey);
  }

  private async resolveMiniMaxModel(modelId: string, apiKey: string) {
    const baseURL = await this.buildUrl(`${this.id}/${MINIMAX_PROVIDER_ID}/${modelId}`);

    if (!baseURL) {
      throw new Error(`Unsupported gateway model: ${MINIMAX_PROVIDER_ID}/${modelId}`);
    }

    const anthropic = createAnthropic({
      apiKey,
      baseURL,
    });

    return wrapLanguageModel({
      model: anthropic(modelId),
      middleware: [],
    });
  }

  private async getBaseUrl() {
    const integration = await this.options.integrations.getMiniMaxConfig();
    return integration?.baseUrl?.replace(/\/$/, '') ?? MINIMAX_BASE_URL;
  }
}

export function createMiniMaxTokenGateway(options: {
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
  return new MiniMaxTokenGateway(options);
}
