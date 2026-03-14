import type { MastraModelConfig } from '@mastra/core/llm';
import { ModelRouterLanguageModel } from '@mastra/core/llm';

import { OPENAI_CODEX_MODELS, type OpenAICodexModelId } from './model-ids';
import { OpenAICodexGateway, type OpenAICodexGatewayOptions } from './openai-codex-gateway';
import { buildOAuthRouterId } from './oauth-router-id';

export type OpenAICodexProviderOptions = OpenAICodexGatewayOptions;
export { OPENAI_CODEX_MODELS };
export type { OpenAICodexModelId };

export function openaiCodexProvider(modelId: OpenAICodexModelId, options?: OpenAICodexProviderOptions): MastraModelConfig {
  return new ModelRouterLanguageModel(
    { id: buildOAuthRouterId('openai-codex', modelId) },
    [new OpenAICodexGateway(options)],
  );
}
