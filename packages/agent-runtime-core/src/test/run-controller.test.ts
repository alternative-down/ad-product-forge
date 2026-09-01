import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { RuntimeRunController } from '../integrations/runtime/run-controller.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('RuntimeRunController', () => {
  it('runs multiple steps while continueAfterStep keeps the loop alive', async () => {
    const seenSteps: number[] = [];
    const seenDelays: number[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-run-controller',
      model: new FakeStepModelAdapter((request) => ({
        segments: [
          {
            kind: 'message',
            text: `step-${request.stepNumber}`,
          },
        ],
        actionRequests: [],
        continuation: request.stepNumber < 2 ? 'continue' : 'stop',
      })),
    });
    const controller = new RuntimeRunController({ runtime });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'run' },
    });

    const result = await controller.run({
      resolveDelayMs() {
        return 1;
      },
      afterStep(context) {
        seenSteps.push(context.latestStep.stepNumber);
      },
      beforeDelay(context) {
        seenDelays.push(context.delayMs);
      },
      continueAfterStep(context) {
        return context.latestStep.stepNumber < 2;
      },
    });

    expect(seenSteps).toEqual([1, 2]);
    expect(seenDelays).toEqual([1]);
    expect(result.stopReason).toBe('idle');
  });

  it('stops when the abort signal is already aborted', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-run-controller-abort',
      model: new FakeStepModelAdapter(() => ({
        segments: [],
        actionRequests: [],
        continuation: 'stop',
      })),
    });
    const controller = new RuntimeRunController({ runtime });
    const abortController = new AbortController();

    abortController.abort();

    const result = await controller.run({
      signal: abortController.signal,
    });

    expect(result.stopReason).toBe('aborted');
    expect(result.steps).toHaveLength(0);
  });
});
