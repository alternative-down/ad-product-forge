import { createAnthropic } from '@ai-sdk/anthropic';
import {
  createOAuthGateway,
  OAUTH_GATEWAY_ID,
  type AgentConfig,
  wrapAnthropicPromptCacheModel,
} from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';

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
        forgeDebug({ scope: 'llm-runtime-model', level: 'warn', message: 'resolveRuntimeModel: invalid OAuth model key', context: { modelKey: profile.modelKey } });
      throw new Error(`Invalid account OAuth model key: ${profile.modelKey}`);
    }

    try {
      const gateway = createOAuthGateway();
      const apiKey = await gateway.getApiKey(profile.modelKey);

      return gateway.resolveLanguageModel({
        modelId,
        providerId: providerId as 'openai-codex' | 'claude-code',
        apiKey,
      });
    } catch (err) {
      forgeDebug(
        'llm-runtime-model',
        `Failed to resolve OAuth runtime model: ${profile.modelKey}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
      forgeDebug({ scope: "llm-runtime-model.ts", level: "error", message: "llm-runtime-model.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  if (profile.modelKey.startsWith('minimax-coding-plan/')) {
    const [, ...modelIdParts] = profile.modelKey.split('/');
    const modelId = modelIdParts.join('/');

    if (!modelId) {
        forgeDebug({ scope: 'llm-runtime-model', level: 'warn', message: 'resolveRuntimeModel: invalid MiniMax model key', context: { modelKey: profile.modelKey } });
      throw new Error(`Invalid MiniMax coding model key: ${profile.modelKey}`);
    }

    const baseUrl =
      profile.baseUrl === 'https://api.minimax.io'
        ? 'https://api.minimax.io/anthropic/v1'
        : profile.baseUrl || 'https://api.minimax.io/anthropic/v1';

    try {
      const model = createAnthropic({
        authToken: profile.apiKey,
        baseURL: baseUrl,
      })(modelId);

      return wrapAnthropicPromptCacheModel(model);
    } catch (err) {
      forgeDebug(
        'llm-runtime-model',
        `Failed to create MiniMax runtime model: ${profile.modelKey}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
      forgeDebug({ scope: "llm-runtime-model.ts", level: "error", message: "llm-runtime-model.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return {
    id: profile.modelKey as `${string}/${string}`,
    apiKey: profile.apiKey,
    ...(profile.baseUrl ? { url: profile.baseUrl } : {}),
  };
}