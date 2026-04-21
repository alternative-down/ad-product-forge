import type { ActionResult, StepContinuation, StepModelResponse } from './types.js';
export type ContinuationResolver = (context: {
    modelResponse: StepModelResponse;
    actionResults: ActionResult[];
    pendingInputsRemaining: number;
}) => StepContinuation;
export declare function createDefaultContinuationResolver(): ContinuationResolver;
