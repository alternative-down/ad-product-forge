import { createAnthropic } from '@ai-sdk/anthropic';
import { CLAUDE_MAX_MODELS, MINIMAX_MODELS } from '@mastra-engine/core';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel, ProviderConfig } from '@mastra/core/llm';
import { wrapLanguageModel } from 'ai';

import type { createLlmSettingsStore } from './settings-store';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';

export const CUSTOM_LLM_GATEWAY_ID = 'custom';

export class ProfileTokenGateway extends MastraModelGateway {
  readonly id = CUSTOM_LLM_GATEWAY_ID;
  readonly name = 'Custom Profile Token Gateway';

  constructor(private readonly options: {
    llmSettings: ReturnType<typeof createLlmSettingsStore>;
  }) {
    super();
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    const profiles = await this.options.llmSettings.listProfiles();
    const claudeProfiles = profiles.filter((profile) => profile.providerType === 'claude-max' && profile.hasApiKey);
    const minimaxProfiles = profiles.filter((profile) => profile.providerType === 'minimax' && profile.hasApiKey);

    return {
      'claude-max': {
        name: 'Claude Max Profile Token',
        models: claudeProfiles.map((profile) => profile.profileId) as Array<(typeof CLAUDE_MAX_MODELS)[number]>,
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: ANTHROPIC_BASE_URL,
      },
      minimax: {
        name: 'MiniMax Profile Token',
        models: minimaxProfiles.map((profile) => profile.profileId) as Array<(typeof MINIMAX_MODELS)[number]>,
        apiKeyEnvVar: 'FORGE_AUTH_UNUSED',
        gateway: this.id,
        url: MINIMAX_BASE_URL,
      },
    };
  }

  async buildUrl(modelId: string) {
    const profile = await this.getResolvedProfileByRuntimeModelKey(modelId);

    if (profile.providerType === 'claude-max') {
      return ANTHROPIC_BASE_URL;
    }

    return MINIMAX_BASE_URL;
  }

  async getApiKey(modelId: string) {
    const profile = await this.getResolvedProfileByRuntimeModelKey(modelId);

    if (!profile.apiKey) {
      throw new Error(`LLM profile is missing direct apiKey: ${profile.profileId}`);
    }

    return profile.apiKey;
  }

  async resolveLanguageModel(args: {
    modelId: string;
    providerId: string;
    apiKey: string;
  }): Promise<GatewayLanguageModel> {
    const providerId = parseDirectProviderId(args.providerId);
    const profile = await this.options.llmSettings.getDirectApiKeyProfile(providerId, args.modelId);

    if (profile.providerType === 'claude-max') {
      return this.resolveClaudeModel(profile.modelId, args.apiKey);
    }

    return this.resolveMiniMaxModel(profile.modelId, args.apiKey);
  }

  private async getResolvedProfileByRuntimeModelKey(runtimeModelKey: string) {
    const match = runtimeModelKey.match(/^custom\/(claude-max|minimax)\/([^/]+)$/);

    if (!match) {
      throw new Error(`Unsupported profile gateway model: ${runtimeModelKey}`);
    }

    return this.options.llmSettings.getDirectApiKeyProfile(parseDirectProviderId(match[1]), match[2]);
  }

  private resolveClaudeModel(modelId: string, apiKey: string) {
    const anthropic = createAnthropic({
      apiKey,
      baseURL: ANTHROPIC_BASE_URL,
    });

    return wrapLanguageModel({
      model: anthropic(modelId),
      middleware: [],
    });
  }

  private async resolveMiniMaxModel(modelId: string, apiKey: string) {
    const anthropic = createAnthropic({
      apiKey,
      baseURL: MINIMAX_BASE_URL,
    });

    return wrapLanguageModel({
      model: anthropic(modelId),
      middleware: [],
    });
  }

}

export function createProfileTokenGateway(options: {
  llmSettings: ReturnType<typeof createLlmSettingsStore>;
}) {
  return new ProfileTokenGateway(options);
}

function parseDirectProviderId(value: string): 'claude-max' | 'minimax' {
  if (value === 'claude-max' || value === 'minimax') {
    return value;
  }

  throw new Error(`Unsupported direct-token provider: ${value}`);
}
