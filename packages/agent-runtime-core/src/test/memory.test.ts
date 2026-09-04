import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { createOperationalMemoryPlugin } from '../integrations/extensions/operational-memory.js';
import { InMemoryOperationalMemory } from '../integrations/memory/in-memory-operational-memory.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('memory modules', () => {
  it('consolidates operational overflow into observations', async () => {
    const memory = new InMemoryOperationalMemory({
      recentReserveUnits: 8,
      observer: {
        async observe(request) {
          return {
            text: request.entries.map((entry) => entry.text).join('\n---\n'),
          };
        },
      },
    });
    const runtime = new AgentRuntime({
      runtimeId: 'operational-memory-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'handled' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    runtime.use(createOperationalMemoryPlugin({ memory }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'chat',
      payload: { text: 'first large input' },
    });
    await runtime.dispatch({
      id: 'input-2',
      type: 'chat',
      payload: { text: 'second large input' },
    });
    await runtime.run();

    const snapshot = await memory.getSnapshot();

    expect(snapshot.observations.length).toBeGreaterThan(0);
    expect(snapshot.recentRaw.length).toBeGreaterThan(0);
  });
});
