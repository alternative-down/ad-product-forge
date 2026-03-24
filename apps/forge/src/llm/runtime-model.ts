import { createAnthropic } from '@ai-sdk/anthropic';
import type { AgentConfig } from '@mastra/core/agent';
import { createOAuthGateway, OAUTH_GATEWAY_ID } from '@mastra-engine/core';

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

  if (profile.baseUrl?.includes('/anthropic')) {
    const modelId = profile.modelKey.split('/').at(-1);

    if (!modelId) {
      throw new Error(`Invalid anthropic-compatible model key: ${profile.modelKey}`);
    }

    return createAnthropic({
      apiKey: profile.apiKey,
      baseURL: profile.baseUrl,
    }).messages(modelId);
  }

  return {
    id: profile.modelKey as `${string}/${string}`,
    apiKey: profile.apiKey,
    ...(profile.baseUrl ? { url: profile.baseUrl } : {}),
  };
}
