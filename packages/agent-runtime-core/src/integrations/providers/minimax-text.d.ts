import { AiSdkStepModelAdapter } from '../adapters/ai-sdk.js';
import { type StepModelProviderConfig, type StepModelProviderGateway } from '../gateways/providers.js';
export type MiniMaxTextModelOptions = {
    apiKey: string;
    modelId?: string;
    system?: string;
    temperature?: number;
    baseURL?: string;
    headers?: Record<string, string>;
};
export declare function createMiniMaxTextModelAdapter(options: MiniMaxTextModelOptions): AiSdkStepModelAdapter;
export declare class MiniMaxProviderGateway implements StepModelProviderGateway {
    private readonly apiKey;
    private readonly baseURL;
    constructor(options: {
        apiKey: string;
        baseURL?: string;
    });
    createStepModel(config: StepModelProviderConfig): Promise<AiSdkStepModelAdapter>;
}
