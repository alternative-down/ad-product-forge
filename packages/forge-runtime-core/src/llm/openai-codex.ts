/* eslint-disable reexport-check/no-unnecessary-reexports, @typescript-eslint/strict-boolean-expressions */
import type { OpenAICodexModelId } from './model-ids';
import { OAUTH_GATEWAY_ID } from '../oauth-gateway.js';

export type { OpenAICodexModelId };

export function openaiCodexProvider(modelId: OpenAICodexModelId) {
  return `${OAUTH_GATEWAY_ID}/openai-codex/${modelId}`;
}
