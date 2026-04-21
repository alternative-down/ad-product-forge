import { type LanguageModel } from 'ai';
import type { StepModelAdapter, StreamingStepModelAdapter } from '../../core/model.js';
import type { StepActionDescriptor, StepContextEntry, StepModelRequest, StepModelResponse, StepModelStream } from '../../core/types.js';
export type AiSdkModelAdapterOptions = {
    model: LanguageModel;
    system?: string;
    temperature?: number;
    provider?: string;
    modelId?: string;
};
export declare class AiSdkStepModelAdapter implements StepModelAdapter, StreamingStepModelAdapter {
    private readonly model;
    private readonly system;
    private readonly temperature;
    private readonly provider;
    private readonly modelId;
    constructor(options: AiSdkModelAdapterOptions);
    generateStep(request: StepModelRequest): Promise<StepModelResponse>;
    streamStep(request: StepModelRequest): Promise<StepModelStream>;
}
export declare function renderAiSdkPrompt(context: StepContextEntry[], actions: StepActionDescriptor[]): string;
