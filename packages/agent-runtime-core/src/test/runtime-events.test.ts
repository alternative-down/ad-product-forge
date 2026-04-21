import { describe, expect, it } from 'vitest';

import { RuntimeEventStream } from '../core/runtime-events.js';
import { AgentRuntime } from '../core/runtime.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime event stream', () => {
  it('captures runtime lifecycle events through an observer bridge', async () => {
    const eventStream = new RuntimeEventStream();
    const runtime = new AgentRuntime({
      runtimeId: 'event-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'handled' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    runtime.observe(eventStream.createObserver());

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
    });
    await runtime.run();

    const events = eventStream.drain();

    expect(events.map((event) => event.type)).toContain('dispatch');
    expect(events.map((event) => event.type)).toContain('after-step');
  });

  it('supports awaiting the next event with a timeout', async () => {
    const eventStream = new RuntimeEventStream();
    const timeoutResult = await eventStream.next({ timeoutMs: 5 });

    expect(timeoutResult).toBeNull();
  });
});
