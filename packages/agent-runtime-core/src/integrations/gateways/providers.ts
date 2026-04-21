import type { StepModelAdapter } from '../../core/model.js';

export type ProviderHeaders = Record<string, string>;

export type StepModelProviderConfig = {
  modelId: string;
  headers?: ProviderHeaders;
  temperature?: number;
};

export interface StepModelProviderGateway {
  createStepModel(config: StepModelProviderConfig): Promise<StepModelAdapter>;
}

export function splitProviderModelId(modelId: string) {
  const separatorIndex = modelId.indexOf(':');

  if (separatorIndex < 0) {
    return {
      providerId: null,
      providerModelId: modelId,
    };
  }

  return {
    providerId: modelId.slice(0, separatorIndex) || null,
    providerModelId: modelId.slice(separatorIndex + 1) || modelId,
  };
}
