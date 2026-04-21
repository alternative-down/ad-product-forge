import { createAnthropic } from '@ai-sdk/anthropic';
import { createOAuthGateway, OAUTH_GATEWAY_ID, type AgentConfig } from '@forge-runtime/core';

type RuntimeProfile = {
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
      throw new Error(`Invalid account OAuth model key: ${profile.modelKey}`);
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
      throw new Error(`Invalid MiniMax coding model key: ${profile.modelKey}`);
    }

    const baseUrl =
      profile.baseUrl === 'https://api.minimax.io'
        ? 'https://api.minimax.io/anthropic/v1'
        : profile.baseUrl || 'https://api.minimax.io/anthropic/v1';

    return createAnthropic({
      authToken: profile.apiKey,
      baseURL: baseUrl,
    })(modelId);
  }

  return {
    id: profile.modelKey as `${string}/${string}`,
    apiKey: profile.apiKey,
    ...(profile.baseUrl ? { url: profile.baseUrl } : {}),
  };
}
