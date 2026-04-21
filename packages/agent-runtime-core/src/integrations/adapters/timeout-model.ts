import type { StepModelAdapter } from '../../core/model.js';
import type { StepModelRequest } from '../../core/types.js';

export type TimeoutStepModelAdapterOptions = {
  model: StepModelAdapter;
  timeoutMs: number;
};

export class TimeoutStepModelAdapter implements StepModelAdapter {
  private readonly model: StepModelAdapter;
  private readonly timeoutMs: number;

  constructor(options: TimeoutStepModelAdapterOptions) {
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
  }

  async generateStep(request: StepModelRequest) {
    return withTimeout(
      this.model.generateStep(request),
      this.timeoutMs,
      `Step model timed out after ${this.timeoutMs}ms`,
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: NodeJS.Timeout | null = null;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
