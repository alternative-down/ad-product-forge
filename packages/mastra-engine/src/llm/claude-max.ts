import type { MastraModelConfig } from '@mastra/core/llm';
import { ModelRouterLanguageModel } from '@mastra/core/llm';

import { ClaudeMaxGateway, type ClaudeMaxGatewayOptions } from './claude-max-gateway';
import { CLAUDE_MAX_MODELS, type ClaudeMaxModelId } from './model-ids';
import { buildOAuthRouterId } from './oauth-router-id';

export type ClaudeMaxProviderOptions = ClaudeMaxGatewayOptions;
export { CLAUDE_MAX_MODELS };
export type { ClaudeMaxModelId };

export function claudeMaxProvider(modelId: ClaudeMaxModelId, options?: ClaudeMaxProviderOptions): MastraModelConfig {
  return new ModelRouterLanguageModel(
    { id: buildOAuthRouterId('claude-max', modelId) },
    [new ClaudeMaxGateway(options)],
  );
}
