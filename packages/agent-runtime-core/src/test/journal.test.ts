import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { getStepContextText } from '../core/step-context.js';
import { createJournalInputHistoryPlugin } from '../integrations/extensions/journal-input-history.js';
import { createJournalHistoryPlugin } from '../integrations/extensions/journal-history.js';
import { createRuntimeJournalPlugin } from '../integrations/extensions/runtime-journal.js';
import { InMemoryRuntimeJournal } from '../integrations/journal/in-memory-runtime-journal.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime journal', () => {
  it('records inputs and steps into the journal', async () => {
    const journal = new InMemoryRuntimeJournal();
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-journal',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    runtime.use(createRuntimeJournalPlugin({
      journal,
    }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'hello' },
    });
    await runtime.run();

    const snapshot = await journal.readSnapshot('runtime-journal');

    expect(snapshot.inputs).toHaveLength(1);
    expect(snapshot.steps).toHaveLength(1);
  });

  it('can inject historical journal steps into a later runtime', async () => {
    const journal = new InMemoryRuntimeJournal();
    const writerRuntime = new AgentRuntime({
      runtimeId: 'shared-runtime',
      model: new FakeStepModelAdapter((request) => ({
        segments: [{ kind: 'message', text: `writer-step-${request.stepNumber}` }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    writerRuntime.use(createRuntimeJournalPlugin({
      journal,
    }));

    await writerRuntime.dispatch({
      id: 'writer-input-1',
      type: 'event',
      payload: { message: 'seed' },
    });
    await writerRuntime.run();

    const seenHistoryTexts: string[] = [];
    const readerRuntime = new AgentRuntime({
      runtimeId: 'shared-runtime',
      model: new FakeStepModelAdapter((request) => {
        const historyEntry = request.context.find((entry) => entry.kind === 'journal-history');

        if (historyEntry) {
          seenHistoryTexts.push(getStepContextText(historyEntry));
        }

        return {
          segments: [{ kind: 'message', text: 'reader-step' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    readerRuntime.use(createJournalHistoryPlugin({
      journal,
    }));

    await readerRuntime.dispatch({
      id: 'reader-input-1',
      type: 'event',
      payload: { message: 'use history' },
    });
    await readerRuntime.run();

    expect(seenHistoryTexts).toEqual(['writer-step-1']);
  });

  it('can inject historical journal inputs into a later runtime', async () => {
    const journal = new InMemoryRuntimeJournal();
    const writerRuntime = new AgentRuntime({
      runtimeId: 'shared-input-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'writer-step' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    writerRuntime.use(createRuntimeJournalPlugin({
      journal,
    }));

    await writerRuntime.dispatch({
      id: 'writer-input-1',
      type: 'chat',
      payload: { text: 'remember me' },
    });
    await writerRuntime.run();

    const seenHistoryInputTexts: string[] = [];
    const readerRuntime = new AgentRuntime({
      runtimeId: 'shared-input-runtime',
      model: new FakeStepModelAdapter((request) => {
        const historyEntry = request.context.find((entry) => entry.kind === 'journal-input-history');

        if (historyEntry) {
          seenHistoryInputTexts.push(getStepContextText(historyEntry));
        }

        return {
          segments: [{ kind: 'message', text: 'reader-step' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    readerRuntime.use(createJournalInputHistoryPlugin({
      journal,
    }));

    await readerRuntime.dispatch({
      id: 'reader-input-1',
      type: 'chat',
      payload: { text: 'use input history' },
    });
    await readerRuntime.run();

    expect(seenHistoryInputTexts).toEqual(['{\n  "text": "remember me"\n}']);
  });
});
