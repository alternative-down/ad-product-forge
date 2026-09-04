import { createAnthropic } from '@ai-sdk/anthropic';
import {
  createOAuthGateway,
  OAUTH_GATEWAY_ID,
  type AgentConfig,
  wrapAnthropicPromptCacheModel,
} from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import type { LlmProfileRecord } from './settings-store';
import {
  InvalidAccountModelKeyFormatError,
  InvalidAccountOAuthModelKeyError,
  InvalidMinimaxCodingModelKeyError,
  UnsupportedOAuthProviderError,
} from './errors';
import { MINIMAX_HOST, MINIMAX_ANTHROPIC_URL } from '../minimax/constants';

/**
 * Module-local debug helper. Centralizes the llm-runtime-model scope
 * so call sites only specify the level, message, and context.
 */
function runtimeModelDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) {
  forgeDebug({ scope: 'llm-runtime-model', level, message, context });
}


export type RuntimeProfile = Pick<
  LlmProfileRecord,
  'modelKey' | 'baseUrl' | 'apiKey'
>;

export async function resolveProfileRuntimeModel(
  profile: RuntimeProfile,
): Promise<AgentConfig['model']> {
  if (profile.modelKey.startsWith(`${OAUTH_GATEWAY_ID}/`)) {
    const [, providerId, ...modelIdParts] = profile.modelKey.split('/');
    const modelId = modelIdParts.join('/');

    if (!providerId || !modelId) {
      runtimeModelDebug('error', 'resolveRuntimeModel: invalid OAuth model key', { modelKey: profile.modelKey });
      throw new InvalidAccountOAuthModelKeyError(profile.modelKey);
    }

    // #5942: providerId comes from a split() of profile.modelKey. Validate
    // it is in the literal union before passing to the gateway. Reject
    // unknown providerIds at runtime instead of casting past the type
    // system.
    if (providerId !== 'openai-codex' && providerId !== 'claude-code') {
      runtimeModelDebug('error', 'resolveRuntimeModel: unsupported OAuth providerId', { providerId, modelKey: profile.modelKey });
      throw new UnsupportedOAuthProviderError(providerId);
    }

    const gateway = createOAuthGateway();
    const apiKey = await gateway.getApiKey(profile.modelKey);

    return gateway.resolveLanguageModel({
      modelId,
      providerId,
      apiKey,
    });
  }

  if (profile.modelKey.startsWith('minimax-coding-plan/')) {
    const [, ...modelIdParts] = profile.modelKey.split('/');
    const modelId = modelIdParts.join('/');

    if (!modelId) {
      runtimeModelDebug('error', 'resolveRuntimeModel: invalid MiniMax model key', { modelKey: profile.modelKey });
      throw new InvalidMinimaxCodingModelKeyError(profile.modelKey);
    }

    const baseUrl =
      profile.baseUrl === MINIMAX_HOST
        ? MINIMAX_ANTHROPIC_URL
        : profile.baseUrl !== null && profile.baseUrl !== undefined
          ? profile.baseUrl
          : MINIMAX_ANTHROPIC_URL;

    const model = createAnthropic({
      authToken: profile.apiKey,
      baseURL: baseUrl,
    })(modelId);

    return modelId.startsWith('MiniMax-M3') ? model : wrapAnthropicPromptCacheModel(model);
  }

  // #6027: validate the default case modelKey has the expected provider/model
  // format BEFORE the template-literal cast. Without this, modelKeys like 'gpt-4'
  // or 'claude-sonnet' (no slash) silently pass through the type-lie and break
  // downstream consumers that rely on the provider/model contract.
  const slashIdx = profile.modelKey.indexOf('/');
  if (slashIdx <= 0 || slashIdx === profile.modelKey.length - 1) {
    runtimeModelDebug('error', 'resolveRuntimeModel: invalid default model key (expected provider/model)', { modelKey: profile.modelKey });
    throw new InvalidAccountModelKeyFormatError(profile.modelKey);
  }

  return {
    id: profile.modelKey as `${string}/${string}`,  // safe: validated above
    apiKey: profile.apiKey,
    ...(profile.baseUrl !== null && profile.baseUrl !== undefined ? { url: profile.baseUrl } : {}),
  };
}
