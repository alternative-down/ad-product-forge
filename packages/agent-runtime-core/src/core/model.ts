import type { StepModelRequest, StepModelResponse, StepModelStream } from './types.js';

export interface StepModelAdapter {
  generateStep(request: StepModelRequest): Promise<StepModelResponse>;
}

export interface StreamingStepModelAdapter extends StepModelAdapter {
  streamStep(request: StepModelRequest): Promise<StepModelStream>;
}

export function supportsStreamingStepModel(
  model: StepModelAdapter,
): model is StreamingStepModelAdapter {
  return 'streamStep' in model && typeof model.streamStep === 'function';
}
