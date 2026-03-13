import type { MastraModelConfig } from '@mastra/core/llm';
import { ModelRouterLanguageModel } from '@mastra/core/llm';

import {
  buildForgeAuthRouterId,
  ForgeAuthGateway,
  type ForgeAuthGatewayOptions,
} from '../gateway/forge-auth-gateway';
import { CLAUDE_MAX_MODELS, type ClaudeMaxModelId } from '../gateway/model-ids';

export type ClaudeMaxProviderOptions = ForgeAuthGatewayOptions['claudeMax'];
export { CLAUDE_MAX_MODELS };
export type { ClaudeMaxModelId };

export function claudeMaxProvider(
  modelId: ClaudeMaxModelId,
  options?: ClaudeMaxProviderOptions,
): MastraModelConfig {
  return new ModelRouterLanguageModel(
    {
      id: buildForgeAuthRouterId('claude-max', modelId),
    },
    [
      new ForgeAuthGateway({
        claudeMax: options,
      }),
    ],
  );
}
