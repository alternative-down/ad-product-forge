import { createAnthropic } from '@ai-sdk/anthropic';
import {
  createOAuthGateway,
  OAUTH_GATEWAY_ID,
  type AgentConfig,
  wrapAnthropicPromptCacheModel,
} from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';

export type RuntimeProfile = {
  modelKey: string;
  baseUrl: string | null;
  apiKey: string;
};

export async function resolveProfileRuntimeModel(
  profile: RuntimeProfile,
): Promise<AgentConfig['model']> {
  if (profile.modelKey.startsWith(`${OAUTH_GATEWAY_ID}/`)) {
    const [, providerId, ...modelIdParts] = profile.modelKey.split('/');
    const modelId = modelIdParts.join('/');

    if (!providerId || !modelId) {
      forgeDebug({
        scope: 'llm-runtime-model',
        level: 'error',
        message: 'resolveRuntimeModel: invalid OAuth model key',
        context: { modelKey: profile.modelKey },
      });
      throw new Error(`Invalid account OAuth model key: ${profile.modelKey}`);
    }

    // #5942: providerId comes from a split() of profile.modelKey. Validate
    // it is in the literal union before passing to the gateway. Reject
    // unknown providerIds at runtime instead of casting past the type
    // system.
    if (providerId !== 'openai-codex' && providerId !== 'claude-code') {
      forgeDebug({
        scope: 'llm-runtime-model',
        level: 'error',
        message: 'resolveRuntimeModel: unsupported OAuth providerId',
        context: { providerId, modelKey: profile.modelKey },
      });
      throw new Error(`Unsupported OAuth providerId: ${providerId}`);
    }

    const gateway = createOAuthGateway();
    const apiKey = await gateway.getApiKey(profile.modelKey);

    return gateway.resolveLanguageModel({
      modelId,
      providerId,
      apiKey,
    });
  }

  if (profile.modelKey.startsWith('minimax-coding-plan/')) {
    const [, ...modelIdParts] = profile.modelKey.split('/');
    const modelId = modelIdParts.join('/');

    if (!modelId) {
      forgeDebug({
        scope: 'llm-runtime-model',
        level: 'error',
        message: 'resolveRuntimeModel: invalid MiniMax model key',
        context: { modelKey: profile.modelKey },
      });
      throw new Error(`Invalid MiniMax coding model key: ${profile.modelKey}`);
    }

    const baseUrl =
      profile.baseUrl === 'https://api.minimax.io'
        ? 'https://api.minimax.io/anthropic/v1'
        : profile.baseUrl !== null && profile.baseUrl !== undefined
          ? profile.baseUrl
          : 'https://api.minimax.io/anthropic/v1';

    const model = createAnthropic({
      authToken: profile.apiKey,
      baseURL: baseUrl,
    })(modelId);

    return wrapAnthropicPromptCacheModel(model);
  }

  return {
    id: profile.modelKey as `${string}/${string}`,
    apiKey: profile.apiKey,
    ...(profile.baseUrl !== null && profile.baseUrl !== undefined ? { url: profile.baseUrl } : {}),
  };
}
