import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { createContextNotesPlugin } from '../integrations/extensions/context-notes.js';
import { InMemoryContextNoteStore } from '../integrations/state/context-note-store.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('context note store', () => {
  it('injects stored notes into runtime context', async () => {
    const store = new InMemoryContextNoteStore();
    await store.set('runtime-notes', {
      id: 'goal',
      title: 'Current Goal',
      text: 'Grow the blacksmith shop reputation.',
    });

    const seenTitles: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-notes',
      model: new FakeStepModelAdapter((request) => {
        seenTitles.push(...request.context.map((entry) => entry.title));
        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.use(
      createContextNotesPlugin({
        store,
      }),
    );

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'hello' },
    });
    await runtime.run();

    expect(seenTitles).toContain('Current Goal');
  });

  it('reflects note removal in later runs', async () => {
    const store = new InMemoryContextNoteStore();
    await store.set('runtime-notes-remove', {
      id: 'temporary-note',
      title: 'Temporary Note',
      text: 'This should disappear.',
    });

    const seenTitles: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-notes-remove',
      model: new FakeStepModelAdapter((request) => {
        seenTitles.push(request.context.map((entry) => entry.title).join('|'));
        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.use(
      createContextNotesPlugin({
        store,
      }),
    );

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'first' },
    });
    await runtime.run();

    await store.remove('runtime-notes-remove', 'temporary-note');

    await runtime.dispatch({
      id: 'input-2',
      type: 'event',
      payload: { message: 'second' },
    });
    await runtime.run();

    expect(seenTitles[0]).toContain('Temporary Note');
    expect(seenTitles[1]).not.toContain('Temporary Note');
  });
});
