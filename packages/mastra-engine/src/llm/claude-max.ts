import { CLAUDE_MAX_MODELS, type ClaudeMaxModelId } from './model-ids';
import { OAUTH_GATEWAY_ID } from './oauth-gateway';

export { CLAUDE_MAX_MODELS };
export type { ClaudeMaxModelId };

export function claudeMaxProvider(modelId: ClaudeMaxModelId) {
  return `${OAUTH_GATEWAY_ID}/claude-max/${modelId}`;
}
