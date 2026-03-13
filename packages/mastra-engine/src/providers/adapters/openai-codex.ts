import type { MastraModelConfig } from '@mastra/core/llm';
import { ModelRouterLanguageModel } from '@mastra/core/llm';

import {
  buildForgeAuthRouterId,
  ForgeAuthGateway,
  type ForgeAuthGatewayOptions,
} from '../gateway/forge-auth-gateway';
import { OPENAI_CODEX_MODELS, type OpenAICodexModelId } from '../gateway/model-ids';

export type OpenAICodexProviderOptions = ForgeAuthGatewayOptions['openaiCodex'];
export { OPENAI_CODEX_MODELS };
export type { OpenAICodexModelId };

export function openaiCodexProvider(
  modelId: OpenAICodexModelId,
  options?: OpenAICodexProviderOptions,
): MastraModelConfig {
  return new ModelRouterLanguageModel(
    {
      id: buildForgeAuthRouterId('openai-codex', modelId),
    },
    [
      new ForgeAuthGateway({
        openaiCodex: options,
      }),
    ],
  );
}
