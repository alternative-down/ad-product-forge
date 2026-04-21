import { describe, expect, it } from 'vitest';

import { RuntimeEventStream } from '../core/runtime-events.js';
import { AgentRuntime } from '../core/runtime.js';
import { RuntimeMessageStream } from '../integrations/runtime/runtime-message-stream.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime message stream', () => {
  it('emits step messages from runtime after-step events', async () => {
    const eventStream = new RuntimeEventStream();
    const messageStream = new RuntimeMessageStream({
      subscribe: eventStream.subscribe.bind(eventStream),
    });
    const runtime = new AgentRuntime({
      runtimeId: 'message-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'hello from runtime' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    runtime.observe(eventStream.createObserver());

    await runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await runtime.run();

    const event = await messageStream.next({ timeoutMs: 50 });

    expect(event?.text).toBe('hello from runtime');
    messageStream.close();
  });
});
