import { createAnthropic } from '@ai-sdk/anthropic';
import type { AgentConfig } from '@mastra/core/agent';

type RuntimeProfile = {
  modelKey: string;
  baseUrl: string | null;
  apiKey: string;
};

export function resolveProfileRuntimeModel(profile: RuntimeProfile): AgentConfig['model'] {
  if (profile.modelKey.startsWith('account-oauth/')) {
    return profile.modelKey;
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
