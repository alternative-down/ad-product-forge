import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest, StepModelResponse } from '../../core/types.js';
export type HookedStepModelAdapterOptions = {
    model: StepModelAdapter;
    beforeGenerate?(request: StepModelRequest): Promise<void> | void;
    afterGenerate?(context: {
        request: StepModelRequest;
        response: StepModelResponse;
    }): Promise<void> | void;
    onError?(context: {
        request: StepModelRequest;
        error: unknown;
    }): Promise<void> | void;
};
export declare class HookedStepModelAdapter implements StepModelAdapter {
    private readonly model;
    private readonly beforeGenerate;
    private readonly afterGenerate;
    private readonly onError;
    constructor(options: HookedStepModelAdapterOptions);
    generateStep(request: StepModelRequest): Promise<StepModelResponse>;
}
