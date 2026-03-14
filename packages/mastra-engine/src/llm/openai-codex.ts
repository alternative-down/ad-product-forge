import { OPENAI_CODEX_MODELS, type OpenAICodexModelId } from './model-ids';
import { buildGatewayModelId } from './oauth-router-id';
import { OpenAICodexGateway, type OpenAICodexGatewayOptions } from './openai-codex-gateway';

export { OPENAI_CODEX_MODELS };
export type { OpenAICodexModelId };
export type OpenAICodexProviderOptions = OpenAICodexGatewayOptions;

export function openaiCodexProvider(modelId: OpenAICodexModelId) {
  return buildGatewayModelId('openai-codex-oauth', 'openai-codex', modelId);
}

export function createOpenAICodexGateway(options?: OpenAICodexProviderOptions) {
  return new OpenAICodexGateway(options);
}
