import type { AgentRuntime } from '../../core/runtime.js';
import type { RuntimeSnapshot, StepRecord } from '../../core/types.js';
export type RuntimeRunLoopStopReason = 'idle' | 'continuation' | 'max-steps' | 'aborted';
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
    resolveDelayMs?(context: {
        completedSteps: StepRecord[];
        latestStep: StepRecord;
    }): number;
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
export declare class RuntimeRunController {
    private readonly runtime;
    constructor(options: RuntimeRunControllerOptions);
    run(options?: RuntimeRunLoopOptions): Promise<RuntimeRunLoopResult>;
}
