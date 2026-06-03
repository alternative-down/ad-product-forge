import type { AgentRuntime } from '../../core/runtime.js';
import type { RuntimeSnapshot, StepRecord } from '../../core/types.js';

export type RuntimeRunLoopStopReason = 'idle' | 'max-steps' | 'aborted';

export type RuntimeRunLoopResult = {
  steps: StepRecord[];
  snapshot: RuntimeSnapshot;
  stopReason: RuntimeRunLoopStopReason;
};

export type RuntimeRunControllerOptions = {
  runtime: AgentRuntime;
};

export type RuntimeRunLoopOptions = {
  maxSteps?: number;
  signal?: AbortSignal;
  resolveDelayMs?(context: { completedSteps: StepRecord[]; latestStep: StepRecord }): number;
  beforeStep?(context: {
    completedSteps: StepRecord[];
    nextStepNumber: number;
  }): Promise<void> | void;
  afterStep?(context: {
    completedSteps: StepRecord[];
    latestStep: StepRecord;
    snapshot: RuntimeSnapshot;
  }): Promise<void> | void;
  beforeDelay?(context: {
    completedSteps: StepRecord[];
    latestStep: StepRecord;
    delayMs: number;
  }): Promise<void> | void;
  continueAfterStep?(context: {
    completedSteps: StepRecord[];
    latestStep: StepRecord;
    snapshot: RuntimeSnapshot;
  }): boolean | Promise<boolean>;
};

export class RuntimeRunController {
  private readonly runtime: AgentRuntime;

  constructor(options: RuntimeRunControllerOptions) {
    this.runtime = options.runtime;
  }

  async run(options: RuntimeRunLoopOptions = {}): Promise<RuntimeRunLoopResult> {
    const maxSteps = options.maxSteps ?? 10_000;
    const steps: StepRecord[] = [];

    while (steps.length < maxSteps) {
      if (options.signal?.aborted) {
        return {
          steps,
          snapshot: this.runtime.getSnapshot(),
          stopReason: 'aborted',
        };
      }

      await options.beforeStep?.({
        completedSteps: [...steps],
        nextStepNumber: steps.length + 1,
      });

      const result = await this.runtime.step();

      if (!result) {
        return {
          steps,
          snapshot: this.runtime.getSnapshot(),
          stopReason: 'idle',
        };
      }

      steps.push(result.record);
      await options.afterStep?.({
        completedSteps: [...steps],
        latestStep: result.record,
        snapshot: result.snapshot,
      });

      const shouldContinue = await options.continueAfterStep?.({
        completedSteps: [...steps],
        latestStep: result.record,
        snapshot: result.snapshot,
      });

      if (shouldContinue !== true) {
        return {
          steps,
          snapshot: this.runtime.getSnapshot(),
          stopReason: 'idle',
        };
      }

      this.runtime.requestContinuation();

      const delayMs =
        options.resolveDelayMs?.({
          completedSteps: [...steps],
          latestStep: result.record,
        }) ?? 0;

      if (delayMs > 0) {
        await options.beforeDelay?.({
          completedSteps: [...steps],
          latestStep: result.record,
          delayMs,
        });
        await sleep(delayMs, options.signal);
      }
    }

    return {
      steps,
      snapshot: this.runtime.getSnapshot(),
      stopReason: 'max-steps',
    };
  }
}

async function sleep(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve, _reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
