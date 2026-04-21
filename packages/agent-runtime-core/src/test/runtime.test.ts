import { createParallelActionExecutionStrategy } from '../core/action-execution.js';
import { createDefaultContextFormatter } from '../core/context-formatters.js';
import { createFixedSizeInputBatchingStrategy } from '../core/input-batching.js';
import { createTextStepContextEntry, getStepContextText } from '../core/step-context.js';
import type { StepModelRequest } from '../core/types.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AgentRuntime } from '../core/runtime.js';
import { RuntimeRunController } from '../integrations/runtime/run-controller.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('AgentRuntime', () => {
  it('runs a single step from dispatched input', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-1',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
    });

    const result = await runtime.step();

    expect(result).not.toBeNull();
    expect(result?.record.stepNumber).toBe(1);
    expect(result?.record.inputs).toHaveLength(1);
    expect(result?.record.modelResponse.segments[0]?.text).toBe('ok');
    expect(result?.snapshot.pendingInputs).toHaveLength(0);
  });

  it('executes actions and carries results into the next step', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-2',
      model: new FakeStepModelAdapter((request: StepModelRequest) => {
        if (request.stepNumber === 1) {
          return {
            segments: [{ kind: 'message', text: 'calling action' }],
            actionRequests: [{ name: 'sum', input: { left: 2, right: 3 } }],
            continuation: 'continue',
          };
        }

        const previousActionResults = request.context.find((entry) => entry.kind === 'action-results');

        expect(previousActionResults ? getStepContextText(previousActionResults) : null).toContain('"output": 5');

        return {
          segments: [{ kind: 'message', text: 'done' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.registerAction({
      name: 'sum',
      description: 'Add two integers',
      inputSchema: z.object({
        left: z.number(),
        right: z.number(),
      }),
      execute(input: { left: number; right: number }) {
        return input.left + input.right;
      },
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'run' },
    });

    const controller = new RuntimeRunController({ runtime });
    const result = await controller.run({
      continueAfterStep(context) {
        return context.latestStep.stepNumber === 1;
      },
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.actionResults[0]?.output).toBe(5);
    expect(result.steps[1]?.modelResponse.segments[0]?.text).toBe('done');
  });

  it('lets plugins contribute context and receive after-step callbacks', async () => {
    const seenTitles: string[] = [];
    const afterStepIds: string[] = [];

    const runtime = new AgentRuntime({
      runtimeId: 'runtime-3',
      model: new FakeStepModelAdapter((request: StepModelRequest) => {
        seenTitles.push(...request.context.map((entry) => entry.title));
        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.use({
      name: 'extra-context',
      provideContext() {
        return [{
          ...createTextStepContextEntry({
            id: 'plugin-entry',
            kind: 'plugin',
            title: 'Plugin Context',
            text: 'extra',
          }),
        }];
      },
      onAfterStep(context: { record: { id: string } }) {
        afterStepIds.push(context.record.id);
      },
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { value: 1 },
    });

    await runtime.step();

    expect(seenTitles).toContain('Plugin Context');
    expect(afterStepIds).toHaveLength(1);
  });

  it('notifies observers about runtime lifecycle changes', async () => {
    const seenStatuses: string[] = [];
    const seenDispatches: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-observers',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    runtime.observe({
      name: 'test-observer',
      onDispatch(context) {
        seenDispatches.push(context.input.id);
      },
      onStatusChanged(context) {
        seenStatuses.push(context.status);
      },
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { value: 'watch' },
    });
    await runtime.run();

    expect(seenDispatches).toEqual(['input-1']);
    expect(seenStatuses).toEqual(['running', 'idle']);
  });

  it('accepts a custom context formatter', async () => {
    const seenTexts: string[] = [];
    const defaultFormatter = createDefaultContextFormatter();
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-custom-formatter',
      contextFormatter: {
        formatInput(input) {
          return createTextStepContextEntry({
            id: input.id,
            kind: `custom:${input.type}`,
            title: `Custom ${input.type}`,
            text: `payload=${String((input.payload as { value: string }).value)}`,
          });
        },
        formatActionResults(previousStepNumber, actionResults) {
          const base = defaultFormatter.formatActionResults(previousStepNumber, actionResults);
          return createTextStepContextEntry({
            ...base,
            text: `results=${actionResults.length}`,
          });
        },
      },
      model: new FakeStepModelAdapter((request: StepModelRequest) => {
        seenTexts.push(...request.context.map((entry) => getStepContextText(entry)));
        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { value: 'hello' },
    });

    await runtime.step();

    expect(seenTexts).toContain('payload=hello');
  });

  it('supports configurable input batching', async () => {
    const seenBatchSizes: number[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-input-batching',
      inputBatching: createFixedSizeInputBatchingStrategy(1),
      model: new FakeStepModelAdapter((request: StepModelRequest) => {
        seenBatchSizes.push(
          request.context.filter((entry) => entry.kind.startsWith('input:')).length,
        );
        return {
          segments: [{ kind: 'message', text: `step-${request.stepNumber}` }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { value: 'first' },
    });
    await runtime.dispatch({
      id: 'input-2',
      type: 'event',
      payload: { value: 'second' },
    });

    const runResult = await runtime.run();

    expect(runResult.steps).toHaveLength(2);
    expect(runResult.steps[0]?.inputs).toHaveLength(1);
    expect(runResult.steps[1]?.inputs).toHaveLength(1);
    expect(seenBatchSizes).toEqual([1, 1]);
  });

  it('supports configurable action execution strategy', async () => {
    const executionMoments: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-action-execution',
      actionExecution: createParallelActionExecutionStrategy(),
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'actions' }],
        actionRequests: [
          { name: 'record', input: { label: 'first', delayMs: 20 } },
          { name: 'record', input: { label: 'second', delayMs: 0 } },
        ],
        continuation: 'stop',
      })),
    });

    runtime.registerAction({
      name: 'record',
      description: 'Record execution order',
      inputSchema: z.object({
        label: z.string(),
        delayMs: z.number(),
      }),
      async execute(input: { label: string; delayMs: number }) {
        await new Promise((resolve) => setTimeout(resolve, input.delayMs));
        executionMoments.push(input.label);
        return input.label;
      },
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'run actions' },
    });

    const result = await runtime.step();

    expect(result?.record.actionResults).toHaveLength(2);
    expect(executionMoments).toEqual(['second', 'first']);
  });

  it('can reset runtime state without removing actions or plugins', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-reset',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { value: 'first' },
    });
    await runtime.run();

    expect(runtime.getSnapshot().steps).toHaveLength(1);

    runtime.resetState();

    const snapshot = runtime.getSnapshot();

    expect(snapshot.steps).toHaveLength(0);
    expect(snapshot.pendingInputs).toHaveLength(0);
    expect(snapshot.lastActionResults).toHaveLength(0);
    expect(snapshot.status).toBe('idle');
  });
});
