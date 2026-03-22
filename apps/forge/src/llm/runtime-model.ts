import type { OpenAICompatibleConfig } from '@mastra/core/llm';

type RuntimeProfile = {
  modelKey: string;
  baseUrl: string | null;
  apiKey: string;
};

export function resolveProfileRuntimeModel(profile: RuntimeProfile): OpenAICompatibleConfig {
  return {
    id: profile.modelKey as `${string}/${string}`,
    apiKey: profile.apiKey,
    ...(profile.baseUrl ? { url: profile.baseUrl } : {}),
  };
}
