import type { ActionResult, StepContinuation, StepModelResponse } from './types.js';

export type ContinuationResolver = (context: {
  modelResponse: StepModelResponse;
  actionResults: ActionResult[];
  pendingInputsRemaining: number;
}) => StepContinuation;

export function createDefaultContinuationResolver(): ContinuationResolver {
  return ({ modelResponse, pendingInputsRemaining }) => {
    if (pendingInputsRemaining > 0) {
      return 'continue';
    }

    return modelResponse.continuation === 'wait' ? 'wait' : 'stop';
  };
}
