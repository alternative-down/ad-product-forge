import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest } from '../../core/types.js';
export type TimeoutStepModelAdapterOptions = {
    model: StepModelAdapter;
    timeoutMs: number;
};
export declare class TimeoutStepModelAdapter implements StepModelAdapter {
    private readonly model;
    private readonly timeoutMs;
    constructor(options: TimeoutStepModelAdapterOptions);
    generateStep(request: StepModelRequest): Promise<import("../index.js").StepModelResponse>;
}
