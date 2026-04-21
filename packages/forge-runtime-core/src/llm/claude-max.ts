import { CLAUDE_MAX_MODELS, type ClaudeMaxModelId } from './model-ids';
import { OAUTH_GATEWAY_ID } from '../oauth-gateway.js';

export { CLAUDE_MAX_MODELS };
export type { ClaudeMaxModelId };

export function claudeCodeProvider(modelId: ClaudeMaxModelId) {
  return `${OAUTH_GATEWAY_ID}/claude-code/${modelId}`;
}
