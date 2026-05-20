import type { RuntimeInput } from '../../core/types.js';
import type { RuntimeTargetRegistry } from './runtime-target-registry.js';

export type KeyedScheduledTaskHandle = {
  id: string;
  cancel(): void;
};

export type KeyedScheduleInputOptions<TPayload> = {
  id?: string;
  runtimeId: string;
  input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string };
  delayMs: number;
  runAfterDispatch?: boolean;
  maxSteps?: number;
};

export type KeyedScheduleRecurringInputOptions<TPayload> = {
  id?: string;
  runtimeId: string;
  input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string };
  intervalMs: number;
  runAfterDispatch?: boolean;
  maxSteps?: number;
};

export type KeyedRuntimeSchedulerOptions = {
  registry: RuntimeTargetRegistry;
};

export class KeyedRuntimeScheduler {
  private readonly registry: RuntimeTargetRegistry;
  private readonly activeTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly activeIntervals = new Map<string, NodeJS.Timeout>();

  constructor(options: KeyedRuntimeSchedulerOptions) {
    this.registry = options.registry;
  }

  scheduleInput<TPayload>(options: KeyedScheduleInputOptions<TPayload>): KeyedScheduledTaskHandle {
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
    options: KeyedScheduleRecurringInputOptions<TPayload>,
  ): KeyedScheduledTaskHandle {
    const taskId = options.id ?? crypto.randomUUID();
    const interval = setInterval(() => {
      void this.dispatchIntoRuntime(options);
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

  private async dispatchIntoRuntime<TPayload>(options: {
    runtimeId: string;
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string };
    runAfterDispatch?: boolean;
    maxSteps?: number;
  }) {
    const runtime = this.registry.get(options.runtimeId);

    if (!runtime) {
      return;
    }

    await runtime.dispatch(options.input);

    if (options.runAfterDispatch === false) {
      return;
    }

    await runtime.run({
      maxSteps: options.maxSteps,
    });
  }
}
