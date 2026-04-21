import { createAnthropic } from '@ai-sdk/anthropic';

import { AiSdkStepModelAdapter } from '../adapters/ai-sdk.js';
import {
  splitProviderModelId,
  type StepModelProviderConfig,
  type StepModelProviderGateway,
} from '../gateways/providers.js';

export type MiniMaxTextModelOptions = {
  apiKey: string;
  modelId?: string;
  system?: string;
  temperature?: number;
  baseURL?: string;
  headers?: Record<string, string>;
};

export function createMiniMaxTextModelAdapter(
  options: MiniMaxTextModelOptions,
) {
  const anthropic = createAnthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? 'https://api.minimax.io/anthropic/v1',
    headers: options.headers,
    name: 'minimax.messages',
  });
  const modelId = splitProviderModelId(options.modelId ?? 'MiniMax-M2.7').providerModelId;

  return new AiSdkStepModelAdapter({
    model: anthropic(modelId),
    system: options.system,
    temperature: options.temperature,
    provider: 'minimax',
    modelId,
  });
}

export class MiniMaxProviderGateway implements StepModelProviderGateway {
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(options: { apiKey: string; baseURL?: string }) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL ?? 'https://api.minimax.io/anthropic/v1';
  }

  async createStepModel(config: StepModelProviderConfig) {
    return createMiniMaxTextModelAdapter({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      modelId: config.modelId,
      temperature: config.temperature,
      headers: config.headers,
    });
  }
}
