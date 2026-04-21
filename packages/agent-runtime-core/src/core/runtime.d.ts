import { type ActionExecutionStrategy } from './action-execution.js';
import { type RuntimeActionDefinition } from './actions.js';
import { type ContinuationResolver } from './continuation.js';
import { type ContextFormatter } from './context-formatters.js';
import { type InputBatchingStrategy } from './input-batching.js';
import { type StepModelAdapter } from './model.js';
import { type RuntimeObserver } from './observers.js';
import { type RuntimePlugin } from './plugins.js';
import type { RunExecutionResult, RuntimeInput, RuntimeSnapshot, RuntimeStepStream, StepExecutionResult } from './types.js';
export type AgentRuntimeOptions = {
    runtimeId?: string;
    model: StepModelAdapter;
    contextFormatter?: ContextFormatter;
    inputBatching?: InputBatchingStrategy;
    actionExecution?: ActionExecutionStrategy;
    continuationResolver?: ContinuationResolver;
};
export declare class AgentRuntime {
    private readonly runtimeId;
    private readonly model;
    private readonly contextFormatter;
    private readonly inputBatching;
    private readonly actionExecution;
    private readonly continuationResolver;
    private readonly actions;
    private readonly plugins;
    private readonly observers;
    private readonly pendingInputs;
    private readonly steps;
    private lastActionResults;
    private status;
    private continuationRequested;
    constructor(options: AgentRuntimeOptions);
    registerAction<TInput extends Record<string, unknown>, TOutput>(action: RuntimeActionDefinition<TInput, TOutput>): void;
    use(plugin: RuntimePlugin): void;
    observe(observer: RuntimeObserver): void;
    dispatch<TPayload>(input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    }): Promise<void>;
    step(): Promise<StepExecutionResult | null>;
    streamStep(): Promise<RuntimeStepStream | null>;
    run(options?: {
        maxSteps?: number;
    }): Promise<RunExecutionResult>;
    resetState(): void;
    restoreSnapshot(snapshot: RuntimeSnapshot): void;
    getSnapshot(): RuntimeSnapshot;
    private buildStepContext;
    private executeActions;
    private setStatus;
    private executeStreamStep;
}
