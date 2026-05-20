import type { RunExecutionResult, RuntimeInput } from '../../core/types.js';

export type SchedulableRuntime = {
  dispatch<TPayload>(
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string },
  ): Promise<void>;
  run(options?: { maxSteps?: number }): Promise<RunExecutionResult>;
};

export type ScheduledTaskHandle = {
  id: string;
  cancel(): void;
};

export type ScheduleInputOptions<TPayload> = {
  id?: string;
  target: SchedulableRuntime;
  input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string };
  delayMs: number;
  runAfterDispatch?: boolean;
  maxSteps?: number;
};

export type ScheduleRecurringInputOptions<TPayload> = {
  id?: string;
  target: SchedulableRuntime;
  inputFactory(): Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string };
  intervalMs: number;
  runAfterDispatch?: boolean;
  maxSteps?: number;
};

export class InMemoryRuntimeScheduler {
  private readonly activeTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly activeIntervals = new Map<string, NodeJS.Timeout>();

  scheduleInput<TPayload>(options: ScheduleInputOptions<TPayload>): ScheduledTaskHandle {
    const taskId = options.id ?? crypto.randomUUID();
    const timeout = setTimeout(() => {
      this.activeTimeouts.delete(taskId);
      void this.dispatchIntoRuntime(options);
    }, options.delayMs);

    this.activeTimeouts.set(taskId, timeout);

    return {
      id: taskId,
      cancel: () => {
        const activeTimeout = this.activeTimeouts.get(taskId);

        if (!activeTimeout) {
          return;
        }

        clearTimeout(activeTimeout);
        this.activeTimeouts.delete(taskId);
      },
    };
  }

  scheduleRecurringInput<TPayload>(
    options: ScheduleRecurringInputOptions<TPayload>,
  ): ScheduledTaskHandle {
    const taskId = options.id ?? crypto.randomUUID();
    const interval = setInterval(() => {
      void this.dispatchIntoRuntime({
        target: options.target,
        input: options.inputFactory(),
        runAfterDispatch: options.runAfterDispatch,
        maxSteps: options.maxSteps,
      });
    }, options.intervalMs);

    this.activeIntervals.set(taskId, interval);

    return {
      id: taskId,
      cancel: () => {
        const activeInterval = this.activeIntervals.get(taskId);

        if (!activeInterval) {
          return;
        }

        clearInterval(activeInterval);
        this.activeIntervals.delete(taskId);
      },
    };
  }

  dispose() {
    for (const timeout of this.activeTimeouts.values()) {
      clearTimeout(timeout);
    }

    for (const interval of this.activeIntervals.values()) {
      clearInterval(interval);
    }

    this.activeTimeouts.clear();
    this.activeIntervals.clear();
  }

  private async dispatchIntoRuntime<TPayload>(
    options: Pick<
      ScheduleInputOptions<TPayload>,
      'target' | 'input' | 'runAfterDispatch' | 'maxSteps'
    >,
  ) {
    await options.target.dispatch(options.input);

    if (options.runAfterDispatch === false) {
      return;
    }

    await options.target.run({
      maxSteps: options.maxSteps,
    });
  }
}
