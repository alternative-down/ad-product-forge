import type { RunExecutionResult, RuntimeInput } from '../../core/types.js';
export type SchedulableRuntime = {
    dispatch<TPayload>(input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    }): Promise<void>;
    run(options?: {
        maxSteps?: number;
    }): Promise<RunExecutionResult>;
};
export type ScheduledTaskHandle = {
    id: string;
    cancel(): void;
};
export type ScheduleInputOptions<TPayload> = {
    id?: string;
    target: SchedulableRuntime;
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    };
    delayMs: number;
    runAfterDispatch?: boolean;
    maxSteps?: number;
};
export type ScheduleRecurringInputOptions<TPayload> = {
    id?: string;
    target: SchedulableRuntime;
    inputFactory(): Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    };
    intervalMs: number;
    runAfterDispatch?: boolean;
    maxSteps?: number;
};
export declare class InMemoryRuntimeScheduler {
    private readonly activeTimeouts;
    private readonly activeIntervals;
    scheduleInput<TPayload>(options: ScheduleInputOptions<TPayload>): ScheduledTaskHandle;
    scheduleRecurringInput<TPayload>(options: ScheduleRecurringInputOptions<TPayload>): ScheduledTaskHandle;
    dispose(): void;
    private dispatchIntoRuntime;
}
