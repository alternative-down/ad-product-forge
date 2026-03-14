import { ClaudeMaxGateway, type ClaudeMaxGatewayOptions } from './claude-max-gateway';
import { CLAUDE_MAX_MODELS, type ClaudeMaxModelId } from './model-ids';
import { buildGatewayModelId } from './oauth-router-id';

export { CLAUDE_MAX_MODELS };
export type { ClaudeMaxModelId };
export type ClaudeMaxProviderOptions = ClaudeMaxGatewayOptions;

export function claudeMaxProvider(modelId: ClaudeMaxModelId) {
  return buildGatewayModelId('claude-max-oauth', 'claude-max', modelId);
}

export function createClaudeMaxGateway(options?: ClaudeMaxProviderOptions) {
  return new ClaudeMaxGateway(options);
}
