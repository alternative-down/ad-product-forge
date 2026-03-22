import { createAnthropic } from '@ai-sdk/anthropic';
import { CLAUDE_MAX_MODELS, MINIMAX_MODELS } from '@mastra-engine/core';
import { MastraModelGateway } from '@mastra/core/llm';
import type { GatewayLanguageModel, ProviderConfig } from '@mastra/core/llm';
import { wrapLanguageModel } from 'ai';

import type { createLlmSettingsStore } from './settings-store';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';

export const PROFILE_LLM_GATEWAY_ID = 'profile-llm';

export class ProfileTokenGateway extends MastraModelGateway {
  readonly id = PROFILE_LLM_GATEWAY_ID;
  readonly name = 'Profile Token Gateway';

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
    const profile = await this.getResolvedProfile(modelId);

    if (profile.providerType === 'claude-max') {
      return ANTHROPIC_BASE_URL;
    }

    return MINIMAX_BASE_URL;
  }

  async getApiKey(modelId: string) {
    const profile = await this.getResolvedProfile(modelId);

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
    const profile = await this.getResolvedProfile(`${this.id}/${args.providerId}/${args.modelId}`);

    if (profile.providerType === 'claude-max') {
      return this.resolveClaudeModel(profile.modelId, args.apiKey);
    }

    return this.resolveMiniMaxModel(profile.modelId, args.apiKey);
  }

  private async getResolvedProfile(runtimeModelKey: string) {
    const match = runtimeModelKey.match(/^profile-llm\/(claude-max|minimax)\/([^/]+)$/);

    if (!match) {
      throw new Error(`Unsupported profile gateway model: ${runtimeModelKey}`);
    }

    const profile = await this.options.llmSettings.getProfile(match[2]);

    if (profile.providerType !== match[1]) {
      throw new Error(`LLM profile provider mismatch for ${profile.profileId}`);
    }

    if (!profile.hasApiKey) {
      throw new Error(`LLM profile does not define a direct apiKey: ${profile.profileId}`);
    }

    return profile;
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
