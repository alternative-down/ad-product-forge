import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest } from '../../core/types.js';

export type RetryingStepModelAdapterOptions = {
  model: StepModelAdapter;
  maxAttempts: number;
  backoffMs?: number;
};

export class RetryingStepModelAdapter implements StepModelAdapter {
  private readonly model: StepModelAdapter;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;

  constructor(options: RetryingStepModelAdapterOptions) {
    this.model = options.model;
    this.maxAttempts = options.maxAttempts;
    this.backoffMs = options.backoffMs ?? 0;
  }

  async generateStep(request: StepModelRequest) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.model.generateStep(request);
      } catch (error) {
        lastError = error;

        if (attempt >= this.maxAttempts) {
          break;
        }

        if (this.backoffMs > 0) {
          await sleep(this.backoffMs);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
