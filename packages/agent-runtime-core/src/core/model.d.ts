import type { StepModelRequest, StepModelResponse, StepModelStream } from './types.js';
export interface StepModelAdapter {
    generateStep(request: StepModelRequest): Promise<StepModelResponse>;
}
export interface StreamingStepModelAdapter extends StepModelAdapter {
    streamStep(request: StepModelRequest): Promise<StepModelStream>;
}
export declare function supportsStreamingStepModel(model: StepModelAdapter): model is StreamingStepModelAdapter;
