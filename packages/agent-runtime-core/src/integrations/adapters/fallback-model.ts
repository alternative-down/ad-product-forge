import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest } from '../../core/types.js';

export type FallbackStepModelAdapterOptions = {
  models: StepModelAdapter[];
};

export class FallbackStepModelAdapter implements StepModelAdapter {
  private readonly models: StepModelAdapter[];

  constructor(options: FallbackStepModelAdapterOptions) {
    this.models = options.models;
  }

  async generateStep(request: StepModelRequest) {
    if (this.models.length === 0) {
      throw new Error('FallbackStepModelAdapter requires at least one model');
    }

    const errors: string[] = [];

    for (const model of this.models) {
      try {
        return await model.generateStep(request);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`All step models failed: ${errors.join(' | ')}`);
  }
}
