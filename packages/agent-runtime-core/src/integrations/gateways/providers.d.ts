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
export declare function splitProviderModelId(modelId: string): {
    providerId: string | null;
    providerModelId: string;
};
