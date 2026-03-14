const OAUTH_GATEWAY_ID = 'oauth-gateway';

export function buildOAuthRouterId(providerId: 'openai-codex' | 'claude-max', modelId: string) {
  return `${OAUTH_GATEWAY_ID}/${providerId}/${modelId}` as const;
}
