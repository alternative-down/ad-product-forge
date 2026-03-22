import { createAnthropic } from '@ai-sdk/anthropic';
import type { MastraModelConfig } from '@mastra/core/llm';
import { wrapLanguageModel } from 'ai';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';

type RuntimeProfile = {
  providerType: 'openai-codex' | 'claude-max' | 'minimax';
  modelId: string;
  runtimeModelKey: string;
  apiKey: string | null;
};

export function resolveProfileRuntimeModel(profile: RuntimeProfile): MastraModelConfig {
  if (profile.providerType === 'openai-codex') {
    return profile.runtimeModelKey;
  }

  if (!profile.apiKey) {
    return profile.runtimeModelKey;
  }

  const anthropic = createAnthropic({
    apiKey: profile.apiKey,
    baseURL: profile.providerType === 'minimax' ? MINIMAX_BASE_URL : ANTHROPIC_BASE_URL,
  });

  return wrapLanguageModel({
    model: anthropic(profile.modelId),
    middleware: [],
  });
}
