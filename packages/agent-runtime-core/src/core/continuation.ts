import type { ActionResult, StepContinuation, StepModelResponse } from './types.js';

export type ContinuationResolver = (context: {
  modelResponse: StepModelResponse;
  actionResults: ActionResult[];
  pendingInputsRemaining: number;
}) => StepContinuation;

export function createDefaultContinuationResolver(): ContinuationResolver {
  return ({ modelResponse, pendingInputsRemaining }) => {
    if (modelResponse.continuation === 'continue') {
      return 'continue';
    }

    if (pendingInputsRemaining > 0) {
      return 'continue';
    }

    return modelResponse.continuation;
  };
}
