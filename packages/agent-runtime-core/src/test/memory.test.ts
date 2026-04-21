import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { getStepContextText } from '../core/step-context.js';
import { createLongTermRecallPlugin } from '../integrations/extensions/long-term-recall.js';
import { createOperationalMemoryPlugin } from '../integrations/extensions/operational-memory.js';
import { InMemoryLongTermMemory } from '../integrations/memory/in-memory-long-term-memory.js';
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

  it('recalls long-term documents through the runtime plugin', async () => {
    const memory = new InMemoryLongTermMemory({
      embedder: {
        async embed(request) {
          return {
            vectors: request.texts.map((text) => embedText(text)),
            dimensions: 4,
          };
        },
      },
    });
    const runtime = new AgentRuntime({
      runtimeId: 'long-term-memory-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'I remember the forge history.' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await memory.write({
      id: 'doc-1',
      text: 'The forge reopened after the caravan arrived in the village.',
    });
    runtime.use(createLongTermRecallPlugin({
      memory,
      threshold: 0,
      buildQuery({ pendingInputs }) {
        const text = pendingInputs[0]?.payload as { text?: string } | undefined;
        return text?.text ?? null;
      },
    }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'player-message',
      payload: { text: 'Do you remember the caravan and the forge?' },
    });
    const result = await runtime.run();
    const recallEntry = result.steps[0]?.context.find((entry) => entry.kind === 'long-term-memory');

    expect(recallEntry ? getStepContextText(recallEntry) : null).toContain('forge reopened');
  });
});

function embedText(text: string) {
  const lowered = text.toLowerCase();
  return [
    lowered.includes('forge') ? 1 : 0,
    lowered.includes('caravan') ? 1 : 0,
    lowered.includes('village') ? 1 : 0,
    Math.min(1, text.length / 100),
  ];
}
