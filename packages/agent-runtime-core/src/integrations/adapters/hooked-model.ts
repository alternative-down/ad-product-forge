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

export class HookedStepModelAdapter implements StepModelAdapter {
  private readonly model: StepModelAdapter;
  private readonly beforeGenerate: HookedStepModelAdapterOptions['beforeGenerate'];
  private readonly afterGenerate: HookedStepModelAdapterOptions['afterGenerate'];
  private readonly onError: HookedStepModelAdapterOptions['onError'];

  constructor(options: HookedStepModelAdapterOptions) {
    this.model = options.model;
    this.beforeGenerate = options.beforeGenerate;
    this.afterGenerate = options.afterGenerate;
    this.onError = options.onError;
  }

  async generateStep(request: StepModelRequest): Promise<StepModelResponse> {
    await this.beforeGenerate?.(request);

    try {
      const response = await this.model.generateStep(request);

      await this.afterGenerate?.({
        request,
        response,
      });

      return response;
    } catch (error) {
      await this.onError?.({
        request,
        error,
      });
      throw error;
    }
  }
}
