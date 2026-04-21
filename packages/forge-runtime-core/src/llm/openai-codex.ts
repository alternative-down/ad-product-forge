import { OPENAI_CODEX_MODELS, type OpenAICodexModelId } from './model-ids';
import { OAUTH_GATEWAY_ID } from '../oauth-gateway.js';

export { OPENAI_CODEX_MODELS };
export type { OpenAICodexModelId };

export function openaiCodexProvider(modelId: OpenAICodexModelId) {
  return `${OAUTH_GATEWAY_ID}/openai-codex/${modelId}`;
}
