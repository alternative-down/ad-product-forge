import { randomUUID } from 'node:crypto';

import { AsyncEventChannel } from './async-event-channel.js';
import {
  createSequentialActionExecutionStrategy,
  type ActionExecutionStrategy,
} from './action-execution.js';
import { RuntimeActionRegistry, type RuntimeActionDefinition } from './actions.js';
import {
  createDefaultContinuationResolver,
  type ContinuationResolver,
} from './continuation.js';
import { createDefaultContextFormatter, type ContextFormatter } from './context-formatters.js';
import {
  createConsumeAllInputBatchingStrategy,
  type InputBatchingStrategy,
} from './input-batching.js';
import {
  supportsStreamingStepModel,
  type StepModelAdapter,
  type StreamingStepModelAdapter,
} from './model.js';
import { RuntimeObserverRegistry, type RuntimeObserver } from './observers.js';
import { RuntimePluginRegistry, type RuntimePlugin } from './plugins.js';
import { runtimeSnapshotSchema } from './snapshot-schema.js';
import type {
  ActionResult,
  RunExecutionResult,
  RuntimeInput,
  RuntimeSnapshot,
  RuntimeStepStream,
  RuntimeStepStreamEvent,
  RuntimeStatus,
  StepActionDescriptor,
  StepContextEntry,
  StepExecutionResult,
  StepModelRequest,
  StepRecord,
} from './types.js';

export type AgentRuntimeOptions = {
  runtimeId?: string;
  model: StepModelAdapter;
  contextFormatter?: ContextFormatter;
  inputBatching?: InputBatchingStrategy;
  actionExecution?: ActionExecutionStrategy;
  continuationResolver?: ContinuationResolver;
};

export class AgentRuntime {
  private readonly runtimeId: string;
  private readonly model: StepModelAdapter;
  private readonly contextFormatter: ContextFormatter;
  private readonly inputBatching: InputBatchingStrategy;
  private readonly actionExecution: ActionExecutionStrategy;
  private readonly continuationResolver: ContinuationResolver;
  private readonly actions = new RuntimeActionRegistry();
  private readonly plugins = new RuntimePluginRegistry();
  private readonly observers = new RuntimeObserverRegistry();
  private readonly pendingInputs: RuntimeInput[] = [];
  private readonly steps: StepRecord[] = [];
  private lastActionResults: ActionResult[] = [];
  private status: RuntimeStatus = 'idle';
  private continuationRequested = false;

  constructor(options: AgentRuntimeOptions) {
    this.runtimeId = options.runtimeId ?? randomUUID();
    this.model = options.model;
    this.contextFormatter = options.contextFormatter ?? createDefaultContextFormatter();
    this.inputBatching = options.inputBatching ?? createConsumeAllInputBatchingStrategy();
    this.actionExecution = options.actionExecution ?? createSequentialActionExecutionStrategy();
    this.continuationResolver = options.continuationResolver ?? createDefaultContinuationResolver();
  }

  registerAction<TInput extends Record<string, unknown>, TOutput>(
    action: RuntimeActionDefinition<TInput, TOutput>,
  ) {
    this.actions.register(action);
  }

  use(plugin: RuntimePlugin) {
    this.plugins.use(plugin);
  }

  observe(observer: RuntimeObserver) {
    this.observers.add(observer);
  }

