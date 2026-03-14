import type { MastraModelConfig } from '@mastra/core/llm';
import { ModelRouterLanguageModel } from '@mastra/core/llm';

import {
  buildOAuthRouterId,
  OAuthModelGateway,
  type OAuthGatewayOptions,
} from './gateway';
import { CLAUDE_MAX_MODELS, type ClaudeMaxModelId } from './model-ids';

export type ClaudeMaxProviderOptions = OAuthGatewayOptions['claudeMax'];
export { CLAUDE_MAX_MODELS };
export type { ClaudeMaxModelId };

export function claudeMaxProvider(
  modelId: ClaudeMaxModelId,
  options?: ClaudeMaxProviderOptions,
): MastraModelConfig {
  return new ModelRouterLanguageModel(
    {
      id: buildOAuthRouterId('claude-max', modelId),
    },
    [
      new OAuthModelGateway({
        claudeMax: options,
      }),
    ],
  );
}
