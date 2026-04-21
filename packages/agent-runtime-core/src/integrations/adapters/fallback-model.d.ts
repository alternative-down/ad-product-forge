import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest } from '../../core/types.js';
export type FallbackStepModelAdapterOptions = {
    models: StepModelAdapter[];
};
export declare class FallbackStepModelAdapter implements StepModelAdapter {
    private readonly models;
    constructor(options: FallbackStepModelAdapterOptions);
    generateStep(request: StepModelRequest): Promise<import("../index.js").StepModelResponse>;
}
