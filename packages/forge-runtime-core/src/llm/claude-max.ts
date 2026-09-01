/* eslint-disable reexport-check/no-unnecessary-reexports, @typescript-eslint/strict-boolean-expressions */
import type { ClaudeMaxModelId } from './model-ids';
import { OAUTH_GATEWAY_ID } from '../oauth-gateway.js';

export type { ClaudeMaxModelId };

export function claudeCodeProvider(modelId: ClaudeMaxModelId) {
  return `${OAUTH_GATEWAY_ID}/claude-code/${modelId}`;
}
