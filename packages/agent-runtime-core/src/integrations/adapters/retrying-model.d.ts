import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest } from '../../core/types.js';
export type RetryingStepModelAdapterOptions = {
    model: StepModelAdapter;
    maxAttempts: number;
    backoffMs?: number;
};
export declare class RetryingStepModelAdapter implements StepModelAdapter {
    private readonly model;
    private readonly maxAttempts;
    private readonly backoffMs;
    constructor(options: RetryingStepModelAdapterOptions);
    generateStep(request: StepModelRequest): Promise<import("../index.js").StepModelResponse>;
}