  async dispatch<TPayload>(input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string }) {
    const normalizedInput: RuntimeInput<TPayload> = {
      ...input,
      receivedAt: input.receivedAt ?? new Date().toISOString(),
    };

    this.pendingInputs.push(normalizedInput);

    for (const plugin of this.plugins.list()) {
      await plugin.onDispatch?.({
        runtimeId: this.runtimeId,
        input: normalizedInput,
      });
    }

    for (const observer of this.observers.list()) {
      await observer.onDispatch?.({
        runtimeId: this.runtimeId,
        input: normalizedInput,
      });
    }
  }

  async step(): Promise<StepExecutionResult | null> {
    if (this.pendingInputs.length === 0 && !this.continuationRequested) {
      return null;
    }

    await this.setStatus('running');

    try {
      const stepId = randomUUID();
      const stepNumber = this.steps.length + 1;
      const startedAt = new Date().toISOString();
      const inputBatch = this.inputBatching.select(this.pendingInputs);
      const currentInputs = inputBatch.selected;
      this.pendingInputs.splice(0, this.pendingInputs.length, ...inputBatch.remaining);
      const context = await this.buildStepContext(stepId, stepNumber, currentInputs);
      const request = await this.resolveModelRequest({
        pendingInputs: currentInputs,
        runtimeId: this.runtimeId,
        stepId,
        stepNumber,
        context,
        actions: this.actions.describe(),
      });
      const modelResponse = await this.model.generateStep(request);

      for (const plugin of this.plugins.list()) {
        await plugin.onAfterModel?.({
          runtimeId: this.runtimeId,
          stepId,
          stepNumber,
          response: modelResponse,
        });
      }

      for (const observer of this.observers.list()) {
        await observer.onAfterModel?.({
          runtimeId: this.runtimeId,
          stepId,
          stepNumber,
          response: modelResponse,
        });
      }

      const actionResults = await this.executeActions(stepId, stepNumber, modelResponse.actionRequests);

      if (actionResults.length > 0) {
        for (const plugin of this.plugins.list()) {
          await plugin.onAfterActions?.({
            runtimeId: this.runtimeId,
            stepId,
            stepNumber,
            actionResults,
          });
        }

        for (const observer of this.observers.list()) {
          await observer.onAfterActions?.({
            runtimeId: this.runtimeId,
            stepId,
            stepNumber,
            actionResults,
          });
        }
      }

      this.lastActionResults = actionResults;
      const continuation = this.continuationResolver({
        modelResponse,
        actionResults,
        pendingInputsRemaining: this.pendingInputs.length,
      });
      this.continuationRequested = continuation === 'continue';

      const record: StepRecord = {
        id: stepId,
        stepNumber,
        inputs: currentInputs,
        context,
        modelResponse,
        modelUsage: modelResponse.usage ?? null,
        modelMetadata: modelResponse.metadata ?? null,
        actionResults,
        continuation,
        startedAt,
        finishedAt: new Date().toISOString(),
      };

      this.steps.push(record);
      await this.setStatus('idle');
      const snapshot = this.getSnapshot();

      for (const plugin of this.plugins.list()) {
        await plugin.onAfterStep?.({
          runtimeId: this.runtimeId,
          record,
          snapshot,
        });
      }

      for (const observer of this.observers.list()) {
        await observer.onAfterStep?.({
          runtimeId: this.runtimeId,
          record,
          snapshot,
        });
      }

      return {
        record,
        snapshot,
      };
    } catch (err) {
      console.error(`[runtime] step() failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      await this.setStatus('idle');
    }
  }

  async streamStep(): Promise<RuntimeStepStream | null> {
    if (this.pendingInputs.length === 0 && !this.continuationRequested) {
      return null;
    }

    if (!supportsStreamingStepModel(this.model)) {
      const result = await this.step();

      if (!result) {
        return null;
      }

      const events = new AsyncEventChannel<RuntimeStepStreamEvent>();

      events.publish({
        type: 'step-complete',
        runtimeId: this.runtimeId,
        record: result.record,
        snapshot: result.snapshot,
      });
      events.close();

      return {
        events,
        completion: Promise.resolve(result),
      };
    }

    await this.setStatus('running');

    const stepId = randomUUID();
    const stepNumber = this.steps.length + 1;
    const startedAt = new Date().toISOString();
    const inputBatch = this.inputBatching.select(this.pendingInputs);
    const currentInputs = inputBatch.selected;
    this.pendingInputs.splice(0, this.pendingInputs.length, ...inputBatch.remaining);
    const context = await this.buildStepContext(stepId, stepNumber, currentInputs);
    const request = await this.resolveModelRequest({
      pendingInputs: currentInputs,
      runtimeId: this.runtimeId,
      stepId,
      stepNumber,
      context,
      actions: this.actions.describe(),
    });
    const events = new AsyncEventChannel<RuntimeStepStreamEvent>();
    const completion = this.executeStreamStep({
      stepId,
      stepNumber,
      startedAt,
      currentInputs,
      request,
      events,
    });

    return {
      events,
      completion,
    };
  }

  async run(options: { maxSteps?: number } = {}): Promise<RunExecutionResult> {
    const maxSteps = options.maxSteps ?? 20;
    const records: StepRecord[] = [];

    while (records.length < maxSteps) {
      const result = await this.step();

      if (!result) {
        break;
      }

      records.push(result.record);

      if (result.record.continuation !== 'continue') {
        break;
      }
    }

    return {
      steps: records,
      snapshot: this.getSnapshot(),
    };
  }

  resetState() {
    this.pendingInputs.splice(0, this.pendingInputs.length);
    this.steps.splice(0, this.steps.length);
    this.lastActionResults = [];
    this.continuationRequested = false;
    this.status = 'idle';
  }

  requestContinuation() {
    this.continuationRequested = true;
  }

  restoreSnapshot(snapshot: RuntimeSnapshot) {
    const normalizedSnapshot = runtimeSnapshotSchema.parse(snapshot);
    const lastStep = normalizedSnapshot.steps.at(-1) ?? null;

    this.pendingInputs.splice(0, this.pendingInputs.length, ...normalizedSnapshot.pendingInputs);
    this.steps.splice(0, this.steps.length, ...normalizedSnapshot.steps);
    this.lastActionResults = [...normalizedSnapshot.lastActionResults];
    this.continuationRequested = lastStep?.continuation === 'continue';
    this.status = 'idle';
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      runtimeId: this.runtimeId,
      status: this.status,
      pendingInputs: [...this.pendingInputs],
      lastActionResults: [...this.lastActionResults],
      steps: [...this.steps],
    };
  }

  private async buildStepContext(
    stepId: string,
    stepNumber: number,
    currentInputs: RuntimeInput[],
  ): Promise<StepContextEntry[]> {
    const context: StepContextEntry[] = currentInputs
      .map((input) => this.contextFormatter.formatInput(input))
      .filter((entry): entry is StepContextEntry => entry !== null);

    if (this.lastActionResults.length > 0) {
      context.push(
        this.contextFormatter.formatActionResults(stepNumber - 1, this.lastActionResults),
      );
    }

    for (const plugin of this.plugins.list()) {
      const contributedContext = await plugin.provideContext?.({
        runtimeId: this.runtimeId,
        stepId,
        stepNumber,
        pendingInputs: currentInputs,
        lastActionResults: this.lastActionResults,
        steps: this.steps,
      });

      if (!contributedContext || contributedContext.length === 0) {
        continue;
      }

      context.push(...contributedContext);
    }

    return context;
  }

  private async resolveModelRequest(
    input: {
      pendingInputs: RuntimeInput[];
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      context: StepContextEntry[];
      actions: StepActionDescriptor[];
    },
  ): Promise<StepModelRequest> {
    let resolvedRequest: StepModelRequest = {
      runtimeId: input.runtimeId,
      stepId: input.stepId,
      stepNumber: input.stepNumber,
      context: input.context,
      actions: input.actions,
    };

    for (const plugin of this.plugins.list()) {
      const partialRequest = await plugin.resolveModelRequest?.({
        runtimeId: this.runtimeId,
        stepId: input.stepId,
        stepNumber: input.stepNumber,
        pendingInputs: [...input.pendingInputs],
        lastActionResults: this.lastActionResults,
        steps: [...this.steps],
        request: resolvedRequest,
      });

      if (!partialRequest) {
        continue;
      }

      resolvedRequest = {
        ...resolvedRequest,
        ...partialRequest,
        providerOptions: partialRequest.providerOptions
          ? {
            ...(resolvedRequest.providerOptions ?? {}),
            ...partialRequest.providerOptions,
          }
          : resolvedRequest.providerOptions,
      };
    }

    return resolvedRequest;
  }

  private async executeActions(
    stepId: string,
    stepNumber: number,
    actionRequests: Array<{ name: string; input: Record<string, unknown> }>,
  ) {
    return this.actionExecution.execute(actionRequests, (actionRequest) => (
      this.actions.execute(actionRequest.name, actionRequest.input, {
        runtimeId: this.runtimeId,
        stepId,
        stepNumber,
      })
    ));
  }

  private async setStatus(status: RuntimeStatus) {
    if (this.status === status) {
      return;
    }

    this.status = status;

    for (const observer of this.observers.list()) {
      await observer.onStatusChanged?.({
        runtimeId: this.runtimeId,
        status,
      });
    }
  }

  private async executeStreamStep(input: {
    stepId: string;
    stepNumber: number;
    startedAt: string;
    currentInputs: RuntimeInput[];
    request: StepModelRequest;
    events: AsyncEventChannel<RuntimeStepStreamEvent>;
  }): Promise<StepExecutionResult> {
    const streamingModel = this.model as StreamingStepModelAdapter;

    try {
      const modelStream = await streamingModel.streamStep(input.request);

      for await (const event of modelStream.events) {
        if (event.type === 'segment-delta') {
          input.events.publish({
            type: 'segment-delta',
            runtimeId: this.runtimeId,
            stepId: input.stepId,
            stepNumber: input.stepNumber,
            segment: event.segment,
          });
          continue;
        }

        input.events.publish({
          type: 'action-request',
          runtimeId: this.runtimeId,
          stepId: input.stepId,
          stepNumber: input.stepNumber,
          actionRequest: event.actionRequest,
        });
      }

      const modelResponse = await modelStream.response;

      for (const plugin of this.plugins.list()) {
        await plugin.onAfterModel?.({
          runtimeId: this.runtimeId,
          stepId: input.stepId,
          stepNumber: input.stepNumber,
          response: modelResponse,
        });
      }

      for (const observer of this.observers.list()) {
        await observer.onAfterModel?.({
          runtimeId: this.runtimeId,
          stepId: input.stepId,
          stepNumber: input.stepNumber,
          response: modelResponse,
        });
      }

      const actionResults = await this.executeActions(
        input.stepId,
        input.stepNumber,
        modelResponse.actionRequests,
      );

      if (actionResults.length > 0) {
        for (const plugin of this.plugins.list()) {
          await plugin.onAfterActions?.({
            runtimeId: this.runtimeId,
            stepId: input.stepId,
            stepNumber: input.stepNumber,
            actionResults,
          });
        }

        for (const observer of this.observers.list()) {
          await observer.onAfterActions?.({
            runtimeId: this.runtimeId,
            stepId: input.stepId,
            stepNumber: input.stepNumber,
            actionResults,
          });
        }

        input.events.publish({
          type: 'action-results',
          runtimeId: this.runtimeId,
          stepId: input.stepId,
          stepNumber: input.stepNumber,
          actionResults,
        });
      }

      this.lastActionResults = actionResults;
      const continuation = this.continuationResolver({
        modelResponse,
        actionResults,
        pendingInputsRemaining: this.pendingInputs.length,
      });
      this.continuationRequested = continuation === 'continue';

      const record: StepRecord = {
        id: input.stepId,
        stepNumber: input.stepNumber,
        inputs: input.currentInputs,
        context: input.request.context,
        modelResponse,
        modelUsage: modelResponse.usage ?? null,
        modelMetadata: modelResponse.metadata ?? null,
        actionResults,
        continuation,
        startedAt: input.startedAt,
        finishedAt: new Date().toISOString(),
      };

      this.steps.push(record);
      await this.setStatus('idle');
      const snapshot = this.getSnapshot();

      for (const plugin of this.plugins.list()) {
        await plugin.onAfterStep?.({
          runtimeId: this.runtimeId,
          record,
          snapshot,
        });
      }

      for (const observer of this.observers.list()) {
        await observer.onAfterStep?.({
          runtimeId: this.runtimeId,
          record,
          snapshot,
        });
      }

      input.events.publish({
        type: 'step-complete',
        runtimeId: this.runtimeId,
        record,
        snapshot,
      });

      return {
        record,
        snapshot,
      };
    } catch (error) {
      input.events.publish({
        type: 'error',
        runtimeId: this.runtimeId,
        stepId: input.stepId,
        stepNumber: input.stepNumber,
        error,
      });
      throw error;
    } finally {
      await this.setStatus('idle');
      input.events.close();
    }
  }
}
