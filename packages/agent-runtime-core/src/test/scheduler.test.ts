import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { getStepContextText } from '../core/step-context.js';
import { InMemoryRuntimeScheduler } from '../integrations/scheduler/in-memory-runtime-scheduler.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('InMemoryRuntimeScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches delayed input and runs the runtime', async () => {
    vi.useFakeTimers();
    const seenPayloads: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-scheduler',
      model: new FakeStepModelAdapter((request) => {
        const eventEntry = request.context.find((entry) => entry.kind === 'input:event');

        if (eventEntry) {
          seenPayloads.push(getStepContextText(eventEntry));
        }

        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });
    const scheduler = new InMemoryRuntimeScheduler();

    scheduler.scheduleInput({
      target: runtime,
      delayMs: 100,
      input: {
        id: 'input-1',
        type: 'event',
        payload: { value: 'later' },
      },
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(seenPayloads).toEqual(['{\n  "value": "later"\n}']);
    scheduler.dispose();
  });

  it('can cancel recurring input tasks', async () => {
    vi.useFakeTimers();
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-scheduler-cancel',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });
    const scheduler = new InMemoryRuntimeScheduler();
    let counter = 0;

    const handle = scheduler.scheduleRecurringInput({
      target: runtime,
      intervalMs: 50,
      inputFactory() {
        counter += 1;
        return {
          id: `tick-${counter}`,
          type: 'tick',
          payload: { counter },
        };
      },
    });

    await vi.advanceTimersByTimeAsync(120);
    handle.cancel();
    const countAfterCancel = counter;
    await vi.advanceTimersByTimeAsync(200);

    expect(countAfterCancel).toBeGreaterThan(0);
    expect(counter).toBe(countAfterCancel);
    scheduler.dispose();
  });
});
