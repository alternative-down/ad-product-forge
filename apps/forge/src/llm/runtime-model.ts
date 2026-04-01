import type { AgentConfig } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';
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

  if (profile.modelKey.startsWith('minimax-coding-plan/')) {
    const [, ...modelIdParts] = profile.modelKey.split('/');
    const modelId = modelIdParts.join('/');

    if (!modelId) {
      throw new Error(`Invalid MiniMax coding model key: ${profile.modelKey}`);
    }

    const anthropic = createAnthropic({
      apiKey: profile.apiKey,
      baseURL: resolveMiniMaxAnthropicBaseUrl(profile.baseUrl),
    });

    return anthropic(modelId);
  }

  return {
    id: profile.modelKey as `${string}/${string}`,
    apiKey: profile.apiKey,
    ...(profile.baseUrl ? { url: profile.baseUrl } : {}),
  };
}

function resolveMiniMaxAnthropicBaseUrl(baseUrl: string | null) {
  const normalizedBaseUrl = (baseUrl ?? '').trim();

  if (!normalizedBaseUrl) {
    return 'https://api.minimax.io/anthropic/v1';
  }

  const parsed = new URL(normalizedBaseUrl);

  if (parsed.origin === 'https://api.minimax.io' && (parsed.pathname === '' || parsed.pathname === '/')) {
    return 'https://api.minimax.io/anthropic/v1';
  }

  return normalizedBaseUrl.replace(/\/$/, '');
}
