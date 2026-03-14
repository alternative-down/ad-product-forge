import type { MastraModelConfig } from '@mastra/core/llm';
import { ModelRouterLanguageModel } from '@mastra/core/llm';

import {
  buildOAuthRouterId,
  OAuthModelGateway,
  type OAuthGatewayOptions,
} from './gateway';
import { OPENAI_CODEX_MODELS, type OpenAICodexModelId } from './model-ids';

export type OpenAICodexProviderOptions = OAuthGatewayOptions['openaiCodex'];
export { OPENAI_CODEX_MODELS };
export type { OpenAICodexModelId };

export function openaiCodexProvider(
  modelId: OpenAICodexModelId,
  options?: OpenAICodexProviderOptions,
): MastraModelConfig {
  return new ModelRouterLanguageModel(
    {
      id: buildOAuthRouterId('openai-codex', modelId),
    },
    [
      new OAuthModelGateway({
        openaiCodex: options,
      }),
    ],
  );
}
