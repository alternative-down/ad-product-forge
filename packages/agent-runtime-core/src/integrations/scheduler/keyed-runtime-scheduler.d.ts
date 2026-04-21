import type { RuntimeInput } from '../../core/types.js';
import type { RuntimeTargetRegistry } from './runtime-target-registry.js';
export type KeyedScheduledTaskHandle = {
    id: string;
    cancel(): void;
};
export type KeyedScheduleInputOptions<TPayload> = {
    id?: string;
    runtimeId: string;
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    };
    delayMs: number;
    runAfterDispatch?: boolean;
    maxSteps?: number;
};
export type KeyedScheduleRecurringInputOptions<TPayload> = {
    id?: string;
    runtimeId: string;
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    };
    intervalMs: number;
    runAfterDispatch?: boolean;
    maxSteps?: number;
};
export type KeyedRuntimeSchedulerOptions = {
    registry: RuntimeTargetRegistry;
};
export declare class KeyedRuntimeScheduler {
    private readonly registry;
    private readonly activeTimeouts;
    private readonly activeIntervals;
    constructor(options: KeyedRuntimeSchedulerOptions);
    scheduleInput<TPayload>(options: KeyedScheduleInputOptions<TPayload>): KeyedScheduledTaskHandle;
    scheduleRecurringInput<TPayload>(options: KeyedScheduleRecurringInputOptions<TPayload>): KeyedScheduledTaskHandle;
    dispose(): void;
    private dispatchIntoRuntime;
}
